'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const executable = path.join(root, 'release', 'win-unpacked', 'CHILLAST.exe');
const lahiriSun = 256.51569618387066;
const fixtureTolerance = 0.01;

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
  if (renderer === 'react') fs.writeFileSync(path.join(dataDir, 'Profiles.json'), JSON.stringify([{
    id: 'packaged-chart-smoke', nameZh: '打包星盘烟测', nameEn: 'Packaged Chart Smoke', gender: 'other',
    birthData: { year: 2000, month: 1, day: 1, hour: 12, minute: 0,
      location: { label: 'Greenwich', latitude: 51.4779, longitude: 0 } },
    notes: '', tags: ['packaged-smoke'],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }], null, 2));

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
      child = spawn(executable, [`--user-data-dir=${profile}`, '--disable-gpu', '--chillast-smoke'], {
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
      }, 45000);
      child.once('exit', () => clearTimeout(timer));
    });

    if (timedOut) {
      const pendingReport = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '(missing)';
      const stagePath = `${reportPath}.stages`;
      const stages = fs.existsSync(stagePath) ? fs.readFileSync(stagePath, 'utf8') : '(missing)';
      throw new Error(`${renderer} packaged executable timed out\nreport: ${pendingReport}\nstages: ${stages}\nstdout: ${stdout}\nstderr: ${stderr}`);
    }
    const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '(missing)';
    assert.equal(result.signal, null, `${renderer} exited by signal ${result.signal}`);
    assert.equal(result.code, 0, `${renderer} exit ${result.code}\nreport: ${reportText}\nstdout: ${stdout}\nstderr: ${stderr}`);
    assert.notEqual(reportText, '(missing)', `${renderer} smoke report missing\n${stdout}\n${stderr}`);
    const report = JSON.parse(reportText);
    assert.equal(report.targetKind, expectedKind);
    assert.equal(report.hasApi, true);
    assert.equal(report.marker, expectedMarker);
    assert.equal(report.routes, 6);
    assert.equal(report.title, 'CHILLAST');
    assert.deepEqual(report.errors, []);
    if (renderer === 'react') {
      assert.equal(report.chartType, 'natal');
      assert.equal(report.zodiac, 'sidereal');
      assert.equal(report.backend, 'swisseph');
      assert.ok(Math.abs(report.lahiriSun - lahiriSun) <= fixtureTolerance,
        `expected Lahiri Sun ${lahiriSun} +/- ${fixtureTolerance}, received ${report.lahiriSun}`);
      assert.ok(report.svgBytes > 1000);
      assert.ok(report.explorerRows > 0);
      assert.ok(report.csvBytes > 0);
      assert.equal(report.finiteSvg, true);
      assert.equal(report.nodeAccess, false);
      assert.equal(report.closeHandshake, true);
      assert.equal(report.closeStage, 'closed');
      assert.deepEqual(report.closeStages, ['request', 'request-sent', 'decision-proceed', 'close-scheduled', 'close', 'closed', 'app-exit']);
    }
    else assert.equal(report.closeHandshake, undefined);
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
