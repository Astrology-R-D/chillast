'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const IpcRouter = require('../src/main/IpcRouter');

function capturedHandler() {
  let handler;
  const router = new IpcRouter({
    ipcMain: { handle: (_channel, nextHandler) => { handler = nextHandler; } },
  });
  let calls = 0;
  router._handle('security:test', () => { calls += 1; return 'accepted'; });
  return { router, invoke: (...args) => handler(...args), calls: () => calls };
}

test('trusted main-frame IPC invokes the handler', async () => {
  const fixture = capturedHandler();
  const mainFrame = {};
  const trusted = { mainFrame };
  fixture.router.setWebContents(trusted);

  assert.deepEqual(await fixture.invoke({ sender: trusted, senderFrame: mainFrame }), {
    ok: true,
    data: 'accepted',
  });
  assert.equal(fixture.calls(), 1);
});

test('foreign webContents and trusted subframes receive errors without invoking the handler', async () => {
  const fixture = capturedHandler();
  const mainFrame = {};
  const trusted = { mainFrame };
  fixture.router.setWebContents(trusted);

  for (const event of [
    { sender: { mainFrame: {} }, senderFrame: {} },
    { sender: trusted, senderFrame: { parent: mainFrame } },
    { sender: trusted, senderFrame: null },
  ]) {
    const result = await fixture.invoke(event);
    assert.equal(result.ok, false);
    assert.match(result.error, /不受信任|trusted/i);
  }
  assert.equal(fixture.calls(), 0);
});

test('isolated fixtures remain unrestricted until trusted webContents is set', async () => {
  const fixture = capturedHandler();
  assert.deepEqual(await fixture.invoke({ sender: {}, senderFrame: null }), {
    ok: true,
    data: 'accepted',
  });
});
