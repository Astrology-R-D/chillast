'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const ToolProvider = require('../src/core/ai/tools/ToolProvider');
const KnowledgeToolProvider = require('../src/core/ai/tools/KnowledgeToolProvider');
const ConversationToolProvider = require('../src/core/ai/tools/ConversationToolProvider');
const { chartToolResult, sourceSnapshot } = require('../src/core/ai/ToolResult');
const { parseReport } = require('../src/core/ai/AnalysisProtocol');
const { ContextManager, contextHistory } = require('../src/core/ai/ContextManager');
const esm = require('../src/core/ai/esm-bridge');

test('real LangGraph tools retain artifacts, analyst citations, and stream only the writer answer', async () => {
  const doc = { content: '这是可核对的原始知识片段。', fileName: '解释资料.md', source: 'builtin' };
  const source = sourceSnapshot(doc);
  const chart = { meta: { type: 'natal' }, subjects: [{ birthLabel: '2004-07-07 11:15', location: { latitude: 26.6, longitude: 104.8 } }], rings: [{ id: 'natal', label: '本命', points: [{ key: 'sun', nameZh: '太阳', signNameZh: '巨蟹座', degreeInSign: 15, house: 10 }] }], houses: [], aspects: [] };
  class ComputeProvider extends ToolProvider {
    constructor() { super('astro', 'compute'); }
    async _build() {
      const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
      return [new DynamicStructuredTool({ name: 'compute_natal_chart', description: '计算测试盘', schema: require('zod').object({}), func: async () => chartToolResult(chart, '太阳 巨蟹座15° 第10宫') })];
    }
  }
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    let message;
    if (body.messages[0].content.includes('分析 Subagent')) {
      if (!body.messages.some((m) => m.role === 'tool')) message = { role: 'assistant', content: null, tool_calls: [
        { id: 'chart-call', type: 'function', function: { name: 'compute_natal_chart', arguments: '{}' } },
        { id: 'kb-call', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"太阳落宫"}' } },
      ] };
      else message = { role: 'assistant', content: JSON.stringify({ focus: '工作压力', claims: [{ statement: '先核实压力出现的具体情境', support: '本命事实符合来源的落宫条件。', checks: [{ condition: '该解释适用于太阳落入所计算的宫位', status: 'verified', factRefs: ['chart-call/natal:sun'], sourceIds: [source.id] }], factRefs: ['chart-call/natal:sun'], sourceIds: [source.id], limitations: '解释框架需要实际经历核实', question: '最近一次压力是什么情境？' }], questions: [] }) };
    } else message = { role: 'assistant', content: JSON.stringify({ text: '可以先从最近的一次经历说起。', evidenceIds: ['E1'] }) };
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(`data: ${JSON.stringify({ id: `test-${requests.length}`, choices: [{ index: 0, delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: `test-${requests.length}`, choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new AiService({}, {});
    await service._mp.configure({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, maxTokens: 0, contextWindow: 32000 });
    service._configured = true;
    service._registry = new ToolRegistry().register(new ComputeProvider()).register(new KnowledgeToolProvider({ isReady: () => true, retrieve: async () => [doc] }));
    const events = [];
    for await (const event of service.chat([{ role: 'user', content: '分析工作压力' }], { sessionId: 'local' })) events.push(event);
    const calls = events.filter((e) => e.type === 'tool-call' && e.data.status === 'done').map((e) => e.data);
    assert.equal(calls.find((c) => c.tool === 'compute_natal_chart').artifact.data.rings[0].points[0].key, 'sun');
    const report = events.find((e) => e.type === 'analysis-report').data;
    assert.equal(report.sources[0].content, doc.content);
    assert.match(report.claims[0].facts[0].text, /巨蟹座/);
    assert.equal(events.filter((e) => e.type === 'token').map((e) => e.data).join(''), '可以先从最近的一次经历说起。 [判据 1](evidence:E1)\n\n');
    const activity = events.filter((e) => e.type === 'activity').map((e) => e.data);
    assert.equal(activity[0].phase, 'analysis');
    assert.ok(activity.some((a) => a.phase === 'analysis' && a.topic === '太阳落宫'));
    assert.equal(activity.at(-2).phase, 'validation');
    assert.equal(activity.at(-1).phase, 'answer');
    assert.ok(!requests.at(-1).tools, 'writer does not receive tools');
    assert.ok(requests.at(-1).messages.every((m) => m.role !== 'tool'), 'writer does not receive raw tool history');
    assert.ok(requests.every((r) => r.max_tokens > 0 && r.max_tokens < 32000));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('report validation rejects fabricated citations and facts', () => {
  const call = { callId: 'c', artifact: chartToolResult({ rings: [], houses: [], aspects: [] }, '').artifact };
  assert.throws(() => parseReport(JSON.stringify({ focus: 'test', claims: [{ statement: '猜测', sourceIds: ['Sfake'] }] }), [call], 'ctx'), /不存在/);
  assert.throws(() => parseReport(JSON.stringify({ focus: 'test', claims: [{ statement: '猜测', factRefs: ['c/fake'] }] }), [call], 'ctx'), /不存在/);
  assert.throws(() => parseReport(JSON.stringify({ focus: 'test', claims: [{ statement: '猜测' }] }), [call], 'ctx'), /缺少/);
});

test('compression preserves complete archives, user corrections and recent turns', async () => {
  const session = { messages: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'ai' : 'user', content: i === 2 ? '我没有拖延，这是对之前解释的纠正' : `消息${i}` })) };
  const prompts = [];
  const provider = { _settings: { contextWindow: 20000 }, chatModel: () => ({ invoke: async (messages) => { prompts.push(messages); return { content: '【用户纠正】用户明确否定拖延。【当前问题】继续核实经历。' }; } }) };
  const manager = new ContextManager(provider, { esm });
  const original = JSON.stringify(session.messages);
  session.contextSummary = await manager.compressSession(session);
  assert.equal(JSON.stringify(session.messages), original);
  assert.equal(session.contextSummary.coveredMessages, 4);
  assert.match(prompts[0][1].content, /我没有拖延/);
  const history = contextHistory(session);
  assert.equal(history.length, 5);
  assert.match(history[0].content, /用户明确否定拖延/);
  assert.equal(history.at(-1).content, '消息7');
  session.messages[0].content = '被编辑';
  assert.equal(contextHistory(session).length, 8, 'edited prefixes invalidate the summary');
});

test('automatic tool compression retains ToolMessage IDs and leaves artifacts intact', async () => {
  const { SystemMessage, HumanMessage, AIMessage, ToolMessage } = await esm.load('@langchain/core/messages');
  const artifact = { version: 1, kind: 'generic', data: '完整原始结果' };
  const messages = [new SystemMessage('规则'), new HumanMessage('当前问题'), new AIMessage({ content: '', tool_calls: [{ id: 'c', name: 'lookup', args: {} }] }), new ToolMessage({ content: '很长的工具结果'.repeat(1000), tool_call_id: 'c', name: 'lookup', artifact })];
  const provider = { _settings: { contextWindow: 15000 }, chatModel: () => ({ invoke: async () => ({ content: '工具结果摘要' }) }) };
  const manager = new ContextManager(provider, { esm });
  const events = [];
  const result = await manager.prepare(messages, [], { notify: (event) => events.push(event) });
  assert.equal(result[3].tool_call_id, 'c');
  assert.equal(result[3].artifact, artifact);
  assert.ok(result[3].content.length < messages[3].content.length);
  assert.equal(messages[3].content, '很长的工具结果'.repeat(1000));
  assert.ok(events.some((e) => e.compression === 'done'));
});

test('archive retrieval restores original tool sources and facts even when the analysis did not complete', async () => {
  const source = sourceSnapshot({ fileName: '旧版本资料.md', content: '这段历史原文含有独有关键词。', source: 'builtin' });
  const artifact = { version: 1, kind: 'knowledge', data: {}, sources: [source], facts: { original: '计算得到的原始事实' } };
  const original = { callId: 'reused', tool: 'search_knowledge', result: source.content, artifact };
  const session = { id: 's', messages: [
    { role: 'ai', content: '', toolCalls: [original] },
    { role: 'ai', content: '', toolCalls: [{ ...original, result: '另一次结果' }] },
  ] };
  const tools = await new ConversationToolProvider(session).listTools();
  const invoke = (name, args) => tools.find((t) => t.name === name).invoke({ type: 'tool_call', id: 'archive-call', name, args });
  const recalled = await invoke('recall_conversation', { query: '独有关键词', limit: 1 });
  assert.equal(recalled.artifact.sources[0].content, source.content);
  assert.equal(recalled.artifact.facts['message:0/reused/original'], '计算得到的原始事实');
  assert.match(recalled.content, /独有关键词/);
  const ambiguous = await invoke('read_tool_result', { callId: 'reused' });
  assert.match(ambiguous.content, /messageIndex/);
  const precise = await invoke('read_tool_result', { callId: 'reused', messageIndex: 0, sourceId: source.id });
  assert.equal(precise.artifact.sources[0].content, source.content);
  const missing = await invoke('read_tool_result', { callId: 'another-session-call' });
  assert.match(missing.content, /当前会话中没有/);
});
