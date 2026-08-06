'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalizeReport(value, key = '') {
  if (key === 'changedPixels') return typeof value === 'number' && value >= 100;
  if (typeof value === 'number') return Number(value.toFixed(6));
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeReport);
    return normalized.every((entry) => entry && typeof entry === 'object' && typeof entry.name === 'string')
      ? normalized.sort((left, right) => left.name.localeCompare(right.name))
      : normalized;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((entryKey) => [entryKey, normalizeReport(value[entryKey], entryKey)]));
  }
  return value;
}

function createChartArtifactSession(targetDir, expectedNames, options = {}) {
  fs.mkdirSync(targetDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(targetDir, '.chart-staging-'));
  let closed = false;
  const abort = () => {
    if (closed) return;
    closed = true;
    fs.rmSync(stagingDir, { recursive: true, force: true });
  };
  const finalize = (report) => {
    if (closed) throw new Error('chart artifact session is closed');
    const staged = fs.readdirSync(stagingDir).filter((name) => name.endsWith('.png')).sort();
    const expected = [...expectedNames].sort();
    if (JSON.stringify(staged) !== JSON.stringify(expected)) throw new Error(`incomplete chart artifact matrix: ${staged.length}/${expected.length}`);
    const hashes = Object.fromEntries(expected.map((name) => [name, hashFile(path.join(stagingDir, name))]));
    const previous = Object.fromEntries(expected.filter((name) => fs.existsSync(path.join(targetDir, name)))
      .map((name) => [name, hashFile(path.join(targetDir, name))]));
    const changed = expected.filter((name) => previous[name] !== hashes[name]);
    const manifest = { version: 1, count: expected.length, hashes, report: normalizeReport(report) };
    fs.writeFileSync(path.join(stagingDir, 'chart-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const backupDir = fs.mkdtempSync(path.join(targetDir, '.chart-backup-'));
    const committed = [];
    try {
      for (const name of [...expected, 'chart-manifest.json']) {
        const target = path.join(targetDir, name);
        if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backupDir, name));
        committed.push(name);
        (options.commitFile || fs.copyFileSync)(path.join(stagingDir, name), target);
      }
    } catch (error) {
      for (const name of committed) {
        const backup = path.join(backupDir, name); const target = path.join(targetDir, name);
        if (fs.existsSync(backup)) fs.copyFileSync(backup, target); else fs.rmSync(target, { force: true });
      }
      throw error;
    } finally {
      fs.rmSync(backupDir, { recursive: true, force: true });
      abort();
    }
    return { ...manifest, changed, report };
  };
  return { directory: stagingDir, finalize, abort };
}

async function runAtomicChartArtifactGeneration(targetDir, expectedNames, generate, options) {
  const session = createChartArtifactSession(targetDir, expectedNames, options);
  try {
    const report = await generate(session.directory);
    return session.finalize(report);
  } catch (error) {
    session.abort();
    throw error;
  }
}

module.exports = { createChartArtifactSession, runAtomicChartArtifactGeneration };
