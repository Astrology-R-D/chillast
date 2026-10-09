'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { modelTokenLimits, resolveTokenBudget, estimateInputTokens } = require('../src/core/ai/TokenBudget');
const ModelProvider = require('../src/core/ai/ModelProvider');

test('known DeepSeek names resolve official limits even without a catalog entry', () => {
  for (const model of ['deepseek-flash', 'deepseek-v4-flash']) {
    const settings = { provider: 'deepseek', model, maxTokens: 0 };
    const limits = modelTokenLimits(settings, null);
    assert.deepEqual(limits, { context: 1000000, output: 393216 });
    assert.equal(resolveTokenBudget(settings, limits), 393216);
  }
  assert.equal(resolveTokenBudget({ maxTokens: 0 }, { output: 0, context: 0 }), undefined);
  assert.equal(resolveTokenBudget({ maxTokens: 50000 }, { output: 0, context: 0 }), 50000);
});

test('auto budgets subtract the full input, schemas and a margin, and respect both caps', () => {
  const settings = { maxTokensMode: 'context', maxTokens: 0 };
  const limits = { context: 20000, output: 18000 };
  const messages = [{ role: 'system', content: '规则' }, { role: 'user', content: '问'.repeat(1000) }];
  const tools = [{ name: 'compute', parameters: { type: 'object' } }];
  assert.equal(resolveTokenBudget(settings, limits, messages, tools), 20000 - estimateInputTokens(messages, tools) - 1024);
  assert.equal(resolveTokenBudget({ ...settings, maxTokens: 1000 }, limits, messages, tools), 1000);
  assert.throws(() => resolveTokenBudget(settings, limits, [{ content: '超'.repeat(10000) }]), /超出上下文/);
  assert.throws(() => resolveTokenBudget(settings, { context: 0 }), /上下文窗口/);
});

test('actual model invocations recalculate after tool results and leave the base model unchanged', async () => {
  class ChatModel {
    constructor(options) { this.options = options; }
    async _generate(messages) { return this.options.maxTokens; }
    async *_streamResponseChunks(messages) { yield this.options.maxTokens; }
  }
  const provider = new ModelProvider({ load: async () => ({ ChatOpenAI: ChatModel }) });
  await provider.configure({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test', maxTokens: 0, maxTokensMode: 'context', contextWindow: 20000, maxOutputTokens: 18000 });
  const model = provider.chatModel();
  const first = await model._generate([{ content: '问' }], { tools: [] });
  const second = await model._generate([{ content: '问' }, { content: '工具结果'.repeat(1000) }], { tools: [] });
  assert.ok(second < first);
  assert.equal(model.options.maxTokens, 18000);
  const stream = model._streamResponseChunks([{ content: '工具结果'.repeat(1000) }], { tools: [] });
  assert.equal((await stream.next()).value, resolveTokenBudget(provider._settings, { context: 20000, output: 18000 }, [{ content: '工具结果'.repeat(1000) }], []));
});

test('real ChatOpenAI sends recalculated budgets for bound tools and streaming requests', async () => {
  const http = require('node:http');
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    requests.push(body);
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end('data: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] }) + '\n\ndata: [DONE]\n\n');
    } else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'test', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = new ModelProvider();
    await provider.configure({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, maxTokens: 0, maxTokensMode: 'context', contextWindow: 20000, maxOutputTokens: 18000 });
    const model = provider.chatModel().bindTools([{ type: 'function', function: { name: 'lookup', description: 'lookup', parameters: { type: 'object', properties: { query: { type: 'string' } } } } }]);
    await model.invoke('问');
    const longer = '工具结果'.repeat(1000);
    await model.invoke(longer);
    const stream = await model.stream(longer);
    for await (const chunk of stream) assert.equal(chunk.content, 'ok');
    assert.ok(requests[1].max_tokens < requests[0].max_tokens);
    assert.equal(requests[2].max_tokens, requests[1].max_tokens);
    assert.equal(requests[0].tools[0].function.name, 'lookup');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
