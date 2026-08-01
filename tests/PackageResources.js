'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const OPTIONAL_RESOURCE_SOURCES = new Set(['resources/models', 'resources/vector-index']);

function normalizedSource(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function assertPopulated(destination, label) {
  assert.ok(fs.existsSync(destination), `configured resource destination is missing: ${label}`);
  const stat = fs.statSync(destination);
  if (stat.isDirectory()) {
    assert.ok(fs.readdirSync(destination).length > 0, `configured resource destination is empty: ${label}`);
  } else {
    assert.ok(stat.size > 0, `configured resource destination is empty: ${label}`);
  }
}

function verifyExtraResources({ root, resourcesDir, extraResources }) {
  const verified = [];
  const missingOptional = [];
  for (const resource of extraResources || []) {
    const source = normalizedSource(resource.from);
    const sourcePath = path.join(root, source);
    if (!fs.existsSync(sourcePath)) {
      assert.ok(OPTIONAL_RESOURCE_SOURCES.has(source), `required configured resource is missing: ${source}`);
      missingOptional.push(source);
      continue;
    }
    const destinationName = normalizedSource(resource.to);
    assertPopulated(path.join(resourcesDir, destinationName), destinationName);
    verified.push(destinationName);
  }
  return { verified, missingOptional };
}

module.exports = { OPTIONAL_RESOURCE_SOURCES, verifyExtraResources };
