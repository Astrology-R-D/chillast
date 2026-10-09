'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IpcRouter = require('../src/main/IpcRouter');
function fixture() {
  const handlers = new Map(), calls = [];
  const manager = { fingerprint: 'one', listPacks: () => ({ packs: [] }), inspectPack: async () => ({ fingerprint: manager.fingerprint }), install: async (...args) => { calls.push(args); return 'installed'; }, activate: async (...args) => args, disable: async (id) => id, remove: async (...args) => args, setBuiltinEnabled: async (enabled) => enabled };
  const router = new IpcRouter({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, aiService: { getKnowledgePacks: () => manager, status: () => ({}), refreshKnowledgeTools: async () => {} }, chooseKnowledgePack: async () => 'chosen.kbpack' });
  router.register();
  return { manager, calls, router, invoke: (name, ...args) => handlers.get(`ai:knowledge:packs:${name}`)({}, ...args) };
}
test('package installation is bound to a reviewed file selection and detects changed files', async () => {
  const f = fixture();
  assert.equal((await f.invoke('install', 'C:/arbitrary-file.kbpack')).ok, false);
  const preview = (await f.invoke('choose')).data;
  assert.ok(preview.token); assert.ok(!preview.filePath);
  assert.equal((await f.invoke('install', preview.token)).data, 'installed');
  assert.deepEqual(f.calls, [['chosen.kbpack', 'one']]);
  assert.equal((await f.invoke('install', preview.token)).ok, false);
  const next = (await f.invoke('choose')).data;
  f.manager.fingerprint = 'changed';
  const changed = await f.invoke('install', next.token);
  assert.equal(changed.ok, false); assert.match(changed.error, /已改变/);
  assert.equal(f.calls.length, 1);
});

test('model configuration and knowledge changes exclude each other without blocking version changes during chat', async () => {
  const f = fixture();
  let finish;
  f.manager.activate = () => new Promise((resolve) => { finish = resolve; });
  const activation = f.invoke('activate', 'bazi', '2.0.0');
  await assert.rejects(() => f.router._withAiConfigurationLock(() => 'config'), /知识库正在准备/);
  finish('activated'); assert.equal((await activation).data, 'activated');
  assert.equal(await f.router._withAiConfigurationLock(() => 'config'), 'config');
  const configuring = f.router._withAiConfigurationLock(() => new Promise((resolve) => { finish = resolve; }));
  assert.equal((await f.invoke('disable', 'bazi')).ok, false);
  finish(); await configuring;
  f.router._sessionTasks.add('streaming-chat');
  assert.equal((await f.invoke('disable', 'bazi')).ok, true, 'the per-turn snapshot permits knowledge version changes while streaming');
});
