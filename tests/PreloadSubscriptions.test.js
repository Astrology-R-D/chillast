'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadPreloadApi() {
  const ipcRenderer = new EventEmitter();
  ipcRenderer.invoke = () => Promise.resolve();
  let exposedApi;
  const contextBridge = {
    exposeInMainWorld(name, api) {
      assert.equal(name, 'mystApi');
      exposedApi = api;
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/preload/Preload.js'), 'utf8');

  vm.runInNewContext(source, {
    require(id) {
      assert.equal(id, 'electron');
      return { contextBridge, ipcRenderer };
    },
  });

  return { api: exposedApi, ipcRenderer };
}

for (const [method, channel] of [
  ['onStatusChanged', 'ai:statusChanged'],
  ['onInitProgress', 'ai:initProgress'],
]) {
  test(`preload ${method} cleanup removes only its wrapped listener`, () => {
    const { api, ipcRenderer } = loadPreloadApi();
    const received = [];
    const otherReceived = [];
    const otherListener = (_event, data) => otherReceived.push(data);
    ipcRenderer.on(channel, otherListener);

    const cleanup = api.ai[method]((data) => received.push(data));
    const firstPayload = { phase: 'ready' };
    ipcRenderer.emit(channel, { sender: 'main' }, firstPayload);

    assert.deepEqual(received, [firstPayload]);
    assert.deepEqual(otherReceived, [firstPayload]);
    assert.equal(typeof cleanup, 'function');
    assert.equal(ipcRenderer.listenerCount(channel), 2);

    assert.equal(cleanup(), undefined);
    const secondPayload = { phase: 'error' };
    ipcRenderer.emit(channel, { sender: 'main' }, secondPayload);

    assert.deepEqual(received, [firstPayload]);
    assert.deepEqual(otherReceived, [firstPayload, secondPayload]);
    assert.equal(ipcRenderer.listenerCount(channel), 1);
    assert.equal(ipcRenderer.listeners(channel)[0], otherListener);
  });
}
