'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ModelProvider = require('../src/core/ai/ModelProvider');

class FakeChatModel {
  constructor(options) { this.options = options; }
  async invoke() { return { content: 'ok' }; }
}

class FakeEmbeddings {
  constructor(options) { this.options = options; this.closeCalls = 0; }
  async close() { this.closeCalls += 1; }
}

function fakeLoader({ failPackage } = {}) {
  return async (packageName) => {
    if (packageName === failPackage) throw new Error(`module unavailable: ${packageName}`);
    return {
      ChatOpenAI: FakeChatModel,
      ChatAnthropic: FakeChatModel,
      OpenAIEmbeddings: FakeEmbeddings,
    };
  };
}

test('valid provider followed by invalid provider preserves model, settings, and embeddings', async () => {
  const provider = new ModelProvider({ load: fakeLoader() });
  await provider.configure({ provider: 'openai', model: 'ready', apiKey: 'key' });
  const previous = {
    model: provider.chatModel(),
    settings: provider._settings,
    embeddings: provider.embeddings(),
  };

  await assert.rejects(
    provider.configure({ provider: 'unsupported', model: 'bad', apiKey: 'key' }),
    /不支持/,
  );

  assert.equal(provider.chatModel(), previous.model);
  assert.equal(provider._settings, previous.settings);
  assert.equal(provider.embeddings(), previous.embeddings);
  assert.equal(previous.embeddings.closeCalls, 0);
});

test('module load failure preserves the previous accepted configuration', async () => {
  let failPackage = null;
  const provider = new ModelProvider({
    load: async (packageName) => fakeLoader({ failPackage })(packageName),
  });
  await provider.configure({ provider: 'openai', model: 'ready', apiKey: 'key' });
  const previousModel = provider.chatModel();
  const previousSettings = provider._settings;
  failPackage = '@langchain/anthropic';

  await assert.rejects(
    provider.configure({ provider: 'anthropic', model: 'new', apiKey: 'key' }),
    /module unavailable/,
  );
  assert.equal(provider.chatModel(), previousModel);
  assert.equal(provider._settings, previousSettings);
});

test('valid provider without a required key commits settings and becomes unconfigured', async () => {
  const provider = new ModelProvider({ load: fakeLoader() });
  await provider.configure({ provider: 'openai', model: 'ready', apiKey: 'key' });
  const oldEmbeddings = provider.embeddings();

  await provider.configure({ provider: 'openai', model: 'awaiting-key', apiKey: '' });

  assert.equal(provider.chatModel(), null);
  assert.equal(provider.isConfigured(), false);
  assert.equal(provider._settings.model, 'awaiting-key');
  assert.equal(provider.embeddings(), null);
  assert.equal(oldEmbeddings.closeCalls, 1);
});

test('first invalid provider leaves a new ModelProvider unconfigured and unpublished', async () => {
  const provider = new ModelProvider({ load: fakeLoader() });
  await assert.rejects(provider.configure({ provider: 'invalid' }), /不支持/);
  assert.equal(provider.chatModel(), null);
  assert.equal(provider.embeddings(), null);
  assert.equal(provider._settings, null);
});
