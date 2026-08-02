'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('Main rejects unknown close decisions and denies valid decisions until Task 7 installs a guard', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {}, BrowserWindow: class {}, dialog: {}, ipcMain: {}, nativeTheme: {}, shell: {},
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const Main = require('../src/main/Main');
    const main = new Main();
    assert.equal(main._handleCloseDecision('cancel'), false);
    assert.equal(main._handleCloseDecision('proceed'), false);
    assert.throws(() => main._handleCloseDecision('later'), /invalid close decision/i);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../src/main/Main')];
  }
});

test('Main delegates valid decisions to the installed close guard', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: {}, BrowserWindow: class {}, dialog: {}, ipcMain: {}, nativeTheme: {}, shell: {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const Main = require('../src/main/Main');
    const main = new Main();
    const decisions = [];
    main.closeGuard = { decide: (decision) => { decisions.push(decision); return true; } };
    assert.equal(main._handleCloseDecision('proceed'), true);
    assert.deepEqual(decisions, ['proceed']);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../src/main/Main')];
  }
});

test('Main writes close success only from the actual closed event before app exit', () => {
  const originalLoad = Module._load;
  const exits = [];
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: { exit: (code) => exits.push(code) }, BrowserWindow: class {}, dialog: {}, ipcMain: {}, nativeTheme: {}, shell: {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-close-order-'));
  const reportPath = path.join(directory, 'report.json');
  try {
    const Main = require('../src/main/Main');
    const main = new Main();
    main.mainWindow = { isDestroyed: () => true };
    const order = [];
    main.closeGuard = { dispose() { order.push('dispose'); } };
    const recordCloseStage = main._recordCloseStage.bind(main);
    main._recordCloseStage = (stage) => { order.push(stage); recordCloseStage(stage); };
    main.pendingSmokeCloseReport = {
      path: reportPath,
      report: { targetKind: 'react-file', errors: [], closeStages: ['decision-proceed', 'destroy'] },
      exitCode: 0,
    };
    main._handleWindowClosed();
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.closeHandshake, true);
    assert.equal(report.closeStage, 'closed');
    assert.deepEqual(report.closeStages, ['decision-proceed', 'destroy', 'closed', 'app-exit']);
    assert.deepEqual(order, ['closed', 'dispose', 'app-exit']);
    assert.deepEqual(exits, [0]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../src/main/Main')];
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
