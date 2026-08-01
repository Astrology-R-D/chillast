'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runElectronSmokeController(prefix, app) {
  if (process.env.CHILLAST_SMOKE_CHILD === '1') return;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  app.setPath('userData', userDataDir);
  const env = {
    ...process.env,
    CHILLAST_SMOKE_CHILD: '1',
    CHILLAST_SMOKE_USER_DATA: userDataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [process.argv[1]], {
    env,
    stdio: 'inherit',
    timeout: 120000,
  });
  let code = typeof result.status === 'number' ? result.status : 1;
  if (result.error) console.error(`Electron smoke child failed: ${result.error.message}`);

  try {
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (fs.existsSync(userDataDir)) throw new Error('directory still exists after removal');
  } catch (error) {
    console.error(`Electron smoke cleanup failed for ${userDataDir}: ${error.message}`);
    if (code === 0) code = 1;
  }
  process.exit(code);
}

module.exports = { runElectronSmokeController };
