'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const CloseGuard = require('../src/main/CloseGuard');

function fixture(options = {}) {
  const webContents = new EventEmitter();
  webContents.send = (...args) => sent.push(args);
  let rendererDestroyed = false;
  webContents.isDestroyed = () => rendererDestroyed;
  const win = new EventEmitter();
  win.webContents = webContents;
  win.isDestroyed = () => false;
  win.close = () => { windowCloses += 1; };
  win.destroy = () => { destroys += 1; win.emit('closed'); };
  webContents.close = (options) => { closes.push(options); win.emit('closed'); };
  const sent = []; const closes = []; let windowCloses = 0; let destroys = 0;
  const diagnostics = [];
  const guard = new CloseGuard({ win, diagnostic: (message) => diagnostics.push(message), ...options });
  return { guard, win, webContents, sent, diagnostics, closes, windowCloses: () => windowCloses, destroys: () => destroys, destroyRenderer: () => { rendererDestroyed = true; } };
}

test('records decision and scheduled closure before the actual closed event', () => {
  const order = [];
  const scheduled = [];
  const f = fixture({
    onStage: (stage) => order.push(stage),
    schedule: (callback) => { scheduled.push(callback); return callback; },
    cancelSchedule: () => {},
  });
  f.win.on('closed', () => order.push('closed'));
  f.guard.install();
  f.win.emit('close', { preventDefault() {} });
  assert.equal(f.guard.decide('proceed'), true);
  assert.deepEqual(order, ['request', 'request-sent', 'decision-proceed', 'close-scheduled']);
  assert.equal(f.closes.length, 0);
  scheduled[0]();
  assert.deepEqual(f.closes, [{ waitForBeforeUnload: false }]);
  assert.equal(f.windowCloses(), 0);
  assert.equal(f.destroys(), 0);
  assert.deepEqual(order, ['request', 'request-sent', 'decision-proceed', 'close-scheduled', 'close', 'closed']);
});

test('intercepts one close until a strict renderer decision arrives', async () => {
  const f = fixture(); f.guard.install();
  const first = { preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  f.win.emit('close', first);
  f.win.emit('close', { preventDefault() {} });
  assert.equal(first.preventDefaultCalled, true);
  assert.deepEqual(f.sent, [['app:closeRequested']]);
  assert.equal(f.guard.decide('cancel'), true);
  f.win.emit('close', { preventDefault() {} });
  assert.equal(f.sent.length, 2);
  assert.equal(f.guard.decide('proceed'), true);
  assert.equal(f.closes.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.closes.length, 1);
  assert.equal(f.destroys(), 0);
  assert.equal(f.guard.decide('proceed'), false);
  assert.throws(() => f.guard.decide('later'), /invalid close decision/i);
});

test('allows safe closure when renderer is unavailable and cleans listeners', async () => {
  const f = fixture(); f.guard.install();
  f.win.emit('close', { preventDefault() {} });
  f.webContents.emit('render-process-gone');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.closes.length, 1);
  assert.equal(f.destroys(), 0);
  f.guard.dispose();
  assert.equal(f.win.listenerCount('close'), 0);
  assert.equal(f.webContents.listenerCount('render-process-gone'), 0);
});

test('destroys the remaining window when its web contents are already destroyed', async () => {
  const f = fixture(); f.guard.install();
  f.destroyRenderer();
  f.webContents.emit('destroyed');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.destroys(), 1);
  assert.equal(f.closes.length, 0);
});

test('bounds a pending request, resets it, and presents a diagnostic', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ timeoutMs: 1000 }); f.guard.install();
  f.win.emit('close', { preventDefault() {} });
  t.mock.timers.tick(1000);
  assert.equal(f.diagnostics.length, 1);
  assert.equal(f.guard.decide('cancel'), false);
  f.win.emit('close', { preventDefault() {} });
  assert.equal(f.sent.length, 2);
});

test('closes an approved window exactly once after IPC returns', async () => {
  const f = fixture(); f.guard.install();
  f.win.emit('close', { preventDefault() {} });
  assert.equal(f.guard.decide('proceed'), true);
  assert.equal(f.closes.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.closes.length, 1);
  assert.equal(f.destroys(), 0);
  assert.equal(f.guard.decide('proceed'), false);
  assert.equal(f.closes.length, 1);
});
