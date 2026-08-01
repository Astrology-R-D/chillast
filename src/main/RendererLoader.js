'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');

const DEFAULT_APP_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function selectRendererTarget({ env = process.env, appRoot = DEFAULT_APP_ROOT, isPackaged = false } = {}) {
  if (env.CHILLAST_RENDERER_URL) {
    if (isPackaged) {
      throw new Error('CHILLAST_RENDERER_URL is disabled in packaged applications');
    }
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
      value: rendererUrl.origin
        + rendererUrl.pathname.replace(/\/$/, '')
        + rendererUrl.search
        + rendererUrl.hash,
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

function isNavigationAllowed(target, requestedUrl) {
  try {
    const candidate = new URL(requestedUrl);
    if (target.kind === 'react-url') {
      return candidate.origin === new URL(target.value).origin;
    }
    if (candidate.protocol !== 'file:') return false;

    const candidatePath = path.resolve(fileURLToPath(candidate));
    const targetPath = path.resolve(target.value);
    return process.platform === 'win32'
      ? candidatePath.toLowerCase() === targetPath.toLowerCase()
      : candidatePath === targetPath;
  } catch (_) {
    return false;
  }
}

function loadRenderer(win, target) {
  if (target.kind === 'react-url') return win.loadURL(target.value);
  return win.loadFile(target.value);
}

function reportRendererFailure({ app, dialog, error, win }) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    dialog.showErrorBox('CHILLAST 启动失败', message);
  } finally {
    try {
      if (win && !win.isDestroyed()) {
        win.removeAllListeners('ready-to-show');
        win.destroy();
      }
    } finally {
      app.quit();
    }
  }
}

module.exports = { isNavigationAllowed, loadRenderer, reportRendererFailure, selectRendererTarget };
