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

test('React smoke verifies dirty navigation and all six profile screenshot variants', () => {
  assert.match(source, /dirtyCancelRetained/);
  assert.match(source, /dirtyDiscardNavigated/);
  assert.match(source, /profileScreenshots/);
  for (const name of [
    'profile-light-compact-1440x920.png', 'profile-light-compact-1280x800.png', 'profile-light-compact-1100x720.png',
    'profile-dark-comfortable-1440x920.png', 'profile-dark-comfortable-1280x800.png', 'profile-dark-comfortable-1100x720.png',
  ]) assert.match(source, new RegExp(name.replaceAll('.', '\\.')));
});
