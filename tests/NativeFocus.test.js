'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { waitForNativeFocus } = require('./NativeFocus');

test('native focus helper reports the last renderer diagnostic on timeout', async () => {
  let time = 0;
  const webContents = {
    executeJavaScript: async () => ({
      ready: false,
      diagnostic: { current: { identity: 'secondary:sun', connected: true }, active: { identity: 'primary:moon' } },
    }),
  };

  await assert.rejects(
    waitForNativeFocus(webContents, 'object focus', '() => document.querySelector("[data-chart-identity]")', 3, () => time++),
    /object focus timed out.*secondary:sun.*primary:moon/,
  );
});

test('native focus helper returns after the renderer confirms exact focus', async () => {
  let calls = 0;
  const webContents = {
    executeJavaScript: async () => ({ ready: ++calls === 2, value: { identity: 'secondary:sun' }, diagnostic: { attempt: calls } }),
  };

  const result = await waitForNativeFocus(webContents, 'object focus', '() => window.currentObject()', 100, () => calls);
  assert.deepEqual(result, { identity: 'secondary:sun' });
  assert.equal(calls, 2);
});
