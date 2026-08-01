'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const executable = path.join(root, 'release', 'win-unpacked', 'CHILLAST.exe');

async function runPackagedSmoke({ renderer, expectedKind, expectedMarker }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `chillast-packaged-${renderer}-`));
  const reportPath = path.join(profile, 'smoke-report.json');
  const dataDir = path.join(profile, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'ai-settings.json'), JSON.stringify({
    enableRag: false,
    embeddings: { provider: 'none' },
    mcpServers: {},
  }));

  const env = { ...process.env, CHILLAST_SMOKE_REPORT: reportPath };
  delete env.CHILLAST_RENDERER_URL;
  if (renderer === 'react') env.CHILLAST_RENDERER = 'react';
  else delete env.CHILLAST_RENDERER;

  let child;
  let timedOut = false;
  let stdout = '';
  let stderr = '';
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(executable, [`--user-data-dir=${profile}`, '--disable-gpu'], {
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 20000);
      child.once('exit', () => clearTimeout(timer));
    });

    if (timedOut) throw new Error(`${renderer} packaged executable timed out`);
    assert.equal(result.signal, null, `${renderer} exited by signal ${result.signal}`);
    assert.equal(result.code, 0, `${renderer} exit ${result.code}\n${stderr}`);
    assert.ok(fs.existsSync(reportPath), `${renderer} smoke report missing\n${stdout}\n${stderr}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.targetKind, expectedKind);
    assert.equal(report.hasApi, true);
    assert.equal(report.marker, expectedMarker);
    assert.equal(report.routes, 6);
    assert.equal(report.title, 'CHILLAST');
    assert.deepEqual(report.errors, []);
    return report;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

(async () => {
  assert.ok(fs.existsSync(executable), `packaged executable missing: ${executable}`);
  const legacy = await runPackagedSmoke({
    renderer: 'legacy',
    expectedKind: 'legacy',
    expectedMarker: 'legacy-shell',
  });
  const react = await runPackagedSmoke({
    renderer: 'react',
    expectedKind: 'react-file',
    expectedMarker: 'react-shell',
  });
  console.log(JSON.stringify({ executable, legacy, react }, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
