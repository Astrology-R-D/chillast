'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IpcRouter = require('../src/main/IpcRouter');
function fixture(chat) {
  const handlers = new Map();
  const saved = [];
  const router = new IpcRouter({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    aiService: { chat }, aiSessionStore: { get: () => ({ messages: [] }), appendMessage: (_id, message) => saved.push(message) } });
  router._maybeAutoTitle = () => {};
  router.register();
  return { saved, invoke: () => handlers.get('ai:chat')({}, [{ role: 'user', content: '测试' }], { sessionId: 'session' }) };
}
const call = (callId, status, extra = {}) => ({ type: 'tool-call', data: { callId, tool: 'compute_natal_chart', status, argsDigest: '', resultExcerpt: '', requiresConfirmation: false, ...extra } });
test('persists complete results and associates parallel calls by ID', async () => {
  const fullResult = '完整结果'.repeat(1000);
  const f = fixture(async function* () {
    yield call('a', 'calling', { args: '{"profile":"a"}' });
    yield call('b', 'calling', { args: '{"profile":"b"}' });
    yield call('b', 'done', { result: 'B' });
    yield call('a', 'done', { result: fullResult });
    yield { type: 'token', data: '解读' };
  });
  await f.invoke();
  assert.equal(f.saved[1].toolCalls[0].result, fullResult);
  assert.equal(f.saved[1].toolCalls[1].args, '{"profile":"b"}');
  assert.equal(f.saved[1].toolCalls[1].result, 'B');
});
test('keeps completed and failed calls when a stream errors before producing text', async () => {
  const f = fixture(async function* () { yield call('a', 'calling'); throw new Error('连接中断'); });
  await f.invoke();
  assert.equal(f.saved[1].content, '');
  assert.equal(f.saved[1].toolCalls[0].status, 'error');
  assert.equal(f.saved[1].toolCalls[0].result, '连接中断');
});

test('AI service pairs parallel calls and keeps the entire output, including tool failures', async () => {
  const AiService = require('../src/core/ai/AiService');
  const full = '工具完整输出'.repeat(1000);
  const esm = { load: async (pkg) => pkg === '@langchain/langgraph/prebuilt'
    ? { createReactAgent: () => ({ async *stream() {
      yield ['updates', { agent: { messages: [{ getType: () => 'ai', tool_calls: [
        { id: 'a', name: 'compute_natal_chart', args: { profile: 'A' } },
        { id: 'b', name: 'compute_natal_chart', args: { profile: 'B' } },
      ] }] } }];
      yield ['updates', { tools: { messages: [
        { getType: () => 'tool', tool_call_id: 'b', content: '计算失败', status: 'error' },
        { getType: () => 'tool', tool_call_id: 'a', content: full },
      ] } }];
      yield ['updates', { agent: { messages: [{ getType: () => 'ai', content: '{"focus":"测试","claims":[],"questions":["最近发生了什么具体事情？"]}' }] } }];
    } }) }
    : { HumanMessage: class {}, AIMessage: class {}, SystemMessage: class {} } };
  const service = new AiService({}, {}, null, { esm });
  service._configured = true; service._registry = { getTools: async () => [] };
  service._mp.chatModel = () => ({ async *stream() { yield { content: '回答' }; } });
  const events = [];
  for await (const event of service.chat([{ role: 'user', content: '分析' }], { sessionId: 'service-test' })) if(event.type === 'tool-call') events.push(event.data);
  assert.equal(events[2].callId, 'b');
  assert.equal(events[2].status, 'error');
  assert.equal(events[2].tool, 'compute_natal_chart');
  assert.equal(JSON.parse(events[2].args).profile, 'B');
  assert.equal(events[3].callId, 'a');
  assert.equal(events[3].result, full);
  assert.ok(events[3].resultExcerpt.length <= 200);
});
