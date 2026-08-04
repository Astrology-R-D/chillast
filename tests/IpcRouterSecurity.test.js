'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const IpcRouter = require('../src/main/IpcRouter');

function capturedHandler() {
  let handler;
  const router = new IpcRouter({
    ipcMain: { handle: (_channel, nextHandler) => { handler = nextHandler; } },
  });
  let calls = 0;
  router._handle('security:test', () => { calls += 1; return 'accepted'; });
  return { router, invoke: (...args) => handler(...args), calls: () => calls };
}

test('trusted main-frame IPC invokes the handler', async () => {
  const fixture = capturedHandler();
  const mainFrame = {};
  const trusted = { mainFrame };
  fixture.router.setWebContents(trusted);

  assert.deepEqual(await fixture.invoke({ sender: trusted, senderFrame: mainFrame }), {
    ok: true,
    data: 'accepted',
  });
  assert.equal(fixture.calls(), 1);
});

test('foreign webContents and trusted subframes receive errors without invoking the handler', async () => {
  const fixture = capturedHandler();
  const mainFrame = {};
  const trusted = { mainFrame };
  fixture.router.setWebContents(trusted);

  for (const event of [
    { sender: { mainFrame: {} }, senderFrame: {} },
    { sender: trusted, senderFrame: { parent: mainFrame } },
    { sender: trusted, senderFrame: null },
  ]) {
    const result = await fixture.invoke(event);
    assert.equal(result.ok, false);
    assert.match(result.error, /不受信任|trusted/i);
  }
  assert.equal(fixture.calls(), 0);
});

test('isolated fixtures remain unrestricted until trusted webContents is set', async () => {
  const fixture = capturedHandler();
  assert.deepEqual(await fixture.invoke({ sender: {}, senderFrame: null }), {
    ok: true,
    data: 'accepted',
  });
});

test('location and close-decision handlers are dependency-gated and trust protected', async () => {
  const handlers = new Map();
  const resolutions = [];
  const decisions = [];
  const router = new IpcRouter({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    locationResolver: { resolve: (input) => { resolutions.push(input); return { timeZone: 'UTC' }; } },
    closeDecision: (decision) => { decisions.push(decision); return false; },
  }).register();
  const mainFrame = {};
  const trusted = { mainFrame };
  router.setWebContents(trusted);
  const input = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, latitude: 0, longitude: 0 };

  assert.ok(handlers.has('locations:resolve'));
  assert.ok(handlers.has('app:closeDecision'));
  assert.equal((await handlers.get('locations:resolve')({ sender: trusted, senderFrame: mainFrame }, input)).ok, true);
  assert.deepEqual(resolutions, [input]);

  for (const event of [
    { sender: {}, senderFrame: {} },
    { sender: trusted, senderFrame: { parent: mainFrame } },
  ]) {
    assert.equal((await handlers.get('app:closeDecision')(event, 'proceed')).ok, false);
  }
  assert.deepEqual(decisions, []);
  assert.equal((await handlers.get('app:closeDecision')({ sender: trusted, senderFrame: mainFrame }, 'invalid')).ok, false);
  assert.deepEqual(decisions, []);
  assert.deepEqual(await handlers.get('app:closeDecision')({ sender: trusted, senderFrame: mainFrame }, 'cancel'), { ok: true, data: false });
  assert.deepEqual(await handlers.get('app:closeDecision')({ sender: trusted, senderFrame: mainFrame }, 'proceed'), { ok: true, data: false });
  assert.deepEqual(decisions, ['cancel', 'proceed']);
});

test('optional bridge handlers are absent without injected dependencies', () => {
  const handlers = new Map();
  new IpcRouter({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }).register();
  assert.equal(handlers.has('locations:resolve'), false);
  assert.equal(handlers.has('app:closeDecision'), false);
});

test('chart handlers invoke astrology only for the trusted main frame', async () => {
  const handlers = new Map();
  const calls = [];
  const astrology = {
    referenceData: () => { calls.push(['reference']); return { signs: [] }; },
    chartTypes: () => { calls.push(['catalog']); return [{ type: 'natal' }]; },
    computeChart: (request) => { calls.push(['compute', request]); return { meta: { type: request.type } }; },
  };
  const router = new IpcRouter({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    astrologyService: astrology,
  }).register();
  const mainFrame = {};
  const trusted = { mainFrame };
  router.setWebContents(trusted);
  const event = { sender: trusted, senderFrame: mainFrame };
  const request = { type: 'natal' };

  assert.deepEqual(await handlers.get('reference:get')(event), { ok: true, data: { signs: [] } });
  assert.deepEqual(await handlers.get('chartTypes:get')(event), { ok: true, data: [{ type: 'natal' }] });
  assert.deepEqual(await handlers.get('chart:compute')(event, request), { ok: true, data: { meta: { type: 'natal' } } });
  assert.deepEqual(calls, [['reference'], ['catalog'], ['compute', request]]);

  calls.length = 0;
  for (const rejected of [
    { sender: {}, senderFrame: {} },
    { sender: trusted, senderFrame: { parent: mainFrame } },
  ]) {
    for (const channel of ['reference:get', 'chartTypes:get', 'chart:compute']) {
      assert.equal((await handlers.get(channel)(rejected, request)).ok, false);
    }
  }
  assert.deepEqual(calls, []);
});

test('AI configuration persists only provider-accepted candidates', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-ipc-config-'));
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir);
  const settingsPath = path.join(dataDir, 'ai-settings.json');
  const credentialPath = path.join(dataDir, 'ai-credentials.json');
  const initialSettings = Buffer.from(JSON.stringify({
    provider: 'openai', model: 'old', mcpServers: { local: { enabled: true } }, toolProviders: { web: false },
  }, null, 2));
  const initialCredentials = Buffer.from('existing-credential-bytes');
  fs.writeFileSync(settingsPath, initialSettings);
  fs.writeFileSync(credentialPath, initialCredentials);

  const handlers = new Map();
  const configureResults = [];
  const ai = {
    async configure(candidate) {
      configureResults.push(candidate);
      return candidate.provider === 'invalid'
        ? { accepted: false, error: 'unsupported provider: invalid' }
        : { accepted: true };
    },
    status: () => ({ configured: true }),
    getInitStatus: () => null,
  };
  const router = new IpcRouter({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    aiService: ai,
  });
  const statusEvents = [];
  router.setWebContents({ mainFrame: {}, send: (...args) => statusEvents.push(args) });

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { getPath: () => userData },
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (value) => Buffer.from(`encrypted:${value}`),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    router.register();
    const trusted = router.webContents;
    const event = { sender: trusted, senderFrame: trusted.mainFrame };
    const rejected = await handlers.get('ai:configure')(event, {
      provider: 'invalid', model: 'bad', apiKey: 'new-secret', temperature: 0.9,
    });
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /unsupported provider: invalid/);
    assert.deepEqual(fs.readFileSync(settingsPath), initialSettings);
    assert.deepEqual(fs.readFileSync(credentialPath), initialCredentials);
    assert.deepEqual(statusEvents, []);
    assert.equal(configureResults[0].mcpServers.local.enabled, true);
    assert.equal(configureResults[0].toolProviders.web, false);

    const accepted = await handlers.get('ai:configure')(event, {
      provider: 'openai', model: 'new', apiKey: 'accepted-secret', temperature: 0.2, maxTokens: 1000,
    });
    assert.equal(accepted.ok, true);
    assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).model, 'new');
    assert.match(fs.readFileSync(credentialPath, 'utf8'), /^encrypted:/);
    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(persisted.mcpServers.local.enabled, true);
    assert.equal(persisted.toolProviders.web, false);
    assert.deepEqual(statusEvents, [['ai:statusChanged', { configured: true }]]);
  } finally {
    Module._load = originalLoad;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
