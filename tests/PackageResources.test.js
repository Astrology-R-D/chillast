'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { verifyExtraResources } = require('./PackageResources');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-resources-'));
  const resourcesDir = path.join(root, 'release', 'win-unpacked', 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  return { root, resourcesDir };
}

test('configured resources require populated packaged destinations', () => {
  const { root, resourcesDir } = fixture();
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'data.txt'), 'source');
    fs.mkdirSync(path.join(resourcesDir, 'assets'));
    assert.throws(
      () => verifyExtraResources({ root, resourcesDir, extraResources: [{ from: 'assets', to: 'assets' }] }),
      /empty/i,
    );
    fs.writeFileSync(path.join(resourcesDir, 'assets', 'data.txt'), 'packaged');
    assert.deepEqual(
      verifyExtraResources({ root, resourcesDir, extraResources: [{ from: 'assets', to: 'assets' }] }),
      { verified: ['assets'], missingOptional: [] },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('only model and vector-index sources may be absent', () => {
  const { root, resourcesDir } = fixture();
  try {
    assert.deepEqual(verifyExtraResources({
      root,
      resourcesDir,
      extraResources: [
        { from: 'resources/models', to: 'models' },
        { from: 'resources/vector-index', to: 'vector-index' },
      ],
    }), { verified: [], missingOptional: ['resources/models', 'resources/vector-index'] });
    assert.throws(
      () => verifyExtraResources({ root, resourcesDir, extraResources: [{ from: 'assets', to: 'assets' }] }),
      /required configured resource is missing/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('existing optional sources still require their packaged destination', () => {
  const { root, resourcesDir } = fixture();
  try {
    fs.mkdirSync(path.join(root, 'resources', 'models'), { recursive: true });
    fs.writeFileSync(path.join(root, 'resources', 'models', 'model.bin'), 'model');
    assert.throws(
      () => verifyExtraResources({ root, resourcesDir, extraResources: [{ from: 'resources/models', to: 'models' }] }),
      /destination is missing/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
