'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  loadRenderer,
  reportRendererFailure,
  selectRendererTarget,
} = require('../src/main/RendererLoader');

const appRoot = path.join('C:', 'workspace', 'chillast');

test('exports a pure renderer failure reporter', () => {
  assert.equal(typeof reportRendererFailure, 'function');
});

test('renderer failure reporter shows the error, destroys a live window, and quits', () => {
  const calls = [];
  const app = { quit: () => calls.push(['quit']) };
  const dialog = {
    showErrorBox: (title, message) => calls.push(['dialog', title, message]),
  };
  const win = {
    isDestroyed: () => false,
    removeAllListeners: (event) => calls.push(['removeAllListeners', event]),
    destroy: () => calls.push(['destroy']),
  };

  reportRendererFailure({
    app,
    dialog,
    error: new Error('ERR_CONNECTION_REFUSED'),
    win,
  });

  assert.equal(calls[0][0], 'dialog');
  assert.equal(calls[0][1], 'CHILLAST 启动失败');
  assert.match(calls[0][2], /ERR_CONNECTION_REFUSED/);
  assert.deepEqual(calls.slice(1), [
    ['removeAllListeners', 'ready-to-show'],
    ['destroy'],
    ['quit'],
  ]);
});

test('renderer failure reporter does not destroy an already destroyed window', () => {
  let destroyCalls = 0;
  let quitCalls = 0;

  reportRendererFailure({
    app: { quit: () => { quitCalls += 1; } },
    dialog: { showErrorBox: () => {} },
    error: new Error('load failed'),
    win: {
      isDestroyed: () => true,
      removeAllListeners: () => { throw new Error('must not remove listeners'); },
      destroy: () => { destroyCalls += 1; },
    },
  });

  assert.equal(destroyCalls, 0);
  assert.equal(quitCalls, 1);
});

test('renderer failure reporter handles failure before a window exists', () => {
  const dialogs = [];
  let quitCalls = 0;

  reportRendererFailure({
    app: { quit: () => { quitCalls += 1; } },
    dialog: {
      showErrorBox: (title, message) => dialogs.push({ title, message }),
    },
    error: new Error('Invalid renderer URL: bad-url'),
    win: null,
  });

  assert.deepEqual(dialogs, [{
    title: 'CHILLAST 启动失败',
    message: 'Invalid renderer URL: bad-url',
  }]);
  assert.equal(quitCalls, 1);
});

test('default environment selects the legacy renderer file', () => {
  assert.deepEqual(selectRendererTarget({ env: {}, appRoot }), {
    kind: 'legacy',
    value: path.join(appRoot, 'src', 'renderer', 'Index.html'),
  });
});

test('react flag selects the built React renderer file', () => {
  assert.deepEqual(selectRendererTarget({
    env: { CHILLAST_RENDERER: 'react' },
    appRoot,
  }), {
    kind: 'react-file',
    value: path.join(appRoot, 'dist', 'renderer-react', 'index.html'),
  });
});

test('renderer URL accepts localhost HTTP addresses and strips a trailing slash', () => {
  for (const value of [
    'http://127.0.0.1:5173/',
    'http://localhost:5173/',
    'http://[::1]:5173/',
  ]) {
    assert.deepEqual(selectRendererTarget({
      env: { CHILLAST_RENDERER_URL: value },
      appRoot,
    }), {
      kind: 'react-url',
      value: value.slice(0, -1),
    });
  }
});

test('renderer URL normalization preserves query and fragment values', () => {
  assert.deepEqual(selectRendererTarget({
    env: { CHILLAST_RENDERER_URL: 'http://localhost:5173/?asset=/#route/' },
    appRoot,
  }), {
    kind: 'react-url',
    value: 'http://localhost:5173?asset=/#route/',
  });
});

test('renderer URL rejects remote HTTP and HTTPS addresses', () => {
  for (const value of [
    'http://example.com:5173',
    'https://localhost:5173',
    'https://example.com',
  ]) {
    assert.throws(
      () => selectRendererTarget({ env: { CHILLAST_RENDERER_URL: value }, appRoot }),
      /localhost renderer URL/i,
    );
  }
});

test('renderer URL rejects malformed values clearly', () => {
  assert.throws(
    () => selectRendererTarget({
      env: { CHILLAST_RENDERER_URL: 'not a URL' },
      appRoot,
    }),
    /invalid renderer URL/i,
  );
});

test('renderer URL takes priority over the React renderer flag', () => {
  assert.deepEqual(selectRendererTarget({
    env: {
      CHILLAST_RENDERER: 'react',
      CHILLAST_RENDERER_URL: 'http://localhost:5173/',
    },
    appRoot,
  }), {
    kind: 'react-url',
    value: 'http://localhost:5173',
  });
});

test('loadRenderer delegates URL targets to loadURL', async () => {
  const calls = [];
  const win = {
    loadURL(value) {
      calls.push(['url', value]);
      return Promise.resolve();
    },
    loadFile(value) {
      calls.push(['file', value]);
      return Promise.resolve();
    },
  };

  await loadRenderer(win, { kind: 'react-url', value: 'http://localhost:5173' });

  assert.deepEqual(calls, [['url', 'http://localhost:5173']]);
});

test('loadRenderer delegates legacy and React file targets to loadFile', async () => {
  for (const kind of ['legacy', 'react-file']) {
    const calls = [];
    const win = {
      loadURL(value) {
        calls.push(['url', value]);
        return Promise.resolve();
      },
      loadFile(value) {
        calls.push(['file', value]);
        return Promise.resolve();
      },
    };

    await loadRenderer(win, { kind, value: `${kind}.html` });
    assert.deepEqual(calls, [['file', `${kind}.html`]]);
  }
});

test('target kinds distinguish React renderers from legacy background behavior', () => {
  const legacy = selectRendererTarget({ env: {}, appRoot });
  const reactFile = selectRendererTarget({
    env: { CHILLAST_RENDERER: 'react' },
    appRoot,
  });
  const reactUrl = selectRendererTarget({
    env: { CHILLAST_RENDERER_URL: 'http://localhost:5173' },
    appRoot,
  });

  assert.equal(legacy.kind, 'legacy');
  assert.match(reactFile.kind, /^react-/);
  assert.match(reactUrl.kind, /^react-/);
});
