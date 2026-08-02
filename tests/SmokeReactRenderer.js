'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runElectronSmokeController } = require('./ElectronSmokeController');
const { imageMetrics } = require('./NativeImageMetrics');
const CloseGuard = require('../src/main/CloseGuard');
const IpcRouter = require('../src/main/IpcRouter');

runElectronSmokeController('chillast-react-smoke-', app);

const root = path.join(__dirname, '..');
const errors = [];
const expectedProfileScreenshotNames = [
  'profile-1440x920-light-compact.png',
  'profile-1280x800-light-compact.png',
  'profile-1100x720-light-compact.png',
  'profile-1440x920-dark-comfortable.png',
  'profile-1280x800-dark-comfortable.png',
  'profile-1100x720-dark-comfortable.png',
];
const anchorProfile = {
  id: 'anchor-profile', nameZh: '基础档案', nameEn: 'Anchor Profile', gender: 'other',
  birthData: { year: 1988, month: 6, day: 7, hour: 8, minute: 9, location: { label: '杭州 / Hangzhou', latitude: 30.2741, longitude: 120.1551 } },
  notes: 'Anchor', tags: ['Baseline'], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
};
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
let smokeProfiles = [anchorProfile, seededProfile];
const userDataDir = process.env.CHILLAST_SMOKE_USER_DATA;
let win = null;
let closeGuard = null;
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
  closeGuard?.dispose();
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

async function restoreWindow(win) {
  const restored = new Promise((resolve) => {
    let timer;
    const done = () => { clearTimeout(timer); win.removeListener('unmaximize', done); resolve(); };
    win.once('unmaximize', done);
    timer = setTimeout(done, 500);
  });
  win.unmaximize();
  await restored;
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function waitForRendererSize(win, width, height, timeout = 1000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await win.webContents.executeJavaScript(`({ width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio })`);
    if (value.width === width && value.height === height) return { ready: true, value };
    const contentBounds = win.getContentBounds();
    if (value.width === contentBounds.width && value.height === contentBounds.height) return { ready: false, value };
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return { ready: false, value };
}

async function setExactContentSize(win, width, height) {
  const deadline = Date.now() + 10000;
  if (win.isMaximized()) await restoreWindow(win);
  const current = await win.webContents.executeJavaScript(`({ width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio })`);
  if (current.width === width && current.height === height) return current;
  let centered = false;
  let contentWidth = width;
  let contentHeight = height;
  let last;
  const observed = new Set();
  while (Date.now() < deadline) {
    if (win.isMaximized()) await restoreWindow(win);
    const resized = new Promise((resolve) => {
      let timer;
      const done = () => { clearTimeout(timer); win.removeListener('resize', done); resolve(); };
      win.once('resize', done);
      timer = setTimeout(done, 300);
    });
    win.setContentSize(contentWidth, contentHeight);
    await resized;
    last = await waitForRendererSize(win, width, height);
    if (last.ready) return last.value;
    const observation = `${contentWidth}x${contentHeight}:${last.value.width}x${last.value.height}`;
    if (observed.has(observation) && !centered) {
      win.center(); centered = true;
      contentWidth = width; contentHeight = height; observed.clear();
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    observed.add(observation);
    const widthDelta = width - last.value.width;
    const heightDelta = height - last.value.height;
    contentWidth = Math.abs(widthDelta) <= 8 ? contentWidth + widthDelta : width;
    contentHeight = Math.abs(heightDelta) <= 8 ? contentHeight + heightDelta : height;
  }
  const nativeState = {
    bounds: win.getBounds(),
    contentBounds: win.getContentBounds(),
    position: win.getPosition(),
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
  };
  throw new Error(`exact viewport ${width}x${height} timed out; last result: ${JSON.stringify({ last, nativeState })}`);
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
  registerEnvelope('cities:search', () => [{ key: 'shanghai', label: '上海 / Shanghai', nameZh: '上海', nameEn: 'Shanghai', region: '', country: 'CN', latitude: 31.2304, longitude: 121.4737, source: 'western' }]);
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
  const closeDiagnostics = [];
  const closeStages = [];
  let rejectNextCloseDecision = false;
  let resolveCloseTimeout;
  let resolveSecondCloseRequest;
  const closeTimeout = new Promise((resolve) => { resolveCloseTimeout = resolve; });
  const secondCloseRequest = new Promise((resolve) => { resolveSecondCloseRequest = resolve; });
  closeGuard = new CloseGuard({
    win,
    timeoutMs: 250,
    diagnostic: (message) => { closeDiagnostics.push(message); resolveCloseTimeout(message); },
    onStage: (stage) => {
      closeStages.push(stage);
      if (stage === 'request-sent' && closeStages.filter((value) => value === stage).length === 2) resolveSecondCloseRequest();
    },
  });
  const closeRouter = new IpcRouter({ ipcMain });
  closeRouter.setWebContents(win.webContents);
  closeRouter._handle('app:closeDecision', (_event, decision) => {
    if (rejectNextCloseDecision) {
      rejectNextCloseDecision = false;
      throw new Error('trusted close IPC rejection');
    }
    return closeGuard.decide(decision);
  });
  closeGuard.install();

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
        || profileHeading?.textContent !== '基础档案' || profileRows.length < 2) return { ready: false };
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
    if (desktop.profileHeading !== '基础档案' || desktop.profileRows < 2) throw new Error('seeded profile content did not load');
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

    await win.webContents.executeJavaScript(`(() => {
      const search = document.querySelector('[type="search"]');
      Object.getOwnPropertyDescriptor(search.constructor.prototype, 'value').set.call(search, 'Smoke');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const initialSearchVerified = await poll(win, 'Smoke profile search', () => ({
      ready: document.querySelectorAll('.profile-row').length === 1 && document.querySelector('.profile-row')?.textContent.includes('Smoke Profile'), value: true,
    }));
    await win.webContents.executeJavaScript(`document.querySelector('.profile-row').click()`);
    await poll(win, 'Smoke profile selection', () => ({ ready: document.querySelector('.profile-detail h2')?.textContent === '烟测档案' }));
    await win.webContents.executeJavaScript(`document.querySelector('[aria-label="设为主档案"]').click()`);
    const primaryMarkerVerified = await poll(win, 'visible primary marker', () => {
      const row = document.querySelector('[data-profile-id="smoke-profile"]');
      return { ready: Boolean(document.querySelector('.profile-detail__primary')?.textContent.includes('主档案') && row?.textContent.includes('主档案') && row?.getAttribute('aria-label')?.includes('主档案')), value: true };
    });
    await win.webContents.executeJavaScript(`document.querySelectorAll('.profile-detail__commands button')[1].click()`);
    await poll(win, 'direct transit route', () => ({ ready: document.querySelector('h1')?.textContent === '个人星盘' }));
    await win.webContents.executeJavaScript(`document.querySelectorAll('.shell-nav__button')[0].click()`);
    await poll(win, 'return to profiles', () => ({ ready: document.querySelector('.profile-detail h2')?.textContent === '烟测档案' }));

    await win.webContents.executeJavaScript(`document.querySelector('[data-profile-create]').click()`);
    await poll(win, 'create form', () => ({ ready: Boolean(document.querySelector('.profile-form')) }));
    await win.webContents.executeJavaScript(`(() => {
      const set = (selector, value) => {
        const element = document.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('[name="nameZh"]', '新建烟测档案');
      for (const [name, value] of Object.entries({ year: '2001', month: '02', day: '03', hour: '04', minute: '05' })) set('[name="' + name + '"]', value);
      set('[role="combobox"][aria-autocomplete="list"]', '上海');
    })()`);
    await poll(win, 'city result', () => ({ ready: Boolean(document.querySelector('.location-picker__results [role="option"]')) }));
    await win.webContents.executeJavaScript(`document.querySelector('.location-picker__results [role="option"]').click()`);
    await poll(win, 'location resolution', () => ({ ready: document.querySelector('.location-picker__timezone')?.textContent.includes('Asia/Shanghai') }));
    await win.webContents.executeJavaScript(`document.querySelector('.profile-form button[type="submit"]').click()`);
    await poll(win, 'created profile refetch', () => ({ ready: document.querySelector('.profile-detail h2')?.textContent === '新建烟测档案' && document.querySelectorAll('.profile-row').length === 3 }));

    await win.webContents.executeJavaScript(`document.querySelector('.profile-detail__actions button').click()`);
    await poll(win, 'edit form', () => ({ ready: Boolean(document.querySelector('.profile-form [name="notes"]')) }));
    await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector('.profile-form [name="notes"]');
      Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set.call(element, '未保存烟测备注');
      element.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    win.close();
    await poll(win, 'native dirty close dialog', () => ({ ready: Boolean(document.querySelector('.dirty-navigation__dialog')) }));
    const nativeCloseTimedOut = Boolean(await closeTimeout);
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.dirty-navigation__dialog button')).find((button) => button.textContent === '放弃更改').click()`);
    const nativeCloseRejectedRetained = await poll(win, 'rejected native close retained', () => ({
      ready: document.querySelector('.dirty-navigation__dialog [role="alert"]')?.textContent.includes('关闭请求已失效')
        && document.querySelector('.profile-form [name="notes"]')?.value === '未保存烟测备注',
      value: true,
    }));
    win.close();
    await secondCloseRequest;
    rejectNextCloseDecision = true;
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.dirty-navigation__dialog button')).find((button) => button.textContent === '放弃更改').click()`);
    const nativeCloseIpcRejectedRetained = await poll(win, 'rejected close IPC retained', () => ({
      ready: document.querySelector('.dirty-navigation__dialog [role="alert"]')?.textContent.includes('trusted close IPC rejection')
        && document.querySelector('.profile-form [name="notes"]')?.value === '未保存烟测备注',
      value: true,
    }));
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.dirty-navigation__dialog button')).find((button) => button.textContent === '取消').click()`);
    const nativeCloseRetryCanceled = await poll(win, 'retried native close canceled', () => ({
      ready: !document.querySelector('.dirty-navigation__dialog')
        && document.querySelector('.profile-form [name="notes"]')?.value === '未保存烟测备注',
      value: true,
    }));
    await win.webContents.executeJavaScript(`document.querySelectorAll('.shell-nav__button')[1].click()`);
    const dirtyCancelRetained = await poll(win, 'dirty dialog', () => ({ ready: Boolean(document.querySelector('.dirty-navigation__dialog')), value: true }));
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.dirty-navigation__dialog button')).find((button) => button.textContent === '取消').click()`);
    await poll(win, 'dirty cancel retained', () => ({ ready: document.querySelector('.profile-form [name="notes"]')?.value === '未保存烟测备注' && document.querySelector('h1')?.textContent === '档案管理' }));
    await win.webContents.executeJavaScript(`document.querySelectorAll('.shell-nav__button')[1].click()`);
    await poll(win, 'dirty dialog repeated', () => ({ ready: Boolean(document.querySelector('.dirty-navigation__dialog')) }));
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.dirty-navigation__dialog button')).find((button) => button.textContent === '保存并继续').click()`);
    const dirtySaveNavigated = await poll(win, 'dirty save navigation', () => ({ ready: document.querySelector('h1')?.textContent === '个人星盘', value: true }));
    if (smokeProfiles.find(({ id }) => id === 'smoke-copy-2')?.notes !== '未保存烟测备注') throw new Error('dirty save did not update backend before navigation');
    await win.webContents.executeJavaScript(`document.querySelectorAll('.shell-nav__button')[0].click()`);
    await poll(win, 'saved profile return', () => ({ ready: Boolean(document.querySelector('[data-profile-id="smoke-copy-2"]')) }));
    await win.webContents.executeJavaScript(`document.querySelector('[data-profile-id="smoke-copy-2"]').click()`);
    await poll(win, 'saved profile selected', () => ({ ready: document.querySelector('.profile-detail h2')?.textContent === '新建烟测档案' }));
    await win.webContents.executeJavaScript(`document.querySelector('.profile-detail__actions button').click()`);
    await poll(win, 'discard edit form', () => ({ ready: Boolean(document.querySelector('.profile-form [name="notes"]')) }));
    await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector('.profile-form [name="notes"]');
      Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set.call(element, '应放弃烟测备注');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelectorAll('.shell-nav__button')[1].click();
    })()`);
    await poll(win, 'dirty discard dialog', () => ({ ready: Boolean(document.querySelector('.dirty-navigation__dialog')) }));
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.dirty-navigation__dialog button')).find((button) => button.textContent === '放弃更改').click()`);
    const dirtyDiscardNavigated = await poll(win, 'dirty discard navigation', () => ({ ready: document.querySelector('h1')?.textContent === '个人星盘', value: true }));
    await win.webContents.executeJavaScript(`document.querySelectorAll('.shell-nav__button')[0].click()`);
    await poll(win, 'profile after discard', () => ({ ready: document.querySelector('.profile-detail h2')?.textContent === '烟测档案' }));
    await win.webContents.executeJavaScript(`document.querySelectorAll('.profile-detail__actions button')[1].click()`);
    await poll(win, 'duplicate profile', () => ({ ready: document.querySelectorAll('.profile-row').length === 4 }));
    await win.webContents.executeJavaScript(`document.querySelector('.profile-detail__actions button:last-child').click()`);
    await poll(win, 'delete dialog', () => ({ ready: Boolean(document.querySelector('.profile-dialog')) }));
    const profileModalIsolated = await win.webContents.executeJavaScript(`(() => {
      const background = document.querySelector('.profile-page__background');
      const copy = background?.querySelector('[aria-label="复制档案"]');
      copy?.focus();
      return Boolean(background?.inert && background?.getAttribute('aria-hidden') === 'true' && document.activeElement !== copy);
    })()`);
    if (!profileModalIsolated) throw new Error('delete dialog did not isolate the profile background');
    await win.webContents.executeJavaScript(`document.querySelector('.profile-dialog__actions button:last-child').click()`);
    await poll(win, 'delete duplicate', () => ({ ready: document.querySelectorAll('.profile-row').length === 3 && !document.querySelector('.profile-dialog') }));

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

    await setExactContentSize(win, 1100, 720);
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

    await setExactContentSize(win, 1440, 920);
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

    const screenshotDir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    for (const file of fs.readdirSync(screenshotDir)) if (/^profile-.*\.png$/.test(file)) fs.rmSync(path.join(screenshotDir, file));
    const profileScreenshots = [];
    let screenshotIndex = 0;
    for (const appearance of [
      { theme: 'light', density: 'compact' },
      { theme: 'dark', density: 'comfortable' },
    ]) {
      for (const [width, height] of [[1440, 920], [1280, 800], [1100, 720]]) {
        errors.push(...await win.webContents.executeJavaScript('window.__smokeErrors || []'));
        smokeProfiles = [seededProfile];
        await setExactContentSize(win, width, height);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('renderer reload timed out')), 10000);
          win.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolve(); });
          win.webContents.reload();
        });
        await poll(win, `reloaded profile shell ${width}x${height}`, () => ({
          ready: Boolean(document.querySelector('.workspace__appearance select') && document.querySelector('.profile-detail h2')),
        }));
        const viewport = await setExactContentSize(win, width, height);
        await win.webContents.executeJavaScript(`(() => {
          window.__smokeErrors = [];
          window.__smokeExpectedTheme = '${appearance.theme}';
          window.__smokeExpectedDensity = '${appearance.density}';
          window.addEventListener('error', (event) => window.__smokeErrors.push('window: ' + event.message));
          window.addEventListener('unhandledrejection', (event) => window.__smokeErrors.push('unhandledrejection: ' + String(event.reason)));
          const selects = document.querySelectorAll('.workspace__appearance select');
          selects[0].value = '${appearance.theme}'; selects[0].dispatchEvent(new Event('change', { bubbles: true }));
          selects[1].value = '${appearance.density}'; selects[1].dispatchEvent(new Event('change', { bubbles: true }));
          document.querySelectorAll('.shell-nav__button')[0].click();
        })()`);
        const geometry = await poll(win, `profile geometry ${width}x${height}`, () => {
          const page = document.querySelector('.profile-page');
          const directory = document.querySelector('.profile-directory');
          const detail = document.querySelector('.profile-detail');
          const root = document.getElementById('root');
          const background = document.querySelector('.dirty-navigation__background');
          const shell = document.querySelector('.shell');
          if (!page || !directory || !detail || !root || !background || !shell || document.querySelector('h1')?.textContent !== '档案管理'
            || document.querySelector('.profile-detail h2')?.textContent !== '烟测档案'
            || document.querySelectorAll('.profile-row').length !== 1
            || document.documentElement.dataset.theme !== window.__smokeExpectedTheme
            || document.documentElement.dataset.density !== window.__smokeExpectedDensity) return { ready: false, value: {
              route: document.querySelector('h1')?.textContent,
              profile: document.querySelector('.profile-detail h2')?.textContent,
              rows: document.querySelectorAll('.profile-row').length,
              theme: document.documentElement.dataset.theme,
              density: document.documentElement.dataset.density,
              page: Boolean(page), directory: Boolean(directory), detail: Boolean(detail), root: Boolean(root), background: Boolean(background), shell: Boolean(shell),
            } };
          const rect = (element) => {
            const value = element.getBoundingClientRect();
            return { left: value.left, top: value.top, width: value.width, height: value.height };
          };
          const pageRect = page.getBoundingClientRect();
          const directoryRect = directory.getBoundingClientRect();
          const detailRect = detail.getBoundingClientRect();
          const sideBySide = directoryRect.right <= detailRect.left + 1;
          const stacked = directoryRect.bottom <= detailRect.top + 1;
          const controlsFit = Array.from(document.querySelectorAll('[data-profile-control]')).every((element) => element.scrollWidth <= element.clientWidth + 1);
          const labelsFit = Array.from(document.querySelectorAll('.profile-page label, .profile-page h2, .profile-page h3')).every((element) => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1);
          return { ready: true, value: {
            logicalWidth: window.innerWidth, logicalHeight: window.innerHeight, deviceScaleFactor: window.devicePixelRatio,
            root: rect(root), background: rect(background), shell: rect(shell),
            pageWidth: pageRect.width, sideBySide, stacked, controlsFit, labelsFit, bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
          } };
        });
        const fillsViewport = ['root', 'background', 'shell'].every((name) => {
          const bounds = geometry[name];
          return Math.abs(bounds.left) <= 1 && Math.abs(bounds.top) <= 1
            && Math.abs(bounds.width - width) <= 1 && Math.abs(bounds.height - height) <= 1;
        });
        if (geometry.logicalWidth !== width || geometry.logicalHeight !== height || !fillsViewport
          || (geometry.pageWidth >= 760 ? !geometry.sideBySide : !geometry.stacked) || !geometry.controlsFit || !geometry.labelsFit || geometry.bodyOverflow > 1) {
          throw new Error(`invalid profile geometry: ${JSON.stringify({ width, height, ...appearance, ...geometry })}`);
        }
        win.showInactive();
        win.webContents.invalidate();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await win.webContents.capturePage();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const image = await win.webContents.capturePage();
        const metrics = imageMetrics(image, {
          logicalWidth: width,
          logicalHeight: height,
          requestedScaleFactor: viewport.deviceScaleFactor,
        });
        const computedName = `profile-${width}x${height}-${appearance.theme}-${appearance.density}.png`;
        const name = expectedProfileScreenshotNames[screenshotIndex++];
        if (name !== computedName) throw new Error(`unexpected screenshot matrix order: ${computedName}`);
        if (metrics.bytes < 10000 || metrics.luminanceRange < 20 || metrics.sampledColors < 32) {
          throw new Error(`screenshot is blank or incomplete: ${JSON.stringify({ name, ...metrics, png: undefined })}`);
        }
        fs.writeFileSync(path.join(screenshotDir, name), metrics.png);
        profileScreenshots.push({ name, logicalWidth: width, logicalHeight: height,
          requestedScaleFactor: metrics.requestedScaleFactor, selectedScaleFactor: metrics.selectedScaleFactor,
          nativeWidth: metrics.nativeWidth, nativeHeight: metrics.nativeHeight,
          actualScaleX: metrics.actualScaleX, actualScaleY: metrics.actualScaleY,
          bytes: metrics.bytes, luminanceRange: metrics.luminanceRange, sampledColors: metrics.sampledColors, geometry });
      }
    }

    const pageErrors = await win.webContents.executeJavaScript('window.__smokeErrors');
    errors.push(...pageErrors);
    if (errors.length) throw new Error(errors.join(' | '));

    console.log('\nReact smoke report:', JSON.stringify({ desktop, keyboardResize: { before: beforeResize, after: afterResize }, narrow, overlay, restored, initialSearchVerified, primaryMarkerVerified, nativeCloseTimedOut, nativeCloseRejectedRetained, nativeCloseIpcRejectedRetained, nativeCloseRetryCanceled, profileModalIsolated, closeDiagnostics, closeStages, dirtyCancelRetained, dirtySaveNavigated, dirtyDiscardNavigated, profileScreenshots }, null, 2));
    console.log('\nReact smoke passed\n');
    finish(0);
  } catch (error) {
    fail(error && error.stack ? error.stack : String(error));
  }
});

setTimeout(() => fail('timed out after 90 seconds'), 90000);
