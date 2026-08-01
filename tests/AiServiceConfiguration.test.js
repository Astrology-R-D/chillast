'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const AiService = require('../src/core/ai/AiService');

function modelProvider(ready) {
  return {
    _settings: null,
    async configure(settings) { this._settings = { ...settings }; },
    async testConnection() { return { ok: true }; },
    embeddings() { return null; },
    isConfigured() { return ready; },
    chatModel() { return ready ? {} : null; },
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
