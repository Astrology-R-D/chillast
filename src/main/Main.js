'use strict';

const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require('electron');

const ProfileRepository = require('./ProfileRepository');
const IpcRouter = require('./IpcRouter');
const AstrologyService = require('../core/astrology/AstrologyService');
const ChineseAstrologyService = require('../core/chinese/ChineseAstrologyService');
const ConfigManager = require('../core/config/ConfigManager');
let SwissEphCore = null;
try {
  SwissEphCore = require('../core/astrology/ephemeris/SwissEphCore');
} catch (_) { /* swisseph-v2 native binding not rebuilt for Electron yet */ }
const ChartStrategyFactory = require('../core/astrology/ChartStrategyFactory');
const AiService = require('../core/ai/AiService');
const AiSessionStore = require('./AiSessionStore');
const LocationResolver = require('../core/astrology/LocationResolver');
const { installExternalUrlHandler, resolveSmokeReportPath } = require('./MainPolicy');
const CloseGuard = require('./CloseGuard');
const {
  isNavigationAllowed,
  loadRenderer,
  reportRendererFailure,
  selectRendererTarget,
} = require('./RendererLoader');

const fs = require('fs');

/**
 * Main — Electron main-process bootstrap. It composes the application root
 * (repository, service, IPC router), creates the secured main window and manages
 * the app lifecycle. This is the composition root: all wiring happens here so the
 * collaborators themselves stay free of construction concerns.
 */
class Main {
  constructor() {
    /** @type {BrowserWindow|null} */
    this.mainWindow = null;
    this.profileRepository = null;
    this.astrologyService = null;
    this.smokeErrors = [];
    this.closeGuard = null;
    this.pendingSmokeCloseReport = null;
  }

  /** Compose services that do not depend on Electron being ready. */
  bootstrapServices() {
    this.config = ConfigManager.load();
    const localeName = this.config.locale || 'zh';
    const localePath = path.join(__dirname, '..', '..', 'locale', `${localeName}.json`);
    this.locale = JSON.parse(fs.readFileSync(localePath, 'utf-8'));

    const ephePath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'ephemeris')
      : path.join(__dirname, '..', '..', 'assets', 'ephemeris');
    if (SwissEphCore) SwissEphCore.configure({ ephePath });

    const baseDir = path.join(app.getPath('userData'), 'data');
    this.profileRepository = new ProfileRepository(baseDir).init();
    this.aiSessionStore = new AiSessionStore(baseDir).init();
    this.astrologyService = new AstrologyService(
      new ChartStrategyFactory({ backend: this.config.ephemeris.backend }),
    );
    this.chineseAstrologyService = new ChineseAstrologyService();

    // AI Service bootstrap
    const builtinKnowledgePath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'knowledge', 'builtin')
      : path.join(__dirname, '..', '..', 'assets', 'knowledge', 'builtin');
    const userKnowledgePath = path.join(app.getPath('userData'), 'knowledge', 'user');
    this.aiService = new AiService(this.astrologyService, this.chineseAstrologyService, this.profileRepository);

    // Load persisted non-secret settings from data/ai-settings.json
    const aiSettingsPath = path.join(baseDir, 'ai-settings.json');
    const persistedSettings = fs.existsSync(aiSettingsPath)
      ? JSON.parse(fs.readFileSync(aiSettingsPath, 'utf-8'))
      : {};

    const vectorIndexDir = path.join(baseDir, 'vector-index');

    // Packaged builds ship a pre-downloaded embedding model + a pre-built vector
    // index as extraResources (see package.json build). Use the bundled model
    // offline, and seed userData's index from the bundle on first run (so the
    // app is instant + offline, never downloads or rebuilds).
    const bundledModelsDir = app.isPackaged ? path.join(process.resourcesPath, 'models') : null;
    const bundledIndexDir = app.isPackaged ? path.join(process.resourcesPath, 'vector-index') : null;
    if (bundledIndexDir && fs.existsSync(bundledIndexDir) && !fs.existsSync(vectorIndexDir)) {
      try {
        fs.cpSync(bundledIndexDir, vectorIndexDir, { recursive: true });
      } catch (e) {
        console.error('[Main] seeding bundled vector-index failed:', e.message);
      }
    }
    const bundledModel = bundledModelsDir && fs.existsSync(bundledModelsDir)
      ? { localPath: bundledModelsDir, offline: true }
      : {};

    const aiSettings = {
      ...(this.config.ai || {}),
      ...persistedSettings,
      // Embeddings are configured independently of the chat provider. Cache the
      // local model under userData (node_modules is read-only when packaged);
      // when packaged, prefer the bundled offline model.
      embeddings: {
        ...(this.config.embeddings || {}),
        ...(persistedSettings.embeddings || {}),
        cacheDir: path.join(baseDir, 'models'),
        ...bundledModel,
      },
      // Web-search tool config (provider/key/endpoint), independent of chat.
      search: {
        ...(this.config.search || {}),
        ...(persistedSettings.search || {}),
      },
      knowledgeBuiltinPath: builtinKnowledgePath,
      knowledgeUserPath: userKnowledgePath,
      knowledgeIndexDir: vectorIndexDir,
    };

    const credPath = path.join(baseDir, 'ai-credentials.json');
    if (fs.existsSync(credPath)) {
      try {
        const { safeStorage } = require('electron');
        const buf = fs.readFileSync(credPath);
        let cred;
        try {
          if (safeStorage.isEncryptionAvailable()) {
            cred = JSON.parse(safeStorage.decryptString(buf));
          } else {
            throw new Error('safeStorage not available');
          }
        } catch (_) {
          cred = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
        }
        aiSettings.apiKey = cred.apiKey || '';
      } catch (_) {}
    }
    // Stream knowledge-base init progress (model download + index build) to the
    // renderer so the first-run wait shows a non-blocking overlay, not a freeze.
    this.aiService.setInitProgressHandler((p) => {
      if (this.router && this.router.webContents) this.router.webContents.send('ai:initProgress', p);
    });
    this.aiService.configure(aiSettings).then((result) => {
      if (!result.accepted) console.error('[AiService] startup configuration rejected:', result.error);
      if (this.router && this.router.webContents) {
        this.router.webContents.send('ai:statusChanged', this.aiService.status());
      }
    }).catch((e) => {
      console.error('[AiService] configure failed:', e.message);
    });

    this.router = new IpcRouter({
      ipcMain,
      profileRepository: this.profileRepository,
      astrologyService: this.astrologyService,
      chineseAstrologyService: this.chineseAstrologyService,
      config: this.config,
      locale: this.locale,
      aiService: this.aiService,
      aiSessionStore: this.aiSessionStore,
      locationResolver: new LocationResolver(),
      closeDecision: this._handleCloseDecision.bind(this),
    }).register();
  }

  _handleCloseDecision(decision) {
    if (decision !== 'proceed' && decision !== 'cancel') throw new Error('Invalid close decision');
    if (this.pendingSmokeCloseReport) this._writePendingSmokeStage(`decision-${decision}`);
    const accepted = this.closeGuard ? this.closeGuard.decide(decision) : false;
    if (accepted && decision === 'proceed' && this.pendingSmokeCloseReport) this._writePendingSmokeStage('approved', true);
    return accepted;
  }

  _writePendingSmokeStage(stage, approved = false) {
    if (!this.pendingSmokeCloseReport) return;
    const { path: reportPath, report } = this.pendingSmokeCloseReport;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, closeHandshake: approved, closeStage: stage }, null, 2), 'utf8');
  }

  createWindow() {
    const win = this.config.window || {};
    let rendererTarget;
    try {
      rendererTarget = selectRendererTarget({ isPackaged: app.isPackaged });
    } catch (error) {
      console.error('[Main] Renderer load failed:', error);
      reportRendererFailure({ app, dialog, error, win: null });
      return;
    }
    const backgroundColor = rendererTarget.kind === 'legacy'
      ? win.backgroundColor || '#1e1e1e'
      : nativeTheme.shouldUseDarkColors ? '#171719' : '#f6f6f8';
    this.mainWindow = new BrowserWindow({
      width: win.width || 1440,
      height: win.height || 920,
      minWidth: win.minWidth || 1100,
      minHeight: win.minHeight || 720,
      backgroundColor,
      title: 'CHILLAST',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'Preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });

    this.router.setWebContents(this.mainWindow.webContents);

    if (rendererTarget.kind !== 'legacy') {
      this.closeGuard = new CloseGuard({
        win: this.mainWindow,
        diagnostic: (message) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            void dialog.showMessageBox(this.mainWindow, { type: 'warning', title: 'CHILLAST', message });
          }
        },
      });
      this.closeGuard.install();
    }

    const rendererWindow = this.mainWindow;
    let smokeReportPath = null;
    try {
      smokeReportPath = resolveSmokeReportPath({
        isPackaged: app.isPackaged,
        argv: process.argv,
        env: process.env,
        userData: app.getPath('userData'),
      });
    } catch (error) {
      console.error('[Main] smoke mode rejected:', error.message);
    }
    if (smokeReportPath) this._captureSmokeErrors(rendererWindow.webContents);
    rendererWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      const requestedUrl = typeof navigationUrl === 'string' ? navigationUrl : event.url;
      if (!isNavigationAllowed(rendererTarget, requestedUrl)) event.preventDefault();
    });

    // Open approved external links in the OS browser, never inside the app shell.
    installExternalUrlHandler({ webContents: rendererWindow.webContents, shell });

    loadRenderer(rendererWindow, rendererTarget).then(() => {
      if (smokeReportPath) void this._reportSmokeWhenReady(rendererTarget, smokeReportPath);
    }).catch((error) => {
      console.error('[Main] Renderer load failed:', error);
      if (smokeReportPath) {
        this.smokeErrors.push(`load: ${error && error.message ? error.message : String(error)}`);
        this._writeSmokeReport(smokeReportPath, {
          targetKind: rendererTarget.kind,
          hasApi: false,
          marker: '',
          routes: 0,
          title: '',
          errors: this.smokeErrors,
        }, 1);
      } else {
        reportRendererFailure({ app, dialog, error, win: rendererWindow });
      }
    });
    this.mainWindow.once('ready-to-show', () => this.mainWindow.show());

    this.mainWindow.on('closed', () => {
      this.closeGuard?.dispose();
      this.closeGuard = null;
      this.mainWindow = null;
      if (this.pendingSmokeCloseReport) {
        const pendingReport = this.pendingSmokeCloseReport;
        this.pendingSmokeCloseReport = null;
        this._writeSmokeReport(pendingReport.path, { ...pendingReport.report, closeHandshake: true }, pendingReport.exitCode);
      }
    });
  }

  _captureSmokeErrors(webContents) {
    webContents.on('console-message', (...args) => {
      const details = args.at(-1);
      const level = typeof args[1] === 'number' ? args[1] : details && details.level;
      const message = typeof args[2] === 'string' ? args[2] : details && details.message;
      if (level === 'error' || level >= 3) this.smokeErrors.push(`console: ${message}`);
    });
    webContents.on('preload-error', (_event, file, error) => {
      this.smokeErrors.push(`preload ${file}: ${error && error.message ? error.message : error}`);
    });
    webContents.on('did-fail-load', (_event, code, description) => {
      this.smokeErrors.push(`did-fail-load ${code}: ${description}`);
    });
    webContents.on('render-process-gone', (_event, details) => {
      this.smokeErrors.push(`render-process-gone: ${JSON.stringify(details)}`);
    });
  }

  async _reportSmokeWhenReady(rendererTarget, reportPath) {
    const deadline = Date.now() + 15000;
    let state = null;
    while (Date.now() < deadline && this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        state = await this.mainWindow.webContents.executeJavaScript(`(() => {
          const legacy = document.querySelector('.sidebar');
          const react = document.querySelector('.shell');
          return {
            hasApi: Boolean(window.mystApi),
            marker: legacy ? 'legacy-shell' : react ? 'react-shell' : '',
            routes: legacy
              ? document.querySelectorAll('.nav-item').length
              : document.querySelectorAll('.shell-nav__button').length,
            title: document.title,
          };
        })()`);
        if (state.hasApi && state.marker && state.routes === 6 && state.title) {
          const report = {
            targetKind: rendererTarget.kind,
            ...state,
            errors: [...this.smokeErrors],
          };
          const exitCode = this.smokeErrors.length ? 1 : 0;
          if (rendererTarget.kind !== 'legacy') {
            this.pendingSmokeCloseReport = { path: reportPath, report, exitCode };
            this._writePendingSmokeStage('requested');
            this.mainWindow.close();
          } else {
            this._writeSmokeReport(reportPath, report, exitCode);
          }
          return;
        }
      } catch (error) {
        state = { probeError: error && error.message ? error.message : String(error) };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.smokeErrors.push(`shell readiness timed out: ${JSON.stringify(state)}`);
    this._writeSmokeReport(reportPath, {
      targetKind: rendererTarget.kind,
      hasApi: Boolean(state && state.hasApi),
      marker: (state && state.marker) || '',
      routes: (state && state.routes) || 0,
      title: (state && state.title) || '',
      errors: [...this.smokeErrors],
    }, 1);
  }

  _writeSmokeReport(reportPath, report, exitCode) {
    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      const temporaryPath = `${reportPath}.tmp-${process.pid}`;
      fs.writeFileSync(temporaryPath, JSON.stringify(report, null, 2), 'utf8');
      fs.renameSync(temporaryPath, reportPath);
    } catch (error) {
      console.error('[Main] smoke report failed:', error);
      exitCode = 1;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.destroy();
    app.exit(exitCode);
  }

  /** Wire the full app lifecycle. */
  start() {
    // Single-instance lock keeps the JSON store free of concurrent writers.
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return;
    }
    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
    });

    app.whenReady().then(() => {
      this.bootstrapServices();
      this.createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });

    app.on('quit', () => {
      if (SwissEphCore) SwissEphCore.close();
      if (this.aiService) this.aiService.close();
    });
  }
}

if (require.main === module) new Main().start();

module.exports = Main;
