'use strict';
const assert = require('assert');
const AiService = require('../src/core/ai/AiService');
function fixture(chunks, toolUpdates = []) {
  const service = new AiService({}, {}, null, { esm: { load: async (pkg) => {
    if (pkg === '@langchain/langgraph/prebuilt') return { createReactAgent: () => ({ async *stream() {
      for (const update of toolUpdates) yield ['updates', update];
      yield ['updates', { agent: { messages: [{ getType: () => 'ai', content: '{"focus":"测试","claims":[],"questions":[]}' }] } }];
    } }) };
    return { HumanMessage: class { constructor(content) { this.content = content; } }, AIMessage: class { constructor(content) { this.content = content; } }, SystemMessage: class { constructor(content) { this.content = content; } } };
  } } });
  service._configured = true;
  service._registry = { getTools: async () => [] };
  service._mp.chatModel = () => ({ async *stream() { for (const chunk of chunks) yield chunk; } });
  return service;
}
function runAiTests(testFn) {
  console.log('\nAiService (unit)');
  testFn('ModelProvider constructs unconfigured', () => {
    const mp = new (require('../src/core/ai/ModelProvider'))();
    assert.equal(mp.isConfigured(), false); assert.equal(mp.chatModel(), null); assert.equal(mp.embeddings(), null);
  });
  testFn('AiService and ChainFactory construct without configuration', () => {
    const service = new AiService({}, {});
    assert.equal(service.status().configured, false);
    assert.ok(new (require('../src/core/ai/ChainFactory'))(service._mp, null));
    assert.equal(typeof require('../src/core/ai/AstroToolkit').createTools, 'function');
  });
  for (const [name, chunk, expected] of [
    ['OpenAI length', { content: '前半', response_metadata: { finish_reason: 'length' } }, true],
    ['clean stop', { content: '完整', response_metadata: { finish_reason: 'stop' } }, false],
    ['Anthropic max_tokens', { content: '前半', additional_kwargs: { stop_reason: 'max_tokens' } }, true],
    ['gateway max_tokens', { content: '前半', response_metadata: { finish_reason: 'max_tokens' } }, true],
  ]) testFn(`two-stage interpretation preserves ${name} finish metadata`, async () => {
    const service = fixture([chunk]); const events = [];
    for await (const event of service.interpret({}, { sessionId: 'test' })) events.push(event);
    assert.equal(events.some((e) => e.type === 'truncated'), expected);
    assert.equal(events.at(-1).type, 'done');
    assert.ok(events.some((e) => e.type === 'analysis-report'));
    assert.equal(events.filter((e) => e.type === 'token').map((e) => e.data).join(''), chunk.content);
  });
  testFn('ordinary conversation uses the writer and reports truncation', async () => {
    const service = fixture([{ content: '回答', response_metadata: { finish_reason: 'length' } }]); const events = [];
    for await (const event of service.chat([{ role: 'user', content: '你好' }], { sessionId: 't' })) events.push(event);
    assert.ok(events.some((e) => e.type === 'truncated'));
    assert.ok(!events.some((e) => e.type === 'analysis-report'));
  });
  testFn('analyst tool events retain args, full results and excerpts', async () => {
    const service = fixture([{ content: '回答' }], [
      { agent: { messages: [{ getType: () => 'ai', tool_calls: [{ id: 'call', name: 'search_knowledge', args: { query: '火星落宫' } }] }] } },
      { tools: { messages: [{ getType: () => 'tool', tool_call_id: 'call', name: 'search_knowledge', content: '火星落第4宫'.repeat(100) }] } },
    ]); const events = [];
    for await (const event of service.chat([{ role: 'user', content: '解读' }], { sessionId: 't' })) events.push(event);
    const calls = events.filter((e) => e.type === 'tool-call').map((e) => e.data);
    assert.ok(calls[0].argsDigest.includes('火星落宫')); assert.equal(calls[0].requiresConfirmation, false);
    assert.equal(calls[1].callId, 'call'); assert.equal(calls[1].result, '火星落第4宫'.repeat(100));
    assert.ok(calls[1].resultExcerpt.length <= 200);
  });
}
module.exports = { runAiTests };
