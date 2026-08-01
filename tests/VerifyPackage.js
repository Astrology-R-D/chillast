'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { OPTIONAL_RESOURCE_SOURCES, verifyExtraResources } = require('./PackageResources');

const root = path.join(__dirname, '..');
const archive = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
const resourcesDir = path.join(root, 'release', 'win-unpacked', 'resources');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function archiveBuffer(name) {
  return asar.extractFile(archive, path.normalize(name));
}

function assertMatchesSource(archiveName, sourceName = archiveName) {
  const source = fs.readFileSync(path.join(root, sourceName));
  assert.equal(hash(archiveBuffer(archiveName)), hash(source), `${archiveName} differs from ${sourceName}`);
}

assert.ok(fs.existsSync(archive), `package archive missing: ${archive}`);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const resourceVerification = verifyExtraResources({
  root,
  resourcesDir,
  extraResources: packageJson.build.extraResources,
});
const files = asar.listPackage(archive, { isPack: false })
  .map((name) => name.replace(/^[/\\]/, '').replace(/\\/g, '/'));
const fileSet = new Set(files);

for (const required of [
  'src/renderer/Index.html',
  'dist/renderer-react/index.html',
  'src/preload/Preload.js',
  'src/core/util/UnicodeCaseFold.js',
  'src/core/util/UnicodeCaseFoldData.js',
  'src/core/astrology/LocationResolver.js',
  'licenses/UNICODE-LICENSE-3.0.txt',
  'dist/renderer-react/theme-bootstrap.js',
]) {
  assert.ok(fileSet.has(required), `missing packaged file: ${required}`);
}

const rootTtf = files.filter((name) => /^fonts\/[^/]+\.ttf$/i.test(name));
const reactWoff2 = files.filter((name) => /^dist\/renderer-react\/assets\/[^/]+\.woff2$/i.test(name));
assert.equal(rootTtf.length, 4, `expected 4 root TTF files, found ${rootTtf.length}`);
assert.equal(reactWoff2.length, 4, `expected 4 React WOFF2 files, found ${reactWoff2.length}`);
assert.equal(
  files.filter((name) => /italic/i.test(name) && /\.(ttf|otf|woff2?)$/i.test(name)).length,
  0,
  'italic font unexpectedly packaged',
);

const reactHtml = archiveBuffer('dist/renderer-react/index.html').toString('utf8');
const scriptMatch = reactHtml.match(/src="(\.\/assets\/[^"?]+\.js)"/);
const styleMatch = reactHtml.match(/href="(\.\/assets\/[^"?]+\.css)"/);
assert.ok(scriptMatch, 'React HTML does not reference relative JavaScript');
assert.ok(styleMatch, 'React HTML does not reference relative CSS');
assert.match(reactHtml, /src="\.\/theme-bootstrap\.js"/);

for (const archiveName of [
  'src/renderer/Index.html',
  'src/preload/Preload.js',
  'src/core/util/UnicodeCaseFold.js',
  'src/core/util/UnicodeCaseFoldData.js',
  'src/core/astrology/LocationResolver.js',
  'licenses/UNICODE-LICENSE-3.0.txt',
  'dist/renderer-react/index.html',
  'dist/renderer-react/theme-bootstrap.js',
  ...rootTtf,
  ...reactWoff2,
  `dist/renderer-react/${scriptMatch[1].slice(2)}`,
  `dist/renderer-react/${styleMatch[1].slice(2)}`,
]) {
  assertMatchesSource(archiveName);
}

console.log(JSON.stringify({
  archive,
  legacyHtml: true,
  reactHtml: true,
  preload: true,
  themeBootstrap: true,
  rootTtf: rootTtf.length,
  reactWoff2: reactWoff2.length,
  script: scriptMatch[1],
  style: styleMatch[1],
  sourceHashesVerified: 8 + rootTtf.length + reactWoff2.length + 2,
  optionalResourceSources: [...OPTIONAL_RESOURCE_SOURCES],
  verifiedExtraResources: resourceVerification.verified,
  missingOptionalResources: resourceVerification.missingOptional,
}, null, 2));
