'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.join(__dirname, '..');
const generator = path.join(root, 'tools', 'generate-unicode-case-folding.mjs');
const generatedData = path.join(root, 'src', 'core', 'util', 'UnicodeCaseFoldData.js');
const sourceData = path.join(root, 'vendor', 'unicode', '17.0.0', 'CaseFolding.txt');
const license = path.join(root, 'licenses', 'UNICODE-LICENSE-3.0.txt');

function runGenerator(...args) {
  return spawnSync(process.execPath, [generator, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('Unicode case-fold data passes deterministic offline check', () => {
  const result = runGenerator('--check');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /up to date/i);
});

test('Unicode case-fold check rejects a tampered output without rewriting it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-casefold-'));
  const output = path.join(directory, 'UnicodeCaseFoldData.js');
  try {
    const tampered = `${fs.readFileSync(generatedData, 'utf8')}\n// tampered\n`;
    fs.writeFileSync(output, tampered, 'utf8');
    const result = runGenerator('--check', '--output', output);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /out of date/i);
    assert.equal(fs.readFileSync(output, 'utf8'), tampered);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('tracked Unicode 17 source and generated provenance are pinned', () => {
  const source = fs.readFileSync(sourceData, 'utf8');
  const generated = fs.readFileSync(generatedData, 'utf8');
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(sha256, 'ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183');
  assert.match(source, /^# CaseFolding-17\.0\.0\.txt/);
  assert.match(source, /^# © 2025 Unicode®, Inc\./m);
  assert.match(generated, /vendor\/unicode\/17\.0\.0\/CaseFolding\.txt/);
  assert.match(generated, new RegExp(sha256));
  assert.match(generated, /licenses\/UNICODE-LICENSE-3\.0\.txt/);
});

test('Unicode License V3 is complete and configured for packaging', () => {
  const text = fs.readFileSync(license, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(text, /^UNICODE LICENSE V3/);
  assert.match(text, /Copyright © 1991-2025 Unicode, Inc\./);
  assert.match(text, /Permission is hereby granted, free of charge/);
  assert.match(text, /THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS"/);
  assert.match(text, /prior written\s+authorization of the copyright holder\.\s*$/);
  assert.ok(packageJson.build.files.includes('licenses/UNICODE-LICENSE-3.0.txt'));
});
