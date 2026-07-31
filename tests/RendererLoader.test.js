'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { loadRenderer, selectRendererTarget } = require('../src/main/RendererLoader');

const appRoot = path.join('C:', 'workspace', 'chillast');

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
