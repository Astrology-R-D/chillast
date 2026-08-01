'use strict';

const path = require('node:path');

function isAllowedExternalUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === 'https:') {
      return /^https:\/\/[^/]/i.test(value) && Boolean(parsed.hostname);
    }
    if (parsed.protocol === 'mailto:') {
      return /^mailto:[^/]/i.test(value)
        && !parsed.host
        && /^[^?\s@]+@[^?\s@]+(?:\?[^\s]*)?$/.test(parsed.pathname + parsed.search);
    }
    return false;
  } catch (_) {
    return false;
  }
}

function installExternalUrlHandler({ webContents, shell, logger = console }) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      try {
        Promise.resolve(shell.openExternal(url)).catch((error) => {
          logger.error('[Main] opening external URL failed:', error);
        });
      } catch (error) {
        logger.error('[Main] opening external URL failed:', error);
      }
    }
    return { action: 'deny' };
  });
}

function resolveSmokeReportPath({ isPackaged, argv = [], env = {}, userData }) {
  const configuredPath = env.CHILLAST_SMOKE_REPORT;
  if (!isPackaged || !argv.includes('--chillast-smoke') || !configuredPath) return null;
  if (/^(?:\\\\|\/\/)/.test(configuredPath)) {
    throw new Error('Smoke report path cannot be a UNC path');
  }
  const root = path.resolve(userData);
  const reportPath = path.resolve(root, configuredPath);
  const relative = path.relative(root, reportPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Smoke report path must resolve inside userData');
  }
  return reportPath;
}

module.exports = { installExternalUrlHandler, isAllowedExternalUrl, resolveSmokeReportPath };
