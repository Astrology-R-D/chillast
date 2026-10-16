'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ModelProvider = require('../src/core/ai/ModelProvider');

test('connection probes use a bounded output budget and a 60-second deadline instead of 15 seconds', async () => {
  let request;
  class Chat {
    constructor(options) { this.options = options; }
    async invoke(messages, options) { request = { model: this.options, messages, options }; return { content: 'OK' }; }
  }
  const provider = new ModelProvider({ load: async () => ({ ChatOpenAI: Chat }) });
  await provider.configure({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-key', maxTokens: 0, embeddings: { provider: 'none' } });
  const original = AbortSignal.timeout; const deadlines = [];
  AbortSignal.timeout = (ms) => { deadlines.push(ms); return original(ms); };
  try { assert.deepEqual(await provider.testConnection(), { ok: true }); }
  finally { AbortSignal.timeout = original; }
  assert.deepEqual(deadlines, [60000]); assert.equal(request.model.maxTokens, 1024);
  assert.match(request.messages[0].content, /Reply only OK/);
});

test('a timed-out provider reporting Query aborted becomes an actionable timeout without changing the accepted model', async () => {
  class Chat {
    async invoke(_messages, { signal }) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ content: 'late' }), 100);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Query aborted')); }, { once: true });
      });
    }
  }
  const provider = new ModelProvider({ load: async () => ({ ChatOpenAI: Chat }) });
  await provider.configure({ provider: 'deepseek', apiKey: 'test-key', embeddings: { provider: 'none' } });
  const model = provider.chatModel();
  await assert.rejects(provider.testConnection({ timeoutMs: 10 }), /连接测试超时.*诊断日志/);
  assert.equal(provider.chatModel(), model); assert.equal(provider.isConfigured(), true);
});

test('authentication and network failures stay distinct and a chat-only test never starts embeddings', async () => {
  let failure = Object.assign(new Error('bad authentication'), { status: 401 });
  const loaded = [];
  class Chat { async invoke() { throw failure; } }
  const provider = new ModelProvider({ load: async () => ({ ChatOpenAI: Chat }) });
  await provider.configure({ provider: 'deepseek', apiKey: 'test-key', embeddings: { provider: 'none' } });
  await assert.rejects(provider.testConnection(), /认证或权限失败.*401/);
  failure = Object.assign(new Error('connection error'), { cause: { code: 'ENOTFOUND' } });
  await assert.rejects(provider.testConnection(), /无法连接.*网络/);
  failure = null;
  class Ready { async invoke() { return { content: 'OK' }; } }
  await ModelProvider.testWithSettings({ provider: 'deepseek', apiKey: 'test-key', embeddings: { provider: 'local' } }, null, async (pkg) => { loaded.push(pkg); return { ChatOpenAI: Ready }; });
  assert.deepEqual(loaded, ['@langchain/openai']);
});
