'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const packageJson = require('../package.json');

function before(script, first, second) {
  const value = packageJson.scripts[script];
  assert.ok(value.includes(first), `${script} is missing ${first}`);
  assert.ok(value.includes(second), `${script} is missing ${second}`);
  assert.ok(value.indexOf(first) < value.indexOf(second), `${first} must precede ${second} in ${script}`);
}

test('canonical chart verification owns deterministic Node-to-Electron ABI transitions', () => {
  before('verify:charts', 'npm run rebuild:node', 'node --test tests/AstrologyCatalog.test.js');
  before('verify:charts', 'npm run rebuild:electron', 'npm run smoke:react:charts:prepared');
  assert.equal(packageJson.scripts['smoke:react:charts:prepared'], 'cross-env CHILLAST_CHART_SMOKE=1 electron tests/SmokeReactRenderer.js --charts');
  assert.equal((packageJson.scripts['verify:charts'].match(/rebuild:node/g) || []).length, 1);
  assert.equal((packageJson.scripts['verify:charts'].match(/rebuild:electron/g) || []).length, 1);
  assert.match(packageJson.scripts['verify:charts'], /smoke:react:charts:prepared$/);
});

test('general and package verification expose one explicit Electron transition per stage', () => {
  before('verify', 'npm run rebuild:node', 'npm test');
  before('verify', 'npm run rebuild:electron', 'npm run smoke');
  before('verify:package', 'npm run rebuild:electron', 'npm run verify:package:prepared');
  assert.equal(packageJson.scripts['verify:charts:release'], 'npm run verify:charts && npm run smoke:react:charts:visual && npm run verify:package:prepared');
  assert.doesNotMatch(packageJson.scripts['verify:package:prepared'], /rebuild/);
  assert.equal(packageJson.scripts['rebuild'], 'npm run rebuild:electron');
});
