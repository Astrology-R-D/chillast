'use strict';

/**
 * Screenshot.js — boots the full app with seeded sample profiles and captures
 * PNGs of the key screens (profile manager, natal chart, synastry) for visual
 * verification. Output goes to tests/screenshots/. Uses a temp data dir.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');

const ProfileRepository = require('../src/main/ProfileRepository');
const IpcRouter = require('../src/main/IpcRouter');
const AstrologyService = require('../src/core/astrology/AstrologyService');

app.disableHardwareAcceleration();

const outDir = path.join(__dirname, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

async function shoot(win, name) {
  await new Promise((r) => setTimeout(r, 700));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, name), img.toPNG());
  console.log('saved', name);
}

app.whenReady().then(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myst-shot-'));
  const repo = new ProfileRepository(tmpDir).init();
  repo.save({ nameZh: '李清照', nameEn: 'Li Qingzhao', gender: 'female', birthData: { year: 1990, month: 1, day: 15, hour: 14, minute: 30, location: { label: '北京 Beijing', latitude: 39.9042, longitude: 116.4074 } } });
  repo.save({ nameZh: '苏轼', nameEn: 'Su Shi', gender: 'male', birthData: { year: 1992, month: 7, day: 3, hour: 9, minute: 5, location: { label: '上海 Shanghai', latitude: 31.2304, longitude: 121.4737 } } });
  new IpcRouter({ ipcMain, profileRepository: repo, astrologyService: new AstrologyService() }).register();

  const win = new BrowserWindow({
    show: false, width: 1440, height: 920,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'Preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.showInactive();

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'Index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  // 1) Profiles view
  await shoot(win, '1-profiles.png');

  // 2) Natal chart
  await win.webContents.executeJavaScript(`(async () => {
    const app = window.__mystApp;
    app.navigate('personal');
    await new Promise(r => setTimeout(r, 350));
    await app.views.personal._compute();
    await new Promise(r => setTimeout(r, 300));
  })()`);
  await shoot(win, '2-natal.png');

  // 3) Synastry chart
  await win.webContents.executeJavaScript(`(async () => {
    const app = window.__mystApp;
    app.navigate('relationship');
    await new Promise(r => setTimeout(r, 350));
    await app.views.relationship._compute();
    await new Promise(r => setTimeout(r, 300));
  })()`);
  await shoot(win, '3-synastry.png');

  console.log('screenshots done');
  app.exit(0);
});

setTimeout(() => { console.error('screenshot timed out'); app.exit(1); }, 40000);
