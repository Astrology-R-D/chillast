'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DiagnosticLog, captureConsole } = require('../src/core/diagnostics/DiagnosticLog');
const IpcRouter = require('../src/main/IpcRouter');

test('logs rotate and export only bounded diagnostic files with credentials and private payloads redacted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-diagnostics-'));
  try {
    const logger = new DiagnosticLog(root, { maxFileBytes: 2048, maxFiles: 3, metadata: { appVersion: 'test' } });
    logger.registerSecrets({ apiKey: 'private-provider-credential', embeddings: { apiKey: 'another-private-credential' } });
    for (let i = 0; i < 80; i++) logger.record('info', 'ai-turn-start', { route: 'tools', index: i });
    logger.record('error', 'connection', { error: new Error('Bearer abcdef123456 https://user:password@example.com/v1?api_key=query-secret#private'), message: 'private-provider-credential', apiKey: 'another-private-credential', messages: [{ content: 'private-chat-text' }], profile: { birthData: 'private-birth-data' } });
    assert.equal(logger.info().files.length, 3);
    for (const file of logger.info().files) assert.ok(fs.statSync(path.join(root, file)).size <= 2048);
    const zip = new (require('adm-zip'))(logger.exportBundle({ tools: [{ id: 'web', enabled: true }] }));
    const text = zip.getEntries().map((entry) => entry.getData().toString()).join('\n');
    for (const secret of ['private-provider-credential', 'another-private-credential', 'abcdef123456', 'query-secret', 'private-chat-text', 'private-birth-data', 'user:password']) assert.ok(!text.includes(secret), secret);
    assert.match(text, /ai-turn-start/); assert.match(text, /example.com\/v1/); assert.match(text, /appVersion/);
    assert.ok(!zip.getEntries().some((entry) => entry.entryName.includes('..')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('console capture preserves output without copying arbitrary request objects; an unwritable log never crashes the application', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-log-console-'));
  try {
    const calls = [];
    const target = { warn: (...values) => calls.push(values), error: (...values) => calls.push(values) };
    const original = target.error;
    const logger = new DiagnosticLog(root);
    const restore = captureConsole(logger, target);
    target.error('[test] failure', { body: { chat: 'private-request-body' } });
    restore(); assert.equal(target.error, original); assert.equal(calls.length, 1);
    assert.ok(!fs.readFileSync(logger.currentFile, 'utf8').includes('private-request-body'));
    fs.writeFileSync(path.join(root, 'not-a-directory'), 'file');
    const broken = new DiagnosticLog(path.join(root, 'not-a-directory', 'logs'));
    assert.doesNotThrow(() => broken.record('error', 'error'));
    assert.equal(broken.info().enabled, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('diagnostic IPC has no renderer-selected paths and rejects untrusted frames before export', async () => {
  const handlers = new Map(); let exports = 0;
  const router = new IpcRouter({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    diagnosticActions: { info: () => ({ enabled: true }), open: () => true, export: () => { exports++; return { path: 'native-selection.zip' }; } } }).register();
  const mainFrame = {}; const sender = { mainFrame }; router.setWebContents(sender);
  assert.equal((await handlers.get('app:diagnostics:export')({ sender: {}, senderFrame: {} })).ok, false);
  assert.equal(exports, 0);
  const result = await handlers.get('app:diagnostics:export')({ sender, senderFrame: mainFrame }, 'arbitrary-renderer-path');
  assert.equal(result.data.path, 'native-selection.zip'); assert.equal(exports, 1);
});
