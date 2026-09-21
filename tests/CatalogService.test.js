'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const CatalogService = require('../src/core/ai/CatalogService');

const SNAPSHOT = {
  fetchedAt: 1693000000000,
  providers: {
    deepseek: {
      name: 'DeepSeek', api: 'https://api.deepseek.com', env: ['DEEPSEEK_API_KEY'],
      models: {
        'deepseek-v4-flash': {
          name: 'DeepSeek V4 Flash', limit: { context: 1000000, output: 384000 },
          cost: { input: 0.15, output: 0.6 }, status: 'active', release_date: '2026-09-10', tool_call: true,
        },
        'deepseek-old': {
          name: 'Old', limit: { context: 64000, output: 4096 },
          cost: { input: 1, output: 2 }, status: 'deprecated', release_date: '2024-01-01', tool_call: true,
        },
      },
    },
  },
};

function writeTemp(name, data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

function newService({ snapshot = SNAPSHOT, cache = null, fetchImpl = null, now = () => 0, ttl } = {}) {
  const snapshotPath = writeTemp('snapshot.json', snapshot);
  const cachePath = cache ? writeTemp('cache.json', cache) : path.join(path.dirname(snapshotPath), 'catalog-cache.json');
  const svc = new CatalogService({ snapshotPath, cachePath, fetchImpl, now, log: () => {}, ttlMs: ttl });
  svc.load();
  return { svc, cachePath };
}

test('loads snapshot and hides deprecated models, newest first', () => {
  const { svc } = newService();
  const models = svc.getModels('deepseek');
  assert.deepEqual(models.map((m) => m.id), ['deepseek-v4-flash']); // deprecated filtered
  assert.equal(svc.getModel('deepseek', 'deepseek-v4-flash').limitOutput, 384000);
  assert.equal(svc.getModel('deepseek', 'nope'), null);
});

test('maps whitelist keys to catalog ids and reports provider summaries', () => {
  const { svc } = newService();
  const providers = svc.getProviders();
  const moonshot = providers.find((p) => p.key === 'moonshot');
  assert.equal(moonshot.catalogId, 'moonshotai-cn');
  const deepseek = providers.find((p) => p.key === 'deepseek');
  assert.equal(deepseek.modelCount, 1);
  // providers absent from the snapshot still appear (ollama / openai_compat)
  assert.ok(providers.some((p) => p.key === 'ollama' && p.modelCount === 0));
});

test('cache wins over snapshot and survives load without snapshot', () => {
  const cache = { fetchedAt: 12345, providers: SNAPSHOT.providers };
  const snapshotPath = path.join(os.tmpdir(), 'missing-snapshot.json');
  const cachePath = writeTemp('cache.json', cache);
  const svc = new CatalogService({ snapshotPath, cachePath, now: () => 0, log: () => {} });
  svc.load();
  assert.equal(svc.getModel('deepseek', 'deepseek-v4-flash').limitOutput, 384000);
});

test('refreshAsync fetches when stale and writes the cache', async () => {
  const fresh = {
    providers: {
      deepseek: {
        name: 'DeepSeek', api: 'https://api.deepseek.com', env: [],
        models: { 'deepseek-v9': { name: 'V9', limit: { context: 2000000, output: 512000 }, cost: { input: 0.1, output: 0.2 }, status: 'active', release_date: '2027-01-01', tool_call: true } },
      },
    },
  };
  const { svc, cachePath } = newService({ now: () => 25 * 60 * 60 * 1000, fetchImpl: async () => ({ ok: true, json: async () => fresh }) });
  await svc.refreshAsync({ force: true });
  assert.equal(svc.getModel('deepseek', 'deepseek-v9') !== null, true);
  const stored = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  assert.equal(stored.providers.deepseek.models['deepseek-v9'] !== undefined, true);
});

test('refreshAsync is skipped when fresh, and failures keep old data', async () => {
  let calls = 0;
  const failingFetch = async () => { calls += 1; throw new Error('network down'); };
  const { svc } = newService({ now: () => 0, fetchImpl: failingFetch }); // fetchedAt now=0 → age 0 → fresh
  await svc.refreshAsync(); // age 0 < ttl → no fetch
  assert.equal(calls, 0);
  await svc.refreshAsync({ force: true }); // fetch throws
  assert.equal(svc.getModel('deepseek', 'deepseek-v4-flash') !== null, true, 'old data intact');
});

test('missing snapshot and cache yield an empty (not crashing) catalog', () => {
  const svc = new CatalogService({
    snapshotPath: path.join(os.tmpdir(), 'no-such-snapshot.json'),
    cachePath: path.join(os.tmpdir(), 'no-such-cache.json'),
    now: () => 0, log: () => {},
  });
  svc.load();
  assert.deepEqual(svc.getModels('deepseek'), []);
  assert.equal(svc.getModel('deepseek', 'x'), null);
});

test('getApi returns the catalog endpoint', () => {
  const { svc } = newService();
  assert.equal(svc.getApi('deepseek'), 'https://api.deepseek.com');
  assert.equal(svc.getApi('ollama'), null);
  assert.equal(svc.getApi('openai_compat'), null);
});

test('refreshAsync handles the flat models.dev api.json shape, filters non-chat, and sorts newest first', async () => {
  // 平面 api.json（线上真实形状）：顶层即 { [catalogId]: provider }
  const flatApi = {
    deepseek: {
      name: 'DeepSeek', api: 'https://api.deepseek.com', env: [],
      models: {
        'deepseek-v4-flash': { name: 'V4 Flash', limit: { context: 1000000, output: 384000 }, cost: { input: 0.15, output: 0.6 }, status: 'active', release_date: '2026-09-10', tool_call: true },
        'deepseek-v4-pro': { name: 'V4 Pro', limit: { context: 1000000, output: 131072 }, cost: { input: 0.4, output: 0.9 }, status: 'active', release_date: '2026-08-12', tool_call: true },
        'deepseek-tts': { name: 'TTS', limit: { context: 8000, output: 4096 }, cost: { input: 1, output: 1 }, status: 'active', release_date: '2026-09-20', tool_call: false, modalities: { output: ['audio'] } },
      },
    },
  };
  const { svc } = newService({ now: () => 25 * 60 * 60 * 1000, fetchImpl: async () => ({ ok: true, json: async () => flatApi }) });
  await svc.refreshAsync({ force: true });
  const models = svc.getModels('deepseek');
  // deepseek-tts 被 chat 过滤掉；其余按 release_date 倒序
  assert.deepEqual(models.map((m) => m.id), ['deepseek-v4-flash', 'deepseek-v4-pro']);
});
