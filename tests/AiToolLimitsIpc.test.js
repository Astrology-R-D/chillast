'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const IpcRouter = require('../src/main/IpcRouter');
const AiService = require('../src/core/ai/AiService');

test('tool limit IPC persists independent settings, preserves offline tools and rejects invalid input', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-tool-limits-'));
  try {
    const handlers = new Map();
    const ai = new AiService({}, {});
    const router = new IpcRouter({ ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, aiService: ai });
    router._aiSettingsPath = () => path.join(dir, 'settings.json');
    router._writeAiSettings({ model: 'keep', toolCallLimits: { offline: 9 } });
    const wc = { mainFrame: {} };
    router.setWebContents(wc); router.register();
    const invoke = value => handlers.get('ai:tools:setCallLimits')({ sender: wc, senderFrame: wc.mainFrame }, value);
    assert.equal((await invoke({ lookup: 0 })).ok, true);
    assert.deepEqual(router._readAiSettings(), { model: 'keep', toolCallLimits: { offline: 9, lookup: 0 } });
    const restarted = new AiService({}, {});
    restarted.setToolCallLimits(router._readAiSettings().toolCallLimits);
    assert.deepEqual(restarted._lastSettings.toolCallLimits, { offline: 9, lookup: 0 });
    assert.equal((await invoke({ lookup: -1 })).ok, false);
    assert.equal(router._readAiSettings().toolCallLimits.lookup, 0);
    assert.equal(ai._lastSettings.toolCallLimits.lookup, 0);
  } finally {
    fs.unlinkSync(path.join(dir, 'settings.json'));
    fs.rmdirSync(dir);
  }
});
