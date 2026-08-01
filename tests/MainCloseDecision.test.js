'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
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
