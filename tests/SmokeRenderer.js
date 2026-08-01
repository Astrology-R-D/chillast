'use strict';

/**
 * SmokeRenderer.js — boots the real renderer inside a hidden Electron window and
 * verifies it loads cleanly: the bridge is present, the shell renders, a chart
 * computes over IPC, and the ESM ChartWheel produces valid (NaN-free) SVG in the
 * actual browser environment. Captures renderer console errors and fails on any.
 *
 * Run with `npm run smoke`. Uses a throwaway temp data dir so it never touches
 * real profiles.
 */

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runElectronSmokeController } = require('./ElectronSmokeController');

const ProfileRepository = require('../src/main/ProfileRepository');
const IpcRouter = require('../src/main/IpcRouter');
const AstrologyService = require('../src/core/astrology/AstrologyService');

runElectronSmokeController('myst-smoke-', app);

const consoleErrors = [];
const userDataDir = process.env.CHILLAST_SMOKE_USER_DATA;
let win = null;
let finished = false;

app.disableHardwareAcceleration();
app.setPath('userData', userDataDir);

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

function finish(code, message) {
  if (finished) return;
  finished = true;
  if (message) console.error(`\n✗ SMOKE FAILED: ${message}\n`);
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(code);
}

function fail(message) {
  finish(1, message);
}

app.whenReady().then(async () => {
  // Configure the Swiss Ephemeris path (Main does this in the real app); without
  // it, swisseph chart compute throws "星历数据路径未配置" and the wheel render
  // gets undefined data.
  try {
    const SwissEphCore = require('../src/core/astrology/ephemeris/SwissEphCore');
    SwissEphCore.configure({ ephePath: path.join(__dirname, '..', 'assets', 'ephemeris') });
  } catch (_) { /* swisseph optional; JS fallback otherwise */ }

  const repo = new ProfileRepository(path.join(userDataDir, 'data')).init();
  const aiService = {
    status: () => ({ configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 }),
    getInitStatus: () => null,
    setContext: () => {},
  };
  const aiSessionStore = { list: () => [] };
  new IpcRouter({
    ipcMain,
    profileRepository: repo,
    astrologyService: new AstrologyService(),
    aiService,
    aiSessionStore,
  }).register();

  win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'Preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    // level 3 === error
    if (level >= 3) consoleErrors.push(message);
  });
  win.webContents.on('preload-error', (_e, file, error) => {
    consoleErrors.push(`preload-error ${file}: ${error}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    consoleErrors.push(`did-fail-load ${code}: ${description}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    consoleErrors.push(`render-process-gone: ${JSON.stringify(details)}`);
  });
  win.webContents.once('dom-ready', () => {
    void win.webContents.executeJavaScript(`
      window.__legacySmokeErrors = [];
      window.addEventListener('error', (event) => window.__legacySmokeErrors.push('window: ' + event.message));
      window.addEventListener('unhandledrejection', (event) => window.__legacySmokeErrors.push('unhandled: ' + String(event.reason)));
      document.addEventListener('securitypolicyviolation', (event) => window.__legacySmokeErrors.push('CSP: ' + event.violatedDirective));
    `).catch((error) => consoleErrors.push(`browser error capture: ${error.message}`));
  });

  try {
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'Index.html'));
    await poll(win, 'legacy shell startup', () => ({
      ready: Boolean(
        window.mystApi
        && document.querySelector('.sidebar')
        && document.querySelectorAll('.nav-item').length >= 3
      ),
    }));

    const report = await win.webContents.executeJavaScript(`(async () => {
      const out = { hasApi: !!window.mystApi };
      out.hasSidebar = !!document.querySelector('.sidebar');
      out.brand = (document.querySelector('.brand-title')||{}).textContent || '';
      out.navItems = document.querySelectorAll('.nav-item').length;
      const mapleFaces = await document.fonts.load('400 13px "Maple Mono NF CN"', 'CHILLAST');
      out.mapleFontLoaded = mapleFaces.some((face) => face.status === 'loaded') &&
        document.fonts.check('400 13px "Maple Mono NF CN"', 'CHILLAST');

      // Save a profile + compute a natal chart over the real IPC bridge.
      const save = await window.mystApi.profiles.save({
        nameZh:'冒烟', gender:'other',
        birthData:{ year:1990, month:1, day:15, hour:14, minute:30,
          location:{ label:'北京', latitude:39.9042, longitude:116.4074 } }
      });
      out.saveOk = save && save.ok;
      const ref = (await window.mystApi.getReferenceData()).data;
      const chartRes = await window.mystApi.computeChart({ type:'natal', primary: save.data });
      out.chartOk = chartRes && chartRes.ok;
      out.ringPoints = out.chartOk ? chartRes.data.rings[0].points.length : 0;

      // Render the wheel via the real ESM module in this browser context.
      const mod = await import('./app/components/ChartWheel.js');
      const wheel = new mod.ChartWheel(ref);
      const svg = wheel.toSvg(chartRes.data);
      out.svgValid = svg.startsWith('<svg') && svg.endsWith('</svg>');
      out.svgHasNaN = /NaN/.test(svg);
      out.svgLen = svg.length;
      return out;
    })()`);
    consoleErrors.push(...await win.webContents.executeJavaScript('window.__legacySmokeErrors || []'));

    console.log('\nSmoke report:', JSON.stringify(report, null, 2));
    console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

    const problems = [];
    if (!report.hasApi) problems.push('window.mystApi missing');
    if (!report.hasSidebar) problems.push('shell did not render (.sidebar missing)');
    if (report.navItems < 3) problems.push('navigation incomplete');
    if (!report.mapleFontLoaded) problems.push('Maple Mono regular font did not load');
    if (!report.saveOk) problems.push('profile save failed');
    if (!report.chartOk) problems.push('chart compute failed');
    if (report.ringPoints < 10) problems.push('chart has too few points');
    if (!report.svgValid) problems.push('SVG invalid');
    if (report.svgHasNaN) problems.push('SVG contains NaN coordinates');
    if (consoleErrors.length) problems.push(`renderer console errors: ${consoleErrors.join(' | ')}`);

    if (problems.length) {
      fail(problems.join('; '));
    } else {
      console.log('\n✓ SMOKE PASSED\n');
      finish(0);
    }
  } catch (err) {
    fail((err && err.stack) || String(err));
  }
});

// Safety timeout.
setTimeout(() => fail('timed out'), 30000);
