'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'SmokeReactRenderer.js'), 'utf8');
const rendererEntry = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer-react', 'main.tsx'), 'utf8');

test('React entry cleanup cannot cancel the native close handshake', () => {
  assert.doesNotMatch(rendererEntry, /beforeunload/);
  assert.match(rendererEntry, /pagehide/);
});

test('React smoke registers the complete profile and location bridge before loading', () => {
  for (const channel of [
    'profiles:list', 'profiles:get', 'profiles:save', 'profiles:remove',
    'cities:search', 'chinese:searchCities', 'locations:resolve',
    'reference:get', 'chartTypes:get', 'chart:compute',
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
  assert.match(source, /initialSearchVerified/);
  assert.match(source, /primaryMarkerVerified/);
  assert.match(source, /dirtyCancelRetained/);
  assert.match(source, /dirtySaveNavigated/);
  assert.match(source, /dirtyDiscardNavigated/);
  assert.match(source, /nativeCloseTimedOut/);
  assert.match(source, /nativeCloseRejectedRetained/);
  assert.match(source, /nativeCloseIpcRejectedRetained/);
  assert.match(source, /nativeCloseRetryCanceled/);
  assert.match(source, /new CloseGuard\(/);
  assert.match(source, /new IpcRouter\(/);
  assert.match(source, /closeRouter\._handle\('app:closeDecision'/);
  assert.match(source, /win\.close\(\)/);
  assert.match(source, /\.profile-page__background/);
  assert.match(source, /profileScreenshots/);
  for (const name of [
    'profile-1440x920-light-compact.png', 'profile-1280x800-light-compact.png', 'profile-1100x720-light-compact.png',
    'profile-1440x920-dark-comfortable.png', 'profile-1280x800-dark-comfortable.png', 'profile-1100x720-dark-comfortable.png',
  ]) assert.match(source, new RegExp(name.replaceAll('.', '\\.')));
  assert.match(source, /pageWidth >= 760 \? !geometry\.sideBySide : !geometry\.stacked/);
  assert.match(source, /document\.querySelector\('\.profile-detail'\)/);
});

test('React smoke attempts pointer and keyboard activation of an inert modal background command', () => {
  assert.match(source, /modalPointerBlocked/);
  assert.match(source, /modalKeyboardBlocked/);
  assert.match(source, /sendInputEvent\(\{ type: 'mouseDown'/);
  assert.match(source, /sendInputEvent\(\{ type: 'keyDown', keyCode: 'ENTER'/);
  assert.match(source, /__backgroundCopyActivations/);
  assert.match(source, /profilesBeforeModalInput/);
});

test('React smoke captures exact logical viewports as untouched native-DPI images', () => {
  assert.match(source, /require\('\.\/NativeImageMetrics'\)/);
  assert.match(source, /setExactContentSize/);
  assert.match(source, /await waitForRendererSize\(win, width, height\)/);
  assert.match(source, /if \(win\.isMaximized\(\)\) await restoreWindow\(win\)/);
  assert.match(source, /win\.center\(\)/);
  assert.doesNotMatch(source, /win\.setPosition\(/);
  assert.match(source, /value\.width === width && value\.height === height/);
  assert.match(source, /document\.querySelector\('\.dirty-navigation__background'\)/);
  assert.match(source, /document\.querySelector\('\.shell'\)/);
  assert.match(source, /deviceScaleFactor/);
  assert.match(source, /nativeWidth/);
  assert.match(source, /nativeHeight/);
  assert.match(source, /requestedScaleFactor/);
  assert.match(source, /selectedScaleFactor/);
  assert.match(source, /actualScaleX/);
  assert.match(source, /actualScaleY/);
  assert.doesNotMatch(source, /const scaleTolerance/);
  assert.doesNotMatch(source, /const aspectError/);
  assert.doesNotMatch(source, /metrics\.actualScaleX - metrics\.actualScaleY/);
  assert.doesNotMatch(source, /\.resize\(\{\s*width/);
});
