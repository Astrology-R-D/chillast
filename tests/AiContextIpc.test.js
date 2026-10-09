'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IpcRouter = require('../src/main/IpcRouter');
const { prefixHash } = require('../src/core/ai/ContextManager');

function fixture(compress) {
  const handlers = new Map(); const events = [];
  const session = { id: 's', messages: [{ role: 'user', content: '旧问题' }, { role: 'ai', content: '旧回复', toolCalls: [{ callId: 'old', result: '完整工具结果' }] }, { role: 'user', content: '当前问题' }] };
  let receivedHistory;
  const store = { get: () => session, appendMessage: (_id, message) => session.messages.push(message), setContextSummary: (_id, summary) => { session.contextSummary = summary; return session; } };
  const ai = {
    contextUsage: async (s) => ({ used: s.contextSummary ? 20 : 100, limit: 100, percent: s.contextSummary ? 20 : 100, needsCompression: !s.contextSummary }),
    compressSession: compress || (async (s) => ({ text: '保留用户纠正的摘要', coveredMessages: 2, prefixHash: prefixHash(s.messages, 2) })),
    async *chat(messages) { receivedHistory = messages; yield { type: 'token', data: '新回复' }; },
  };
  const router = new IpcRouter({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, aiService: ai, aiSessionStore: store });
  router._maybeAutoTitle = () => {};
  const wc = { mainFrame: {}, send: (name, data) => events.push({ name, data }) };
  router.setWebContents(wc); router.register();
  return { session, events, get history() { return receivedHistory; }, invoke: (name, ...args) => handlers.get(name)({ sender: wc, senderFrame: wc.mainFrame }, ...args) };
}
test('full context compresses automatically before sending and keeps raw archives', async () => {
  const f = fixture();
  const result = await f.invoke('ai:chat', [{ role: 'user', content: '新的问题' }], { sessionId: 's', requestId: 'request' });
  assert.equal(result.data.ok, true);
  assert.match(f.history[0].content, /保留用户纠正/);
  assert.equal(f.session.messages[1].toolCalls[0].result, '完整工具结果');
  assert.equal(f.session.messages.length, 5);
  assert.ok(f.events.some((e) => e.name === 'ai:contextChanged' && e.data.compression === 'done'));
  assert.ok(f.events.some((e) => e.name === 'ai:done' && e.data.requestId === 'request'));
});
test('compression failure keeps history and sends a visible failure notice', async () => {
  const f = fixture(async () => { throw new Error('摘要请求失败'); });
  const result = await f.invoke('ai:chat', [{ role: 'user', content: '新的问题' }], { sessionId: 's' });
  assert.equal(result.data.ok, false);
  assert.equal(f.session.contextSummary, undefined);
  assert.equal(f.session.messages[1].toolCalls[0].result, '完整工具结果');
  assert.ok(f.events.some((e) => e.name === 'ai:contextChanged' && e.data.compression === 'error'));
});
test('a request with no older turns exits the history compression state', async () => {
  const f = fixture(async () => null);
  const result = await f.invoke('ai:chat', [{ role: 'user', content: '新的问题' }], { sessionId: 's' });
  assert.equal(result.data.ok, true);
  const states = f.events.filter((e) => e.name === 'ai:contextChanged' && e.data.compression);
  assert.equal(states.at(-1).data.compression, 'done');
  assert.equal(f.session.contextSummary, undefined);
});
test('manual compression locks the session until complete', async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => { release = resolve; }));
  const first = f.invoke('ai:context:compress', 's');
  await Promise.resolve();
  const second = await f.invoke('ai:context:compress', 's');
  assert.equal(second.ok, false);
  assert.match(second.error, /正在生成或压缩/);
  release(null);
  assert.equal((await first).ok, true);
});
