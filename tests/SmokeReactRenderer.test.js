'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'SmokeReactRenderer.js'), 'utf8');

test('React smoke registers the complete profile and location bridge before loading', () => {
  for (const channel of [
    'profiles:list', 'profiles:get', 'profiles:save', 'profiles:remove',
    'cities:search', 'chinese:searchCities', 'locations:resolve',
  ]) assert.match(source, new RegExp(`registerEnvelope\\('${channel.replace(':', '\\:')}'`), channel);
  assert.ok(source.indexOf("registerEnvelope('profiles:list'") < source.indexOf('win.loadFile('));
});

test('React smoke requires seeded profile content and captures main-process failures', () => {
  assert.match(source, /profileHeading/);
  assert.match(source, /profileRows/);
  assert.match(source, /unhandledRejection/);
  assert.match(source, /uncaughtException/);
  assert.match(source, /handler failure/);
});
