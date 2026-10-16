'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const ToolProvider = require('../src/core/ai/tools/ToolProvider');
const esm = require('../src/core/ai/esm-bridge');

async function run(mode) {
  let executed = 0;
  class Provider extends ToolProvider {
    constructor() { super('test', 'test'); }
    async _build() {
      const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
      return [new DynamicStructuredTool({ name: 'lookup', description: '查询资料', schema: require('zod').object({ query: require('zod').string() }),
        func: async () => { executed++; return '取得的真实资料'; } })];
    }
  }
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    const toolCalls = Array.from({ length: mode === 'parallel' ? 40 : 1 }, (_, i) => ({ id: `call-${requests.length}-${i}`, type: 'function', function: { name: 'lookup', arguments: JSON.stringify({ query: mode === 'parallel' ? `查询${i}` : '相同查询' }) } }));
    const message = body.tools?.length && !(mode === 'unlimited' && requests.length > 35) ? { role: 'assistant', content: null, tool_calls: toolCalls } : { role: 'assistant', content: '已有资料整理完成。' };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new AiService({}, {});
    await service._mp.configure({ provider: 'deepseek', model: 'test', apiKey: 'test-local', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, contextWindow: 64000, maxTokens: 0 });
    if (mode === 'repeat') service.setToolCallLimits({ lookup: 2 });
    if (mode === 'unlimited') service.setToolCallLimits({ lookup: 0 });
    service._configured = true; service._registry = new ToolRegistry().register(new Provider());
    const events = [];
    for await (const event of service.chat([{ role: 'user', content: '看看网页动态' }], { sessionId: 'budget' })) events.push(event);
    return { executed, requests, events };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('parallel tool requests execute at most 32 times, mark excess calls as blocked and finalize without tools', async () => {
  const { executed, requests, events } = await run('parallel');
  assert.equal(executed, 32);
  assert.equal(requests.length, 2);
  assert.ok(!requests.at(-1).tools?.length);
  assert.match(requests.at(-1).messages[0].content, /工具已关闭/);
  const blocked = events.filter(e => e.type === 'tool-call' && e.data.artifact?.kind === 'budget');
  assert.equal(blocked.length, 8);
  assert.ok(blocked.every(e => e.data.status === 'error' && e.data.artifact.reason === 'limit'));
  assert.equal(events.find(e => e.type === 'token').data, '已有资料整理完成。');
  assert.equal(events.at(-1).type, 'done');
});

test('configured two-call limit stops before a third query and finalizes', async () => {
  const { executed, requests, events } = await run('repeat');
  assert.equal(executed, 2);
  assert.equal(requests.length, 3);
  assert.ok(!requests.at(-1).tools?.length);
  assert.equal(events.filter(e => e.type === 'tool-call' && e.data.artifact?.reason === 'limit').length, 0);
  assert.equal(events.at(-1).type, 'done');
});


test('independent limits, unlimited repeated calls, snapshots and reset', async () => {
  const service = new AiService({}, {});
  service.setToolCallLimits({ limited: 1, unlimited: 0 });
  const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
  let executed = 0;
  const originals = ['limited', 'unlimited'].map(name => new DynamicStructuredTool({ name, description: name,
    schema: require('zod').object({}), func: async () => { executed++; return 'ok'; } }));
  const tools = await service._budgetTools(originals);
  await tools[0].func({});
  assert.equal(tools.budget.available('limited'), false);
  assert.equal(tools.budget.closed, false);
  assert.equal((await tools[0].func({}))[1].kind, 'budget');
  service.setToolCallLimits({ unlimited: 1 });
  for (let i = 0; i < 50; i++) await tools[1].func({});
  assert.equal(executed, 51);
  const next = await service._budgetTools(originals);
  await next[0].func({}); await next[1].func({});
  assert.equal(next.budget.closed, true);
  for (const invalid of [{ limited: -1 }, { limited: 1.2 }, { limited: '2' }, []]) assert.throws(() => service.setToolCallLimits(invalid));
});

test('registry enumeration includes future tools and conversation tools', async () => {
  const service = new AiService({}, {});
  service._registry = { describe: async () => [{ id: 'future', tools: [{ name: 'new_tool', description: 'new' }] }] };
  service.setToolCallLimits({ new_tool: 0, offline_tool: 7 });
  const descriptors = await service.describeTools();
  assert.equal(descriptors[0].tools[0].callLimit, 0);
  assert.ok(descriptors.find(p => p.id === 'conversation').tools.some(t => t.name === 'read_tool_result'));
  assert.equal(service._lastSettings.toolCallLimits.offline_tool, 7);
});

test('unlimited tool can cross 32 graph rounds with identical input and finish normally', async () => {
  const { executed, requests, events } = await run('unlimited');
  assert.equal(executed, 35);
  assert.equal(requests.length, 36);
  assert.equal(events.at(-1).type, 'done');
});
