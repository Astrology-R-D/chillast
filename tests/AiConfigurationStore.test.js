'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Store = require('../src/main/AiConfigurationStore');
const IpcRouter = require('../src/main/IpcRouter');

const a = { provider: 'deepseek', model: 'model-a', baseUrl: 'https://a.example', apiKey: 'test-key-a', maxTokens: 0, maxTokensMode: 'context', contextWindow: 100000, maxOutputTokens: 12000 };
const b = { provider: 'ollama', model: 'model-b', baseUrl: 'http://localhost:11434', apiKey: '', temperature: 0.3, maxTokens: 4096 };
const codec = { isEncryptionAvailable: () => true, encryptString: (text) => Buffer.from(`protected:${text}`), decryptString: (buffer) => buffer.toString().slice(10) };
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-ai-config-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('migrates the current configuration, retains separate keys, and restores the active selection after restart', (t) => {
  const dir = temporary(t); const store = new Store(dir, { safeStorage: codec }).init();
  store.migrateLegacy(a);
  const first = store.getActive();
  assert.equal(first.name, '当前配置'); assert.equal(first.apiKey, a.apiKey);
  const second = store.prepareSave({ name: '本地研究', settings: b }); store.commit(second);
  store.activate(first.id);
  const restarted = new Store(dir, { safeStorage: codec }).init();
  assert.equal(restarted.getActive().id, first.id);
  assert.equal(restarted.get(second.id).apiKey, '');
  assert.equal(restarted.getActive().settings.maxTokens, 0);
  assert.equal(restarted.getActive().settings.contextWindow, 100000);
  assert.equal(restarted.list().configurations.length, 2);
  assert.equal(JSON.stringify(restarted.list()).includes(a.apiKey), false);
  assert.equal(fs.readFileSync(store.filePath, 'utf8').includes(a.apiKey), false);
  assert.equal(Object.hasOwn(restarted.list().configurations[0].settings, 'apiKey'), false);
  restarted.migrateLegacy(b); assert.equal(restarted.list().configurations.length, 2);
});

test('requires unique names, retains keys only on the same endpoint, and protects the active configuration', (t) => {
  const store = new Store(temporary(t)).init();
  const first = store.prepareSave({ name: '远程', settings: a }); store.commit(first);
  const updated = store.prepareSave({ id: first.id, name: '工作', settings: { model: 'model-new' } });
  assert.equal(updated.apiKey, a.apiKey); store.commit(updated);
  assert.equal(store.prepareSave({ id: first.id, name: '工作', settings: { baseUrl: 'https://other.example' } }).apiKey, '');
  assert.equal(store.prepareSave({ id: first.id, name: '工作', settings: { provider: 'openai' } }).apiKey, '');
  assert.throws(() => store.prepareSave({ name: ' ', settings: a }), /名称/);
  assert.throws(() => store.prepareSave({ name: '工作', settings: b }), /已存在/);
  assert.throws(() => store.remove(first.id), /先切换/);
  const second = store.prepareSave({ name: '本地', settings: b }); store.commit(second); store.remove(first.id);
  assert.equal(store.list().configurations.length, 1);
});

test('corrupt configuration files produce an error and are preserved', (t) => {
  const dir = temporary(t); const file = path.join(dir, 'ai-configurations.json'); fs.writeFileSync(file, 'broken');
  const store = new Store(dir, { safeStorage: codec }).init();
  assert.throws(() => store.list(), /无法读取/); assert.throws(() => store.migrateLegacy(a), /无法读取/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
});

test('configuration IPC switches the correct key, keeps app-wide settings, and rejects changes during a stream', async (t) => {
  const store = new Store(temporary(t), { safeStorage: codec }).init();
  const handlers = new Map(); const calls = [];
  const ai = { configure: async (input) => { calls.push(input); return input.model === 'invalid' ? { accepted: false, error: 'invalid model' } : { accepted: true }; }, status: () => ({}), testWithSettings: async (input) => { calls.push(input); return { ok: true }; } };
  const router = new IpcRouter({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, aiService: ai, aiConfigurationStore: store }).register();
  router._readAiSettings = () => ({ mcpServers: { saved: {} }, toolProviders: { web: false }, embeddings: { provider: 'local' } });
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  const first = (await invoke('ai:configurations:save', { name: '远程', settings: a })).data;
  const second = (await invoke('ai:configurations:save', { name: '本地', settings: b })).data;
  assert.equal(calls.at(-1).apiKey, '');
  await invoke('ai:configurations:activate', first.id);
  assert.equal(calls.at(-1).apiKey, a.apiKey);
  assert.deepEqual(calls.at(-1).toolProviders, { web: false });
  await invoke('ai:configurations:test', { id: first.id, name: '', settings: { ...a, apiKey: undefined } });
  // Omission retains a key; explicit undefined is invalid and must not test another config's key.
  const draft = { ...a }; delete draft.apiKey;
  assert.equal((await invoke('ai:configurations:test', { id: first.id, settings: draft })).ok, true);
  assert.equal(calls.at(-1).apiKey, a.apiKey);
  assert.equal((await invoke('ai:configurations:save', { id: first.id, name: '远程', settings: { ...a, model: 'invalid' } })).ok, false);
  assert.equal(store.getActive().id, first.id); assert.equal(store.get(first.id).settings.model, 'model-a');
  router._sessionTasks.add('running');
  assert.equal((await invoke('ai:configurations:activate', second.id)).ok, false);
  assert.equal(store.getActive().id, first.id);
  assert.equal(JSON.stringify((await invoke('ai:configurations:list')).data).includes(a.apiKey), false);
});

test('configuration switches exclude chat, compression and legacy changes, and roll back runtime on a save failure', async (t) => {
  const store = new Store(temporary(t)).init();
  const first = store.prepareSave({ name: '远程', settings: a }); store.commit(first);
  const second = store.prepareSave({ name: '本地', settings: b }); store.commit(second);
  const handlers = new Map(); let release; let current = second.settings;
  let block = true;
  const ai = { configure: async (input) => { if (block) await new Promise((resolve) => { release = resolve; }); current = input; return { accepted: true }; }, status: () => ({}) };
  const router = new IpcRouter({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, aiService: ai, aiConfigurationStore: store }).register();
  router._readAiSettings = () => ({});
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  const switching = invoke('ai:configurations:activate', first.id);
  for (const [channel, args] of [['ai:chat', [[], {}]], ['ai:context:compress', ['session']], ['ai:configure', [b]], ['ai:configurations:activate', [second.id]]]) {
    assert.equal((await invoke(channel, ...args)).ok, false, channel);
  }
  block = false; release();
  assert.equal((await switching).ok, true); assert.equal(current.model, 'model-a');
  const write = store._write;
  store._write = () => { throw new Error('disk unavailable'); };
  const failed = await invoke('ai:configurations:activate', second.id);
  assert.equal(failed.ok, false); assert.match(failed.error, /disk unavailable/);
  assert.equal(store.getActive().id, first.id); assert.equal(current.model, 'model-a');
  store._write = write;
  assert.equal((await invoke('ai:configurations:activate', second.id)).ok, true);
  assert.equal(current.model, 'model-b');
});
