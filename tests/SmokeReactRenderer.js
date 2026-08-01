'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runElectronSmokeController } = require('./ElectronSmokeController');

runElectronSmokeController('chillast-react-smoke-', app);

const root = path.join(__dirname, '..');
const errors = [];
const seededProfile = {
  id: 'smoke-profile',
  nameZh: '烟测档案',
  nameEn: 'Smoke Profile',
  gender: 'other',
  birthData: {
    year: 1990, month: 1, day: 2, hour: 3, minute: 4,
    location: { label: '北京 / Beijing', latitude: 39.9042, longitude: 116.4074 },
  },
  notes: 'React smoke profile',
  tags: ['Smoke'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
let smokeProfiles = [seededProfile];
const userDataDir = process.env.CHILLAST_SMOKE_USER_DATA;
let win = null;
let finished = false;

app.disableHardwareAcceleration();
app.setPath('userData', userDataDir);
process.on('unhandledRejection', (reason) => {
  errors.push(`main unhandledRejection: ${reason && (reason.stack || reason.message) || String(reason)}`);
});
process.on('uncaughtException', (error) => {
  errors.push(`main uncaughtException: ${error && (error.stack || error.message) || String(error)}`);
});

function finish(code, reason) {
  if (finished) return;
  finished = true;
  if (reason) console.error(`\nReact smoke failed: ${reason}\n`);
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(code);
}

function fail(reason) {
  finish(1, reason);
}

async function poll(win, description, probe, timeout = 10000) {
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

function registerEnvelope(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await handler(...args) };
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      errors.push(`handler failure ${channel}: ${message}`);
      return { ok: false, error: message };
    }
  });
}

app.whenReady().then(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  const locale = JSON.parse(fs.readFileSync(path.join(root, 'locale', 'zh.json'), 'utf8'));
  registerEnvelope('config:get', () => config);
  registerEnvelope('locale:get', () => locale);
  registerEnvelope('ai:status', () => ({
    configured: false,
    provider: '',
    model: '',
    baseUrl: '',
    knowledgeDocCount: 0,
  }));
  registerEnvelope('ai:initStatus', () => null);
  registerEnvelope('ai:setContext', () => ({ ok: true }));
  registerEnvelope('profiles:list', () => smokeProfiles);
  registerEnvelope('profiles:get', (id) => smokeProfiles.find((profile) => profile.id === id) ?? null);
  registerEnvelope('profiles:save', (input) => {
    const now = new Date().toISOString();
    const existing = input.id && smokeProfiles.find((profile) => profile.id === input.id);
    const saved = {
      ...input,
      id: existing ? existing.id : `smoke-copy-${smokeProfiles.length}`,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    smokeProfiles = [...smokeProfiles.filter((profile) => profile.id !== saved.id), saved];
    return saved;
  });
  registerEnvelope('profiles:remove', (id) => {
    const found = smokeProfiles.some((profile) => profile.id === id);
    smokeProfiles = smokeProfiles.filter((profile) => profile.id !== id);
    return found;
  });
  registerEnvelope('cities:search', () => []);
  registerEnvelope('chinese:searchCities', () => []);
  registerEnvelope('locations:resolve', () => ({
    timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '1990-01-01T16:00:00.000Z',
  }));

  win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: {
      preload: path.join(root, 'src', 'preload', 'Preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.webContents.on('console-message', (...args) => {
    const details = args.at(-1);
    const level = typeof args[1] === 'number' ? args[1] : details && details.level;
    const message = typeof args[2] === 'string' ? args[2] : details && details.message;
    if (level === 'error' || level >= 3) errors.push(`console: ${message}`);
  });
  win.webContents.on('preload-error', (_event, file, error) => {
    errors.push(`preload ${file}: ${error && error.stack ? error.stack : error}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    errors.push(`render-process-gone: ${JSON.stringify(details)}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    errors.push(`did-fail-load ${code}: ${description}`);
  });
  win.webContents.once('dom-ready', () => {
    void win.webContents.executeJavaScript(`
      window.__smokeErrors = [];
      window.addEventListener('error', (event) => window.__smokeErrors.push('window: ' + event.message));
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason && (event.reason.stack || event.reason.message) || String(event.reason);
        window.__smokeErrors.push('unhandledrejection: ' + reason);
      });
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__smokeErrors.push('CSP: ' + event.violatedDirective + ' ' + event.blockedURI);
      });
    `).catch((error) => errors.push(`browser error capture: ${error.message}`));
  });

  try {
    await win.loadFile(path.join(root, 'dist', 'renderer-react', 'index.html'));

    const desktop = await poll(win, 'desktop shell', async () => {
      const heading = document.querySelector('h1');
      const nav = document.querySelector('.shell__navigation');
      const main = document.querySelector('.shell__main');
      const ai = document.querySelector('.shell__ai');
      const profileHeading = document.querySelector('.profile-detail h2');
      const profileRows = document.querySelectorAll('.profile-row');
      if (!window.mystApi || heading?.textContent !== '档案管理' || !nav || !main || !ai
        || profileHeading?.textContent !== '烟测档案' || profileRows.length < 1) return { ready: false };
      const fontFaces = await document.fonts.load('400 13px "Maple Mono NF CN"', 'CHILLAST');
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, width: value.width, height: value.height };
      };
      return { ready: true, value: {
        hasApi: Boolean(window.mystApi),
        routeButtons: document.querySelectorAll('.shell-nav__button').length,
        heading: heading.textContent,
        profileHeading: profileHeading.textContent,
        profileRows: profileRows.length,
        theme: document.documentElement.dataset.theme,
        density: document.documentElement.dataset.density,
        mapleFontLoaded: fontFaces.some((face) => face.status === 'loaded') && document.fonts.check('400 13px "Maple Mono NF CN"', 'CHILLAST'),
        nav: rect(nav), main: rect(main), ai: rect(ai),
        separators: document.querySelectorAll('[role="separator"]').length,
        narrowToolbarsHidden: Array.from(document.querySelectorAll('.shell__main-toolbar, .shell__ai-toolbar'))
          .every((toolbar) => toolbar.hidden && toolbar.getBoundingClientRect().height === 0),
      } };
    });

    if (!desktop.hasApi) throw new Error('window.mystApi is missing');
    if (desktop.routeButtons !== 6) throw new Error(`expected 6 routes, got ${desktop.routeButtons}`);
    if (desktop.profileHeading !== '烟测档案' || desktop.profileRows < 1) throw new Error('seeded profile content did not load');
    if (!['light', 'dark'].includes(desktop.theme)) throw new Error(`unresolved theme: ${desktop.theme}`);
    if (desktop.density !== 'compact') throw new Error(`unexpected density: ${desktop.density}`);
    if (!desktop.mapleFontLoaded) throw new Error('Maple regular font did not load');
    for (const [name, rect] of Object.entries({ nav: desktop.nav, main: desktop.main, ai: desktop.ai })) {
      if (rect.width <= 0 || rect.height <= 0) throw new Error(`${name} region has no dimensions`);
    }
    if (desktop.nav.right > desktop.main.left + 10 || desktop.main.right > desktop.ai.left + 10) {
      throw new Error('desktop panel dimensions overlap incoherently');
    }
    if (desktop.separators !== 2) throw new Error(`expected two separators, got ${desktop.separators}`);
    if (!desktop.narrowToolbarsHidden) throw new Error('narrow-only toolbars are visible on desktop');

    await win.webContents.executeJavaScript(`
      document.querySelectorAll('.shell-nav__button')[1].click();
      const selects = document.querySelectorAll('.workspace__appearance select');
      selects[0].value = 'dark';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      selects[1].value = 'comfortable';
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await poll(win, 'route and preferences', () => ({
      ready: document.querySelector('h1')?.textContent === '个人星盘'
        && document.documentElement.dataset.theme === 'dark'
        && document.documentElement.dataset.density === 'comfortable',
    }));

    const beforeResize = await win.webContents.executeJavaScript(`(() => {
      const handle = document.querySelectorAll('[role="separator"]')[0];
      const panel = document.querySelector('.shell__navigation-panel');
      const result = { width: panel.getBoundingClientRect().width, value: handle.getAttribute('aria-valuenow') };
      window.__smokePanelResizeBaseline = result;
      handle.focus();
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      return result;
    })()`);
    const afterResize = await poll(win, 'keyboard panel resize', () => {
      const width = document.querySelector('.shell__navigation-panel')?.getBoundingClientRect().width ?? 0;
      const baseline = window.__smokePanelResizeBaseline;
      const value = document.querySelectorAll('[role="separator"]')[0]?.getAttribute('aria-valuenow');
      return { ready: Math.abs(width - baseline.width) > 1, value: { width, value } };
    });

    win.setContentSize(1100, 720);
    const narrow = await poll(win, 'narrow shell', () => {
      const shell = document.querySelector('.shell--narrow');
      const nav = document.querySelector('.shell__navigation');
      const ai = document.querySelector('.shell__ai');
      const opener = document.querySelector('.shell__main-toolbar button');
      if (!shell || !nav || !ai || !opener) return { ready: false };
      const navRect = nav.getBoundingClientRect();
      const aiRect = ai.getBoundingClientRect();
      const openerRect = opener.getBoundingClientRect();
      return { ready: Math.abs(navRect.width - 56) <= 1 && openerRect.width > 0, value: {
        innerWidth: window.innerWidth,
        navWidth: navRect.width,
        aiHidden: ai.hidden && ai.inert && aiRect.width === 0,
        openerVisible: openerRect.width > 0 && openerRect.height > 0,
      } };
    });
    if (narrow.innerWidth > 1102 || !narrow.aiHidden || !narrow.openerVisible) {
      throw new Error(`invalid narrow geometry: ${JSON.stringify(narrow)}`);
    }

    await win.webContents.executeJavaScript(`document.querySelector('.shell__main-toolbar button').click()`);
    const overlay = await poll(win, 'AI overlay open', () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog || dialog.hidden) return { ready: false };
      const rect = dialog.getBoundingClientRect();
      return { ready: dialog.contains(document.activeElement), value: { width: rect.width, focused: dialog.contains(document.activeElement) } };
    });
    if (overlay.width <= 0 || overlay.width > 420.5 || !overlay.focused) {
      throw new Error(`invalid AI overlay: ${JSON.stringify(overlay)}`);
    }

    await win.webContents.executeJavaScript(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await poll(win, 'AI overlay close and focus restore', () => {
      const dialog = document.querySelector('[role="dialog"]');
      const opener = document.querySelector('.shell__main-toolbar button');
      return { ready: (!dialog || dialog.hidden) && document.activeElement === opener };
    });

    win.setContentSize(1440, 920);
    const restored = await poll(win, 'desktop restoration', () => {
      const shell = document.querySelector('.shell--desktop');
      const nav = document.querySelector('.shell__navigation');
      const main = document.querySelector('.shell__main');
      const ai = document.querySelector('.shell__ai');
      if (!shell || !nav || !main || !ai || ai.hidden) return { ready: false };
      const nr = nav.getBoundingClientRect();
      const mr = main.getBoundingClientRect();
      const ar = ai.getBoundingClientRect();
      return { ready: nr.width > 0 && mr.width > 0 && ar.width > 0, value: {
        heading: document.querySelector('h1')?.textContent,
        theme: document.documentElement.dataset.theme,
        density: document.documentElement.dataset.density,
        noOverlap: nr.right <= mr.left + 10 && mr.right <= ar.left + 10,
      } };
    });
    if (restored.heading !== '个人星盘' || restored.theme !== 'dark' || restored.density !== 'comfortable' || !restored.noOverlap) {
      throw new Error(`desktop state was not retained: ${JSON.stringify(restored)}`);
    }

    const pageErrors = await win.webContents.executeJavaScript('window.__smokeErrors');
    errors.push(...pageErrors);
    if (errors.length) throw new Error(errors.join(' | '));

    const screenshotDir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    const image = await win.webContents.capturePage();
    const size = image.getSize();
    const bitmap = image.toBitmap();
    const png = image.toPNG();
    let minLuminance = 255;
    let maxLuminance = 0;
    const colors = new Set();
    for (let offset = 0; offset < bitmap.length; offset += 4 * 97) {
      const blue = bitmap[offset] ?? 0;
      const green = bitmap[offset + 1] ?? 0;
      const red = bitmap[offset + 2] ?? 0;
      const luminance = Math.round((red + green + blue) / 3);
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
      colors.add(`${red},${green},${blue}`);
    }
    const screenshot = {
      width: size.width,
      height: size.height,
      bytes: png.length,
      luminanceRange: maxLuminance - minLuminance,
      sampledColors: colors.size,
    };
    if (size.width < 1000 || size.height < 700 || png.length < 10000 || screenshot.luminanceRange < 20 || colors.size < 32) {
      throw new Error(`screenshot is blank or incomplete: ${JSON.stringify(screenshot)}`);
    }
    fs.writeFileSync(path.join(screenshotDir, 'react-shell.png'), png);

    console.log('\nReact smoke report:', JSON.stringify({ desktop, keyboardResize: { before: beforeResize, after: afterResize }, narrow, overlay, restored, screenshot }, null, 2));
    console.log(`Screenshot: ${path.join(screenshotDir, 'react-shell.png')}`);
    console.log('\nReact smoke passed\n');
    finish(0);
  } catch (error) {
    fail(error && error.stack ? error.stack : String(error));
  }
});

setTimeout(() => fail('timed out after 45 seconds'), 45000);
