'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = path.resolve(process.argv[2] || __dirname);
const testFiles = fs.readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
  .map((entry) => entry.name)
  .sort();

console.log(`Node tests: ${testFiles.join(', ')}`);

if (testFiles.length > 0) {
  const testPaths = testFiles.map((file) => path.join(directory, file));
  const result = spawnSync(process.execPath, ['--test', '--', ...testPaths], {
    cwd: directory,
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exitCode = result.status === null ? 1 : result.status;
}
