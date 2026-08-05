'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'SmokeReactRenderer.js'), 'utf8');
const rendererEntry = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer-react', 'main.tsx'), 'utf8');
const packageJson = require('../package.json');

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

test('React smoke verifies chart remaining-height geometry at narrow and desktop viewports', () => {
  assert.match(source, /generatedChart/);
  assert.match(source, /\.chart-svg-host svg/);
  assert.match(source, /data-chart-identity/);
  assert.match(source, /viewBox === '0 0 740 740'/);
  assert.match(source, /squareError/);
  assert.match(source, /NaN\|Infinity\|undefined/);
  assert.match(source, /chartGeometry/);
  assert.match(source, /chart-1100x720/);
  assert.match(source, /chart-1440x920/);
  assert.match(source, /outerScroll/);
  assert.match(source, /remainingHeightError/);
  assert.match(source, /availableWidthError/);
  assert.match(source, /resultHeight/);
});

test('React smoke resolves every transform from the current connected chart SVG', () => {
  assert.match(source, /window\.__currentChartSvg\s*=\s*\(\)\s*=>/);
  assert.match(source, /document\.querySelector\('\.chart-svg-host svg'\)/);
  assert.match(source, /if \(!svg \|\| !svg\.isConnected\)/);
  assert.match(source, /if \(!group \|\| !group\.isConnected\)/);
  assert.match(source, /numbers\.length !== 3 \|\| !numbers\.every\(Number\.isFinite\)/);
  assert.doesNotMatch(source, /window\.__readChartTransform\s*=\s*\(\)\s*=>\s*\{\s*const value = svg\.querySelector/);
});

test('React smoke proves pointer pan changes the transform from its immediate baseline', () => {
  assert.match(source, /const panBefore = await win\.webContents\.executeJavaScript\(`window\.__readChartTransform\(\)`\)/);
  assert.match(source, /window\.__smokePanBefore = \$\{JSON\.stringify\(panBefore\)\}/);
  assert.match(source, /Math\.abs\(transform\.x - before\.x\) > 0\.1/);
  assert.match(source, /Math\.abs\(transform\.y - before\.y\) > 0\.1/);
  assert.doesNotMatch(source, /ready: transform\.x !== 0/);
});

test('React smoke verifies separate canvas pan and roving object keyboard paths', () => {
  assert.match(source, /canvasTabStop/);
  assert.match(source, /objectTabStops/);
  assert.match(source, /chart keyboard canvas pan/);
  assert.match(source, /keyCode: 'RIGHT'/);
  assert.match(source, /chart keyboard object navigation/);
  assert.match(source, /keyboardObjectBefore/);
  assert.match(source, /document\.activeElement\?\.getAttribute\('data-chart-identity'\)/);
});

test('chart smoke uses deterministic delayed real Swiss IPC and profile fixtures', () => {
  const fixtures = require('./ChartWorkbenchSmokeFixtures');
  assert.equal(fixtures.profileA.id, 'chart-smoke-a');
  assert.equal(fixtures.profileB.id, 'chart-smoke-b');
  assert.equal(fixtures.natalRequest().type, 'natal');
  assert.equal(fixtures.synastryRequest().type, 'synastry');
  const calls = [];
  const delayed = new fixtures.DelayedAstrologyService({
    referenceData: () => ({}), chartTypes: () => [], computeChart: (request) => { calls.push(request); return request.type; },
  });
  const pending = delayed.computeChart(fixtures.natalRequest());
  assert.equal(delayed.pending.length, 1);
  delayed.resolve(0);
  return pending.then((value) => {
    assert.equal(value, 'natal');
    assert.equal(calls.length, 1);
  });
});

test('chart smoke has a genuine trusted branch and native canvas/object tab traversal', () => {
  assert.equal(packageJson.overrides.nan, '2.28.0');
  assert.equal(packageJson.scripts['smoke:react:charts'], 'npm run build:renderer && npm run rebuild && cross-env CHILLAST_CHART_SMOKE=1 electron tests/SmokeReactRenderer.js --charts');
  assert.match(source, /process\.env\.CHILLAST_CHART_SMOKE === '1'/);
  assert.match(source, /process\.argv\.includes\('--charts'\)/);
  assert.match(source, /SwissEphCore\.configure\(\{ ephePath:/);
  assert.match(source, /new ChartStrategyFactory\(\{ backend: 'swisseph' \}\)/);
  assert.match(source, /new ProfileRepository\(/);
  assert.match(source, /new DelayedAstrologyService\(/);
  assert.match(source, /new IpcRouter\(/);
  assert.match(source, /chartSmoke/);
  assert.match(source, /sendInputEvent\(\{ type: 'keyDown', keyCode: 'TAB'/);
  assert.match(source, /modifiers: \['shift'\]/);
  assert.match(source, /retainedBeforeFailure\.focusedIdentity === retainedAfterFailure\.focusedIdentity/);
  assert.match(source, /retainedBeforeFailure\.transform === retainedAfterFailure\.transform/);
  assert.match(source, /JSON\.stringify\(retainedBeforeFailure\.selectedRows\) === JSON\.stringify\(retainedAfterFailure\.selectedRows\)/);
  assert.match(source, /acceptedContextBeforeFailure\.successfulFilters/);
});

test('chart visual smoke captures the exact responsive matrix with pixel and geometry gates', () => {
  assert.equal(packageJson.scripts['smoke:react:charts:visual'], 'npm run build:renderer && cross-env CHILLAST_CHART_VISUAL=1 electron tests/SmokeReactRenderer.js --charts');
  assert.match(source, /process\.env\.CHILLAST_CHART_VISUAL === '1'/);
  assert.match(source, /const chartMode = visualMode \|\| process\.env\.CHILLAST_CHART_SMOKE === '1'/);
  assert.match(source, /const cases = \['personal-single', 'relationship-dual'\]/);
  assert.match(source, /const sizes = \[\[1440, 920\], \[1280, 800\], \[1100, 720\]\]/);
  assert.match(source, /\['light', 'compact'\], \['light', 'comfortable'\]/);
  assert.match(source, /\['dark', 'compact'\], \['dark', 'comfortable'\]/);
  assert.match(source, /chart-\$\{chartCase\}-\$\{width\}x\$\{height\}-\$\{theme\}-\$\{density\}\.png/);
  assert.match(source, /chartScreenshots\.length !== 24/);
  assert.match(source, /centralDifferenceRatio/);
  assert.match(source, /distinctRgbInRect/);
  assert.match(source, /pixelDifferenceCount/);
  assert.match(source, /rectsIntersect/);
  assert.match(source, /centralDifference < 0\.01/);
  assert.match(source, /svgColors < 16/);
  assert.match(source, /changedPixels < 100/);
});

test('package exposes canonical source and release chart verification scripts', () => {
  assert.equal(packageJson.scripts['verify:package'], 'npm run build:renderer && npm run rebuild && electron-builder --dir && node tests/VerifyPackage.js && node tests/SmokePackagedRenderer.js');
  assert.equal(packageJson.scripts['verify:charts'], 'node --test tests/AstrologyCatalog.test.js tests/SwissephSidereal.test.js tests/ChartVisualMetrics.test.js && npm run test:security && npm run test:preload && npm run test:renderer && npm run typecheck && npm run build:renderer && npm run smoke:react:charts');
  assert.equal(packageJson.scripts['verify:charts:release'], 'npm run verify:charts && npm run smoke:react:charts:visual && npm run verify:package');
});
