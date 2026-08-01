'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadPreloadApi() {
  const ipcRenderer = new EventEmitter();
  const invocations = [];
  ipcRenderer.invoke = (...args) => { invocations.push(args); return Promise.resolve(); };
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

  return { api: exposedApi, ipcRenderer, invocations };
}

test('preload forwards profile, city, location, and close bridge arguments', async () => {
  const { api, invocations } = loadPreloadApi();
  const input = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, latitude: 0, longitude: 0 };
  await api.profiles.list();
  await api.profiles.get('profile-1');
  await api.profiles.save({ nameZh: '测试' });
  await api.profiles.remove('profile-1');
  await api.searchCities('Paris');
  await api.chinese.searchCities('北京');
  await api.locations.resolve(input);
  await api.app.decideClose('proceed');

  assert.deepEqual(invocations, [
    ['profiles:list'], ['profiles:get', 'profile-1'], ['profiles:save', { nameZh: '测试' }],
    ['profiles:remove', 'profile-1'], ['cities:search', 'Paris'], ['chinese:searchCities', '北京'],
    ['locations:resolve', input], ['app:closeDecision', 'proceed'],
  ]);
});

test('close-request cleanup removes only its scoped listener', () => {
  const { api, ipcRenderer } = loadPreloadApi();
  const received = [];
  const other = () => {};
  ipcRenderer.on('app:closeRequested', other);
  const cleanup = api.app.onCloseRequested(() => received.push('requested'));

  ipcRenderer.emit('app:closeRequested', {});
  cleanup();
  ipcRenderer.emit('app:closeRequested', {});

  assert.deepEqual(received, ['requested']);
  assert.deepEqual(ipcRenderer.listeners('app:closeRequested'), [other]);
});

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
