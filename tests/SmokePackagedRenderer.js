'use strict';

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runElectronSmokeController } = require('./ElectronSmokeController');

runElectronSmokeController('chillast-packaged-smoke-', app);

const root = path.join(__dirname, '..');
const archive = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
const userDataDir = process.env.CHILLAST_SMOKE_USER_DATA;
const errors = [];
let win = null;
let finished = false;

app.disableHardwareAcceleration();
app.setPath('userData', userDataDir);

function finish(code, reason) {
  if (finished) return;
  finished = true;
  if (reason) console.error(`\nPackaged React smoke failed: ${reason}\n`);
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(code);
}

async function poll(description, probe, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await win.webContents.executeJavaScript(`(${probe})()`);
      if (last && last.ready) return last.value;
    } catch (error) {
      last = error && error.message ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${description} timed out; last result: ${JSON.stringify(last)}`);
}

function registerEnvelope(channel, value) {
  ipcMain.handle(channel, async () => ({ ok: true, data: value }));
}

function captureWebContentsErrors(webContents) {
  webContents.on('console-message', (...args) => {
    const details = args.at(-1);
    const level = typeof args[1] === 'number' ? args[1] : details && details.level;
    const message = typeof args[2] === 'string' ? args[2] : details && details.message;
    if (level === 'error' || level >= 3) errors.push(`console: ${message}`);
  });
  webContents.on('preload-error', (_event, file, error) => errors.push(`preload ${file}: ${error}`));
  webContents.on('did-fail-load', (_event, code, description) => errors.push(`did-fail-load ${code}: ${description}`));
  webContents.on('render-process-gone', (_event, details) => errors.push(`render-process-gone: ${JSON.stringify(details)}`));
  webContents.once('dom-ready', () => {
    void webContents.executeJavaScript(`
      window.__packagedSmokeErrors = [];
      window.addEventListener('error', (event) => window.__packagedSmokeErrors.push('window: ' + event.message));
      window.addEventListener('unhandledrejection', (event) => window.__packagedSmokeErrors.push('unhandled: ' + String(event.reason)));
      document.addEventListener('securitypolicyviolation', (event) => window.__packagedSmokeErrors.push('CSP: ' + event.violatedDirective));
    `).catch((error) => errors.push(`browser error capture: ${error.message}`));
  });
}

app.whenReady().then(async () => {
  try {
    assertArchive();
    registerEnvelope('config:get', JSON.parse(asar.extractFile(archive, path.normalize('config.json')).toString('utf8')));
    registerEnvelope('locale:get', JSON.parse(asar.extractFile(archive, path.normalize('locale/zh.json')).toString('utf8')));
    registerEnvelope('ai:status', { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 });
    registerEnvelope('ai:initStatus', null);
    registerEnvelope('ai:setContext', { ok: true });

    win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 920,
      webPreferences: {
        preload: path.join(archive, 'src', 'preload', 'Preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    captureWebContentsErrors(win.webContents);
    await win.loadFile(path.join(archive, 'dist', 'renderer-react', 'index.html'));

    const report = await poll('packaged React shell', () => {
      const heading = document.querySelector('h1');
      return {
        ready: Boolean(window.mystApi && heading?.textContent === '档案管理'),
        value: {
          hasApi: Boolean(window.mystApi),
          heading: heading?.textContent,
          routes: document.querySelectorAll('.shell-nav__button').length,
        },
      };
    });
    const pageErrors = await win.webContents.executeJavaScript('window.__packagedSmokeErrors || []');
    errors.push(...pageErrors);
    if (!report.hasApi || report.heading !== '档案管理' || report.routes !== 6) {
      throw new Error(`invalid packaged shell: ${JSON.stringify(report)}`);
    }
    if (errors.length) throw new Error(errors.join(' | '));

    console.log('\nPackaged React smoke report:', JSON.stringify(report, null, 2));
    console.log('\nPackaged React smoke passed\n');
    finish(0);
  } catch (error) {
    finish(1, error && error.stack ? error.stack : String(error));
  }
});

function assertArchive() {
  if (!fs.existsSync(archive)) throw new Error(`package archive missing: ${archive}`);
}

setTimeout(() => finish(1, 'timed out after 30 seconds'), 30000);
