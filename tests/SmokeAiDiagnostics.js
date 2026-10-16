'use strict';
const electron = require('electron');
const { app } = electron;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { diagnostics } = require('../src/core/diagnostics/DiagnosticLog');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-diagnostics-ui-'));
app.setPath('userData', temporary);
process.env.CHILLAST_RENDERER = 'react';
delete process.env.CHILLAST_RENDERER_URL;
fs.mkdirSync(path.join(temporary, 'data'));
fs.writeFileSync(path.join(temporary, 'data', 'ai-settings.json'), JSON.stringify({ enableRag: false, embeddings: { provider: 'none' }, mcpServers: {} }));
const destination = path.join(temporary, 'diagnostics.zip');
let canceled = false, opened = null, main;
class HiddenWindow extends electron.BrowserWindow {
  constructor(options) { super({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true } }); }
  show() {}
}
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron' && parent?.filename === path.resolve(__dirname, '../src/main/Main.js')) return {
    ...electron, BrowserWindow: HiddenWindow,
    app: new Proxy(app, { get(target, key) { if (key === 'requestSingleInstanceLock') return () => false; if (key === 'quit') return () => {}; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } }),
    dialog: { ...electron.dialog, showSaveDialog: async () => canceled ? { canceled: true } : { canceled: false, filePath: destination } },
    shell: { ...electron.shell, openPath: async (directory) => { opened = directory; return ''; } },
  };
  return originalLoad.call(this, request, parent, isMain);
};
let Main;
try { Main = require('../src/main/Main'); }
catch (error) { console.error(error); app.exit(1); }
finally { Module._load = originalLoad; }
async function execute(source) { return main.mainWindow.webContents.executeJavaScript(source); }
async function poll(source) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await execute(source)) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timed out: ${source}`);
}
app.whenReady().then(async () => {
  main = new Main(); main.bootstrapServices(); main.createWindow();
  await poll(`Boolean([...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='设置'))`);
  await execute(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='设置').click()`);
  await poll(`Boolean(document.getElementById('settings-diagnostics'))`);
  await poll(`document.body.textContent.includes('日志位置：')`);
  await poll(`(async()=>{const result=await window.mystApi.ai.tools.describe();return result.ok&&result.data.some(provider=>provider.id==='web'&&provider.ready);})()`);
  const info = await execute(`window.mystApi.app.diagnostics.info()`);
  assert.equal(info.ok, true); assert.equal(info.data.directory, path.join(temporary, 'logs'));
  diagnostics.registerSecrets({ apiKey: 'diagnostic-smoke-secret' });
  diagnostics.error('ai-connection-test-failed', { provider: 'test', timedOut: true, message: 'diagnostic-smoke-secret', messages: [{ content: 'private-smoke-conversation' }] });
  await execute(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='导出诊断日志').click()`);
  await poll(`document.body.textContent.includes('诊断日志已导出：')`);
  const zip = new (require('adm-zip'))(destination);
  const content = zip.getEntries().map((entry) => entry.getData().toString()).join('\n');
  assert.match(content, /ai-connection-test-failed/); assert.match(content, /app-start/);
  assert.ok(!content.includes('diagnostic-smoke-secret')); assert.ok(!content.includes('private-smoke-conversation'));
  const metadata = JSON.parse(zip.readAsText('diagnostics.json'));
  assert.ok(metadata.tools.some((provider) => provider.id === 'web' && provider.ready));
  await execute(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='打开日志目录').click()`);
  await poll(`!document.querySelector('#settings-diagnostics').closest('section').querySelector('button').disabled`);
  assert.equal(opened, path.join(temporary, 'logs'));
  canceled = true;
  assert.equal((await execute(`window.mystApi.app.diagnostics.export()`)).data, null);
  assert.equal(main.profileRepository.list().length, 0, 'export does not create a profile or chart');
  const imageDirectory = path.join(__dirname, 'screenshots'); fs.mkdirSync(imageDirectory, { recursive: true });
  await execute(`document.getElementById('settings-diagnostics').scrollIntoView({block:'start'})`);
  await poll(`document.getElementById('settings-diagnostics').getBoundingClientRect().top < 200`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  fs.writeFileSync(path.join(imageDirectory, 'ai-diagnostics.png'), (await main.mainWindow.webContents.capturePage()).toPNG());
  console.log('AI_DIAGNOSTICS_UI_PASS: real main/preload/settings, persistent log, native ZIP export, redaction, tools metadata, folder open and cancellation.');
  main.restoreConsole?.(); main.mainWindow.destroy(); await main.aiService.close(); app.exit(0);
}).catch((error) => { console.error(error); main?.restoreConsole?.(); main?.mainWindow?.destroy(); app.exit(1); });
