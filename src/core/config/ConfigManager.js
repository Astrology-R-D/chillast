'use strict';

const path = require('path');
const fs = require('fs');

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function themeAsCssVars(theme) {
  const vars = {};
  for (const [key, value] of Object.entries(theme)) {
    vars[`--${camelToKebab(key)}`] = String(value);
  }
  return vars;
}

function loadDefaults() {
  const configPath = path.resolve(__dirname, '..', '..', '..', 'config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

const ConfigManager = {
  load(overrides) {
    const defaults = loadDefaults();
    if (!overrides) return defaults;
    return deepMerge(defaults, overrides);
  },

  camelToKebab,
  themeAsCssVars,
  deepMerge,
};

module.exports = ConfigManager;
