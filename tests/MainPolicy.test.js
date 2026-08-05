'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  installExternalUrlHandler,
  isAllowedExternalUrl,
  resolveSmokeReportPath,
} = require('../src/main/MainPolicy');

test('all staged renderer windows enforce the sandboxed preload policy', () => {
  for (const relativePath of [
    '../src/main/Main.js',
    './SmokeRenderer.js',
    './SmokeReactRenderer.js',
  ]) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
    assert.match(source, /contextIsolation:\s*true/, relativePath);
    assert.match(source, /nodeIntegration:\s*false/, relativePath);
    assert.match(source, /sandbox:\s*true/, relativePath);
    assert.doesNotMatch(source, /sandbox:\s*false/, relativePath);
  }
});

test('external URL policy allows only credential-free HTTPS and valid mail addresses', () => {
  for (const value of [
    'https://example.com/path?q=1#section',
    'mailto:user@example.com',
    'mailto:user@example.com?subject=Hello',
  ]) assert.equal(isAllowedExternalUrl(value), true, value);

  for (const value of [
    'http://example.com', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)',
    'data:text/html,test', 'custom:payload', 'C:\\Windows\\System32\\calc.exe',
    './relative.exe', 'not a URL', 'https://user:pass@example.com', 'https:///missing-host',
    'mailto:', 'mailto://user@example.com',
  ]) assert.equal(isAllowedExternalUrl(value), false, value);
});

test('window open handler always denies and opens only allowed URLs', async () => {
  let handler;
  const opened = [];
  const errors = [];
  installExternalUrlHandler({
    webContents: { setWindowOpenHandler: (value) => { handler = value; } },
    shell: { openExternal: (url) => { opened.push(url); return Promise.resolve(); } },
    logger: { error: (...args) => errors.push(args) },
  });

  for (const url of ['http://example.com', 'javascript:alert(1)', 'C:\\bad.exe']) {
    assert.deepEqual(handler({ url }), { action: 'deny' });
  }
  assert.deepEqual(handler({ url: 'https://example.com' }), { action: 'deny' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(opened, ['https://example.com']);
  assert.deepEqual(errors, []);
});

test('external open rejection is logged without becoming unhandled', async () => {
  let handler;
  const errors = [];
  installExternalUrlHandler({
    webContents: { setWindowOpenHandler: (value) => { handler = value; } },
    shell: { openExternal: () => Promise.reject(new Error('browser unavailable')) },
    logger: { error: (...args) => errors.push(args) },
  });

  handler({ url: 'mailto:user@example.com' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors.length, 1);
  assert.match(errors[0].join(' '), /browser unavailable/);
});

test('smoke mode requires packaged mode, the CLI switch, and the report environment variable', () => {
  const userData = path.resolve('C:\\Temp\\chillast-smoke');
  const report = path.join(userData, 'smoke-report.json');
  const active = { isPackaged: true, argv: ['CHILLAST.exe', '--chillast-smoke'], env: { CHILLAST_SMOKE_REPORT: report }, userData };
  assert.equal(resolveSmokeReportPath(active), report);
  assert.equal(resolveSmokeReportPath({ ...active, isPackaged: false }), null);
  assert.equal(resolveSmokeReportPath({ ...active, argv: ['CHILLAST.exe'] }), null);
  assert.equal(resolveSmokeReportPath({ ...active, env: {} }), null);
});

test('smoke report path must stay inside userData and cannot be UNC', () => {
  const userData = path.resolve('C:\\Temp\\chillast-smoke');
  const base = { isPackaged: true, argv: ['CHILLAST.exe', '--chillast-smoke'], userData };
  for (const report of [
    path.resolve(userData, '..', 'outside.json'),
    '..\\outside.json',
    '\\\\server\\share\\report.json',
  ]) {
    assert.throws(
      () => resolveSmokeReportPath({ ...base, env: { CHILLAST_SMOKE_REPORT: report } }),
      /inside userData|UNC/i,
      report,
    );
  }
});

test('packaged React smoke drives a real sidereal chart, exports, and dirty close', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main/Main.js'), 'utf8');
  assert.match(source, /_collectPackagedChartSmoke/);
  assert.match(source, /data-control="zodiac"/);
  assert.match(source, /!calculate\.disabled/);
  assert.match(source, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(source, /\.chart-svg-host svg/);
  assert.match(source, /data-column-id="longitude"/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /typeof require/);
  assert.match(source, /dirty packaged chart smoke/);
  assert.match(source, /\.dirty-navigation__dialog/);
});
