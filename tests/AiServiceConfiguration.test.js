'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const AiService = require('../src/core/ai/AiService');

function modelProvider(ready) {
  return {
    _settings: null,
    ready,
    configureCalls: [],
    connectionCalls: 0,
    async configure(settings) {
      this.configureCalls.push({ ...settings });
      if (settings.provider === 'invalid') throw new Error('invalid provider');
      this._settings = { ...settings };
      this.ready = settings.apiKey === '' || settings.ready === false ? false : ready;
    },
    async testConnection() { this.connectionCalls += 1; return { ok: true }; },
    embeddings() { return null; },
    isConfigured() { return this.ready; },
    chatModel() { return this.ready ? {} : null; },
    async close() {},
  };
}

async function configuredService(ready) {
  const service = new AiService({}, {});
  service._mp = modelProvider(ready);
  await service.configure({
    provider: 'controlled',
    model: 'controlled-model',
    enableRag: false,
    mcpServers: {},
  });
  return service;
}

test('configure reports unconfigured when no chat model is available while tools remain usable', async () => {
  const service = await configuredService(false);
  assert.equal(service.status().configured, false);
  assert.ok(service.getToolRegistry());
  assert.ok(service._chainFactory);
  await service.close();
});

test('configure reports configured when the chat model is available', async () => {
  const service = await configuredService(true);
  assert.equal(service.status().configured, true);
  await service.close();
});

test('failed reconfigure preserves previous effective status, model settings, and accepted merge base', async () => {
  const service = new AiService({}, {});
  const provider = modelProvider(true);
  service._mp = provider;
  await service.configure({
    provider: 'controlled', model: 'ready', apiKey: 'key', temperature: 0.4,
    enableRag: false, mcpServers: {}, search: { provider: 'old-search' },
  });

  await service.configure({ provider: 'invalid', model: 'bad', temperature: 0.9 });

  assert.deepEqual(service.status(), {
    configured: true,
    provider: 'controlled',
    model: 'ready',
    baseUrl: '',
    temperature: 0.4,
    maxTokens: undefined,
    knowledgeDocCount: 0,
  });
  assert.equal(service._lastSettings.provider, 'controlled');
  assert.equal(service._lastSettings.temperature, 0.4);
  assert.equal(service._configured, true);

  await service.configure({ temperature: 0.2 });
  const partialMerge = provider.configureCalls.at(-1);
  assert.equal(partialMerge.provider, 'controlled');
  assert.equal(partialMerge.model, 'ready');
  assert.equal(partialMerge.temperature, 0.2);
  assert.equal(partialMerge.search.provider, 'old-search');
  await service.close();
});

test('accepted provider without a key commits settings and becomes unconfigured', async () => {
  const service = new AiService({}, {});
  const provider = modelProvider(true);
  service._mp = provider;
  await service.configure({ provider: 'controlled', model: 'ready', apiKey: 'key', enableRag: false, mcpServers: {} });

  await service.configure({ model: 'awaiting-key', apiKey: '' });

  assert.equal(service.status().configured, false);
  assert.equal(service.status().model, 'awaiting-key');
  assert.equal(service._lastSettings.apiKey, '');
  await service.close();
});

test('first invalid provider remains unconfigured while non-chat tools initialize', async () => {
  const service = new AiService({}, {});
  const provider = modelProvider(false);
  service._mp = provider;

  await service.configure({ provider: 'invalid', enableRag: false, mcpServers: {} });

  assert.equal(service.status().configured, false);
  assert.equal(service._lastSettings, null);
  assert.ok(service.getToolRegistry());
  assert.ok(service._chainFactory);
  assert.equal(provider.connectionCalls, 0);
  await service.close();
});
