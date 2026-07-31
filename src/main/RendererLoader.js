'use strict';

const path = require('node:path');

const DEFAULT_APP_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function selectRendererTarget({ env = process.env, appRoot = DEFAULT_APP_ROOT } = {}) {
  if (env.CHILLAST_RENDERER_URL) {
    let rendererUrl;
    try {
      rendererUrl = new URL(env.CHILLAST_RENDERER_URL);
    } catch (_) {
      throw new Error(`Invalid renderer URL: ${env.CHILLAST_RENDERER_URL}`);
    }

    if (rendererUrl.protocol !== 'http:' || !LOCAL_HOSTNAMES.has(rendererUrl.hostname)) {
      throw new Error('CHILLAST_RENDERER_URL must be an HTTP localhost renderer URL');
    }

    return {
      kind: 'react-url',
      value: rendererUrl.href.replace(/\/$/, ''),
    };
  }

  if (env.CHILLAST_RENDERER === 'react') {
    return {
      kind: 'react-file',
      value: path.join(appRoot, 'dist', 'renderer-react', 'index.html'),
    };
  }

  return {
    kind: 'legacy',
    value: path.join(appRoot, 'src', 'renderer', 'Index.html'),
  };
}

function loadRenderer(win, target) {
  if (target.kind === 'react-url') return win.loadURL(target.value);
  return win.loadFile(target.value);
}

module.exports = { loadRenderer, selectRendererTarget };
