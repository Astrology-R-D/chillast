'use strict';

const assert = require('assert');

function runAiTests(testFn) {
  console.log('\nAiService (unit)');

  testFn('ModelProvider constructs without crash', () => {
    const ModelProvider = require('../src/core/ai/ModelProvider');
    const mp = new ModelProvider();
    assert.strictEqual(mp.isConfigured(), false);
    assert.strictEqual(mp.chatModel(), null);
    assert.strictEqual(mp.embeddings(), null);
  });

  testFn('AiService constructs without crash', () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    assert.strictEqual(typeof svc.configure, 'function');
    assert.strictEqual(typeof svc.interpret, 'function');
    assert.strictEqual(typeof svc.chat, 'function');
    assert.strictEqual(typeof svc.stop, 'function');
    assert.strictEqual(typeof svc.close, 'function');
    const st = svc.status();
    assert.strictEqual(st.configured, false);
  });

  testFn('ChainFactory constructs without crash', () => {
    const ChainFactory = require('../src/core/ai/ChainFactory');
    const ModelProvider = require('../src/core/ai/ModelProvider');
    const mp = new ModelProvider();
    const cf = new ChainFactory(mp, null);
    assert.ok(cf);
  });

  testFn('AstroToolkit createTools is async function', () => {
    const { createTools } = require('../src/core/ai/AstroToolkit');
    assert.strictEqual(typeof createTools, 'function');
  });

  testFn('interpret yields truncated when the stream ends with finish_reason=length', async () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    svc._configured = true;
    svc._chainFactory = {
      async buildInterpretStream() {
        async function* stream() {
          yield { content: '前半' };
          yield { content: '截', response_metadata: { finish_reason: 'length' } };
        }
        return stream();
      },
    };
    const events = [];
    for await (const ev of svc.interpret({}, { sessionId: 't' })) events.push(ev);
    const types = events.map((e) => e.type);
    assert.ok(types.includes('truncated'), `expected truncated in ${JSON.stringify(types)}`);
    assert.equal(types[types.length - 1], 'done');
  });

  testFn('interpret stays silent when finish_reason=stop', async () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    svc._configured = true;
    svc._chainFactory = {
      async buildInterpretStream() {
        async function* stream() {
          yield { content: '完整回答', response_metadata: { finish_reason: 'stop' } };
        }
        return stream();
      },
    };
    const events = [];
    for await (const ev of svc.interpret({}, { sessionId: 't' })) events.push(ev);
    assert.ok(!events.some((e) => e.type === 'truncated'));
  });

  testFn('chat yields truncated on a length-cut final message', async () => {
    const AiService = require('../src/core/ai/AiService');
    const fakeEsm = {
      load: async (pkg) => {
        if (pkg === '@langchain/langgraph/prebuilt') {
          return {
            createReactAgent: () => ({
              async *stream() {
                yield ['messages', [{ content: '答', getType: () => 'ai', response_metadata: { finish_reason: 'length' } }]];
              },
            }),
          };
        }
        return {
          HumanMessage: class { constructor(c) { this.content = c; } },
          AIMessage: class { constructor(c) { this.content = c; } },
          SystemMessage: class { constructor(c) { this.content = c; } },
        };
      },
    };
    const svc = new AiService({}, {}, null, { esm: fakeEsm });
    svc._configured = true;
    svc._registry = { getTools: async () => [] };
    const events = [];
    for await (const ev of svc.chat([{ role: 'user', content: '问' }], { sessionId: 't' })) events.push(ev);
    assert.ok(events.some((e) => e.type === 'truncated'));
    assert.equal(events[events.length - 1].type, 'done');
  });

  testFn('anthropic-style stop_reason=max_tokens is normalized to truncated', async () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    svc._configured = true;
    svc._chainFactory = {
      async buildInterpretStream() {
        async function* stream() {
          yield { content: '答到一半', additional_kwargs: { stop_reason: 'max_tokens' } };
        }
        return stream();
      },
    };
    const events = [];
    for await (const ev of svc.interpret({}, { sessionId: 't' })) events.push(ev);
    assert.ok(events.some((e) => e.type === 'truncated'), 'anthropic max_tokens must map to truncated');
  });

  testFn('chat intermediate length-cut turn overridden by a clean final turn emits no truncated', async () => {
    const AiService = require('../src/core/ai/AiService');
    const fakeEsm = {
      load: async (pkg) => {
        if (pkg === '@langchain/langgraph/prebuilt') {
          return {
            createReactAgent: () => ({
              async *stream() {
                yield ['messages', [{ content: '工具轮', getType: () => 'ai', response_metadata: { finish_reason: 'length' } }]];
                yield ['messages', [{ content: '最终答案', getType: () => 'ai', response_metadata: { finish_reason: 'stop' } }]];
              },
            }),
          };
        }
        return {
          HumanMessage: class { constructor(c) { this.content = c; } },
          AIMessage: class { constructor(c) { this.content = c; } },
          SystemMessage: class { constructor(c) { this.content = c; } },
        };
      },
    };
    const svc = new AiService({}, {}, null, { esm: fakeEsm });
    svc._configured = true;
    svc._registry = { getTools: async () => [] };
    const events = [];
    for await (const ev of svc.chat([{ role: 'user', content: '问' }], { sessionId: 't' })) events.push(ev);
    assert.ok(!events.some((e) => e.type === 'truncated'), 'final turn stop must win over intermediate length');
    assert.equal(events[events.length - 1].type, 'done');
  });

  testFn('gateway-mapped finish_reason=max_tokens through the openai field also truncates', async () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    svc._configured = true;
    svc._chainFactory = {
      async buildInterpretStream() {
        async function* stream() {
          yield { content: 'x', response_metadata: { finish_reason: 'max_tokens' } };
        }
        return stream();
      },
    };
    const events = [];
    for await (const ev of svc.interpret({}, { sessionId: 't' })) events.push(ev);
    assert.ok(events.some((e) => e.type === 'truncated'));
  });
}

module.exports = { runAiTests };
