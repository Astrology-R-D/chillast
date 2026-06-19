'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const VENDOR = path.join(__dirname, '..', '..', '..', 'vendor', 'sxwnl', 'src');

const LOAD_ORDER = ['tools.js', 'eph0.js', 'ephB.js', 'eph.js', 'JW.js', 'lunar.js'];

const storage = new Map();
const sandbox = {
  Math, Array, Object, String, Number, Date, Boolean, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  console,
  alert: () => {},
  window: {
    Storage: function Storage() {},
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
  },
  localStorage: {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document: {
    cookie: '',
    createElement: () => ({ add: () => {}, value: '', text: '' }),
  },
};
sandbox.window.Storage.prototype = {};

const script = LOAD_ORDER
  .map((f) => fs.readFileSync(path.join(VENDOR, f), 'utf-8'))
  .join('\n;\n');

vm.runInNewContext(script, sandbox, { filename: 'sxwnl-bundle.js' });

module.exports = sandbox;
