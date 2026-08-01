'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const runnerPath = path.join(__dirname, 'RunNodeTests.js');

function withFixtures(fixtures, fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-node-tests-'));
  try {
    for (const [name, source] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(directory, name), source, 'utf8');
    }
    fn(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function run(directory) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [runnerPath, directory], {
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
}

test('runner discovers root .test.js files in deterministic order', () => {
  withFixtures({
    'z-last.test.js': "require('node:test')('z', () => {});",
    'a-first.test.js': "require('node:test')('a', () => {});",
    'ignored.js': "throw new Error('must not run');",
  }, (directory) => {
    const result = run(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Node tests: a-first\.test\.js, z-last\.test\.js/);
  });
});

test('runner propagates a discovered test process failure', () => {
  withFixtures({
    'failure.test.js': "require('node:test')('failure', () => { throw new Error('expected failure'); });",
  }, (directory) => {
    const result = run(directory);
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /expected failure/);
  });
});
