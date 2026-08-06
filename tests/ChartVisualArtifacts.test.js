'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runAtomicChartArtifactGeneration } = require('./ChartVisualArtifacts');

test('validates all artifacts then replaces baselines with hashes and diff signal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-artifacts-'));
  fs.writeFileSync(path.join(root, 'a.png'), 'old-a'); fs.writeFileSync(path.join(root, 'b.png'), 'old-b');
  const result = await runAtomicChartArtifactGeneration(root, ['a.png', 'b.png'], async (staging) => {
    fs.writeFileSync(path.join(staging, 'a.png'), 'new-a'); fs.writeFileSync(path.join(staging, 'b.png'), 'new-b');
    return [{ name: 'b.png', ratio: 0.123456789, changedPixels: 101 }, { name: 'a.png', ratio: 1, changedPixels: 100 }];
  });
  assert.equal(fs.readFileSync(path.join(root, 'a.png'), 'utf8'), 'new-a');
  assert.equal(Object.keys(result.hashes).length, 2); assert.deepEqual(result.changed, ['a.png', 'b.png']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'chart-manifest.json'), 'utf8')), {
    version: 1, count: 2, hashes: result.hashes,
    report: [
      { changedPixels: true, name: 'a.png', ratio: 1 },
      { changedPixels: true, name: 'b.png', ratio: 0.123457 },
    ],
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('commit failure rolls back every replaced artifact and manifest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-artifacts-'));
  fs.writeFileSync(path.join(root, 'a.png'), 'old-a'); fs.writeFileSync(path.join(root, 'b.png'), 'old-b');
  let commits = 0;
  await assert.rejects(runAtomicChartArtifactGeneration(root, ['a.png', 'b.png'], async (staging) => {
    fs.writeFileSync(path.join(staging, 'a.png'), 'new-a'); fs.writeFileSync(path.join(staging, 'b.png'), 'new-b');
    return {};
  }, {
    commitFile(source, target) {
      fs.copyFileSync(source, target);
      commits += 1;
      if (commits === 2) throw new Error('deliberate commit failure');
    },
  }), /deliberate commit failure/);
  assert.equal(fs.readFileSync(path.join(root, 'a.png'), 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(path.join(root, 'b.png'), 'utf8'), 'old-b');
  assert.equal(fs.existsSync(path.join(root, 'chart-manifest.json')), false);
  assert.equal(fs.readdirSync(root).some((name) => name.startsWith('.chart-')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('generation failure leaves the complete prior matrix untouched and removes staging', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-artifacts-'));
  fs.writeFileSync(path.join(root, 'a.png'), 'old-a'); fs.writeFileSync(path.join(root, 'b.png'), 'old-b');
  let stagingPath;
  await assert.rejects(runAtomicChartArtifactGeneration(root, ['a.png', 'b.png'], async (staging) => {
    stagingPath = staging; fs.writeFileSync(path.join(staging, 'a.png'), 'partial'); throw new Error('deliberate');
  }), /deliberate/);
  assert.equal(fs.readFileSync(path.join(root, 'a.png'), 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(path.join(root, 'b.png'), 'utf8'), 'old-b');
  assert.equal(fs.existsSync(stagingPath), false);
  fs.rmSync(root, { recursive: true, force: true });
});
