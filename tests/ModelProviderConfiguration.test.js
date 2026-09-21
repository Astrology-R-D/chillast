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
      ChatOllama: FakeChatModel,
      OpenAIEmbeddings: FakeEmbeddings,
    };
  };
}

const { PROVIDER_WHITELIST } = require('../src/core/ai/ProviderCatalogWhitelist');

function fakeCatalog(modelsByProvider = {}, apiByProvider = {}) {
  return {
    getModel(providerKey, modelId) {
      const m = (modelsByProvider[providerKey] || {})[modelId];
      return m ? { limitOutput: m.limitOutput } : null;
    },
    getApi(providerKey) {
      return apiByProvider[providerKey] || null;
    },
  };
}

const DEEPSEEK_CATALOG = fakeCatalog(
  { deepseek: { 'deepseek-v4-flash': { limitOutput: 384000 } } },
  { deepseek: 'https://api.deepseek.com' },
);

test('valid provider followed by failed provider preserves model, settings, and embeddings', async () => {
  // “失败保留旧配置”的触发器从“未知 provider”换成“模块缺类”——未知 provider 现在合法降级。
  const provider = new ModelProvider({
    load: async (packageName) => {
      if (packageName === '@langchain/anthropic') return {}; // module without ChatAnthropic
      return { ChatOpenAI: FakeChatModel, ChatAnthropic: FakeChatModel, OpenAIEmbeddings: FakeEmbeddings };
    },
  });
  await provider.configure({ provider: 'openai', model: 'ready', apiKey: 'key' });
  const previous = {
    model: provider.chatModel(),
    settings: provider._settings,
    embeddings: provider.embeddings(),
  };

  await assert.rejects(
    provider.configure({ provider: 'anthropic', model: 'bad', apiKey: 'key' }),
    /缺少/,
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

test('unknown provider degrades to openai_compat and commits an unconfigured state without a key', async () => {
  const provider = new ModelProvider({ load: fakeLoader() });
  await provider.configure({ provider: 'invalid' }); // no baseUrl, no key
  assert.equal(provider.chatModel(), null);
  assert.equal(provider.isConfigured(), false);
  assert.equal(provider.embeddings(), null);
  assert.equal(provider._settings.provider, 'invalid'); // committed, not thrown away
});

test('catalog-driven maxTokens: model limit wins when user sets nothing', async () => {
  const provider = new ModelProvider({ load: fakeLoader(), catalog: DEEPSEEK_CATALOG });
  await provider.configure({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'key' });
  assert.equal(provider.chatModel().options.maxTokens, 384000);
  assert.equal(provider.chatModel().options.configuration.baseURL, 'https://api.deepseek.com');
});

test('catalog-driven maxTokens: user value kept, clamped to the model limit', async () => {
  const catalog = fakeCatalog({ deepseek: { m: { limitOutput: 131072 } } });
  const a = new ModelProvider({ load: fakeLoader(), catalog });
  await a.configure({ provider: 'deepseek', model: 'm', apiKey: 'key', maxTokens: 8192 });
  assert.equal(a.chatModel().options.maxTokens, 8192, 'user preference wins within the limit');
  const b = new ModelProvider({ load: fakeLoader(), catalog });
  await b.configure({ provider: 'deepseek', model: 'm', apiKey: 'key', maxTokens: 999999 });
  assert.equal(b.chatModel().options.maxTokens, 131072, 'clamped to the model limit');
});

test('maxTokens falls back to 8192 for models the catalog does not know', async () => {
  const provider = new ModelProvider({ load: fakeLoader(), catalog: fakeCatalog() });
  await provider.configure({ provider: 'openai_compat', model: 'my-private-model', apiKey: 'key', baseUrl: 'https://my-endpoint/v1' });
  assert.equal(provider.chatModel().options.maxTokens, 8192);
  assert.equal(provider.chatModel().options.configuration.baseURL, 'https://my-endpoint/v1');
});

test('legacy keys keep working (moonshot → catalog-driven compat engine)', async () => {
  const provider = new ModelProvider({
    load: fakeLoader(),
    catalog: fakeCatalog({ moonshot: { 'kimi-k2.6': { limitOutput: 262144 } } }),
  });
  await provider.configure({ provider: 'moonshot', model: 'kimi-k2.6', apiKey: 'key' });
  assert.ok(provider.chatModel() instanceof FakeChatModel);
});

test('listProviders returns whitelist summaries', () => {
  const providers = ModelProvider.listProviders();
  assert.ok(providers.length === PROVIDER_WHITELIST.length);
  assert.deepEqual(providers[0], { key: 'openai', label: 'OpenAI', catalogId: 'openai', needsKey: true });
  const ollama = providers.find((p) => p.key === 'ollama');
  assert.equal(ollama.needsKey, false);
});

test('anthropic-engine providers (minimax) get clientOptions.baseURL with /v1 stripped', async () => {
  const catalog = fakeCatalog(
    { minimax: { 'MiniMax-M2': { limitOutput: 131072 } } },
    { minimax: 'https://api.minimax.cn/anthropic/v1' },
  );
  const provider = new ModelProvider({ load: fakeLoader(), catalog });
  await provider.configure({ provider: 'minimax', model: 'MiniMax-M2', apiKey: 'mm-key', maxTokens: 2000.7 });
  const options = provider.chatModel().options;
  assert.equal(options.apiKey, 'mm-key');
  assert.equal(options.maxTokens, 2000, 'user value floored, kept within the limit');
  assert.deepEqual(options.clientOptions, { baseURL: 'https://api.minimax.cn/anthropic' }, 'clientOptions not configuration; /v1 stripped');
  assert.equal(options.configuration, undefined, 'must NOT ride the openai-style configuration key');
});

test('every whitelist engine is present in ENGINE_MAP (drift guard)', async () => {
  const ModelProvider = require('../src/core/ai/ModelProvider');
  const { PROVIDER_WHITELIST } = require('../src/core/ai/ProviderCatalogWhitelist');
  const { ENGINE_MAP } = require('../src/core/ai/ModelProvider');
  for (const entry of PROVIDER_WHITELIST) {
    assert.ok(ENGINE_MAP[entry.engine], `ENGINE_MAP missing engine '${entry.engine}' (whitelist key ${entry.key})`);
  }
  for (const entry of PROVIDER_WHITELIST) {
    const provider = new ModelProvider({ load: fakeLoader(), catalog: fakeCatalog() });
    // eslint-disable-next-line no-await-in-loop
    await assert.doesNotReject(provider.configure({ provider: entry.key, model: 'm', apiKey: 'k' }), `engine missing for ${entry.key}`);
  }
});

test('testWithSettings resolves catalog-driven endpoints when passed the catalog', async () => {
  // 复现 final-review blocker：目录端点的 provider 在无 baseUrl 时，
  // 不带 catalog 的临时 provider 会打到 api.openai.com（401）。
  const result = await ModelProvider.testWithSettings(
    { provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'key' },
    DEEPSEEK_CATALOG,
    fakeLoader(),
  );
  assert.equal(result.ok, true);
  // FakeChatModel.invoke 返回 { content: 'ok' } → testConnection ok。
  // baseURL 断言：直接构造对比，确认 catalog 路径进到了 chatOpts
  const provider = new ModelProvider({ load: fakeLoader(), catalog: DEEPSEEK_CATALOG });
  await provider.configure({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'key' });
  assert.equal(provider.chatModel().options.configuration.baseURL, 'https://api.deepseek.com');
});
