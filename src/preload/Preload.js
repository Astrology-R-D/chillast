'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const MAX_AI_CONTEXT_BYTES = 512 * 1024;
const WESTERN_CONTEXT_KEYS = ['activeProfile', 'chartType', 'draftIsStale', 'draftSummary', 'focusedIdentity', 'kind', 'lastChartData', 'resultId', 'route', 'successfulFilters'];
const WESTERN_CONTEXT_OPTIONAL_KEYS = ['selectedRows'];
const LEGACY_CONTEXT_KEYS = ['activeProfile', 'chartType', 'lastChartData', 'route'];
const CHART_RESULT_KEYS = ['angles', 'aspects', 'distributions', 'houses', 'identities', 'meta', 'resultId', 'rings', 'subjects'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, keys) => isObject(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(value, key));
const hasExactKeysWithOptional = (value, required, optional) => isObject(value)
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  && required.every((key) => Object.hasOwn(value, key));
const isShortString = (value, maximum = 256) => typeof value === 'string' && value.length > 0 && value.length <= maximum;
const isProfile = (value) => value === null || (hasExactKeys(value, ['displayName', 'id']) && isShortString(value.id, 128) && isShortString(value.displayName));
const isFilterProfile = (value) => hasExactKeys(value, ['displayName', 'id']) && isShortString(value.id, 128) && isShortString(value.displayName);
const isSettings = (value) => hasExactKeys(value, ['aspects', 'houseSystem', 'zodiac']) && isShortString(value.houseSystem, 64)
  && ['tropical', 'sidereal'].includes(value.zodiac) && hasExactKeys(value.aspects, ['enabled', 'orbOverrides'])
  && Array.isArray(value.aspects.enabled) && value.aspects.enabled.length <= 32 && value.aspects.enabled.every((entry) => isShortString(entry, 64))
  && isObject(value.aspects.orbOverrides) && Object.keys(value.aspects.orbOverrides).length <= 32
  && Object.entries(value.aspects.orbOverrides).every(([key, entry]) => isShortString(key, 64) && typeof entry === 'number' && Number.isFinite(entry));
const isOptions = (value) => isObject(value) && Object.keys(value).every((key) => ['latitude', 'locationLabel', 'longitude', 'targetDate', 'year'].includes(key))
  && Object.values(value).every((entry) => (typeof entry === 'string' && entry.length <= 256) || (typeof entry === 'number' && Number.isFinite(entry)));
const isChartResult = (value) => hasExactKeys(value, CHART_RESULT_KEYS) && isShortString(value.resultId, 256) && isObject(value.meta)
  && isObject(value.angles) && isObject(value.distributions)
  && ['aspects', 'houses', 'identities', 'rings', 'subjects'].every((key) => Array.isArray(value[key]));
const isSuccessfulFilters = (value) => hasExactKeys(value, ['options', 'primary', 'secondary', 'settings', 'type']) && isShortString(value.type, 64)
  && isFilterProfile(value.primary) && (value.secondary === null || isFilterProfile(value.secondary)) && isSettings(value.settings) && isOptions(value.options);
const isDraftSummary = (value) => {
  if (value === null) return true;
  const required = ['houseSystem', 'label', 'type', 'zodiac'];
  const allowed = [...required, 'relocationLabel', 'returnYear', 'targetLocal'];
  return isObject(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.includes(key))
    && value.label === 'uncalculated' && isShortString(value.type, 64) && isShortString(value.houseSystem, 64)
    && ['tropical', 'sidereal'].includes(value.zodiac)
    && (!Object.hasOwn(value, 'returnYear') || (typeof value.returnYear === 'number' && Number.isFinite(value.returnYear)))
    && ['relocationLabel', 'targetLocal'].every((key) => !Object.hasOwn(value, key) || isShortString(value[key]));
};
const isSelectedRows = (value) => Array.isArray(value) && value.length <= 100 && value.every((row) => hasExactKeys(row, ['id', 'values'])
  && isShortString(row.id, 256) && isObject(row.values) && Object.keys(row.values).length <= 32
  && Object.entries(row.values).every(([key, entry]) => isShortString(key, 256) && (
    entry === null || typeof entry === 'boolean'
    || (typeof entry === 'number' && Number.isFinite(entry))
    || (typeof entry === 'string' && entry.length <= 1024)
  )));
const isWesternContext = (value) => hasExactKeysWithOptional(value, WESTERN_CONTEXT_KEYS, WESTERN_CONTEXT_OPTIONAL_KEYS) && value.kind === 'western-chart'
  && isShortString(value.route, 32) && isShortString(value.resultId, 256) && isShortString(value.chartType, 64) && isProfile(value.activeProfile)
  && isChartResult(value.lastChartData) && value.lastChartData.resultId === value.resultId && isSuccessfulFilters(value.successfulFilters)
  && value.successfulFilters.type === value.chartType && (!value.activeProfile || value.activeProfile.id === value.successfulFilters.primary.id)
  && (value.focusedIdentity === null || isShortString(value.focusedIdentity, 256)) && typeof value.draftIsStale === 'boolean' && isDraftSummary(value.draftSummary)
  && (!Object.hasOwn(value, 'selectedRows') || isSelectedRows(value.selectedRows));
const isLegacyLocation = (value) => hasExactKeys(value, ['label', 'latitude', 'longitude']) && typeof value.label === 'string'
  && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && typeof value.longitude === 'number' && Number.isFinite(value.longitude);
const isLegacyBirthData = (value) => hasExactKeys(value, ['day', 'hour', 'location', 'minute', 'month', 'year'])
  && ['day', 'hour', 'minute', 'month', 'year'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
  && isLegacyLocation(value.location);
const isLegacyProfile = (value) => value === null || (isObject(value)
  && Object.keys(value).every((key) => ['birthData', 'displayName', 'gender', 'id', 'nameEn', 'nameZh'].includes(key))
  && (!value.id || isShortString(value.id, 128)) && (!value.displayName || isShortString(value.displayName))
  && (!value.birthData || isLegacyBirthData(value.birthData)));
const isLegacyContext = (value) => hasExactKeys(value, LEGACY_CONTEXT_KEYS) && isShortString(value.route, 64)
  && isLegacyProfile(value.activeProfile) && (value.lastChartData === null || isObject(value.lastChartData))
  && (value.chartType === null || isShortString(value.chartType, 64));
const utf8Bytes = (value) => {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
};
const assertAiContext = (value) => {
  if (value === null) return null;
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw new TypeError('AI context must be serializable'); }
  if (utf8Bytes(serialized) > MAX_AI_CONTEXT_BYTES) throw new RangeError('AI context exceeds size limit');
  if (!isWesternContext(value) && !isLegacyContext(value)) throw new TypeError('AI context has malformed or extra fields');
  return value;
};

/**
 * Preload — the single, audited bridge between the sandboxed renderer and the
 * main process. It exposes a small, typed-by-convention API on `window.mystApi`
 * and nothing else: the renderer never gets Node or ipcRenderer directly, which
 * keeps the attack surface minimal while contextIsolation stays on.
 *
 * Every call returns the IpcRouter envelope `{ ok, data | error }`.
 */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel, callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

contextBridge.exposeInMainWorld('mystApi', {
  /** Static reference data (signs, aspects, chart types, …). */
  getReferenceData: () => invoke('reference:get'),
  getConfig: () => invoke('config:get'),
  getLocale: () => invoke('locale:get'),
  getChartTypes: () => invoke('chartTypes:get'),

  /** Profile CRUD. */
  profiles: {
    list: () => invoke('profiles:list'),
    get: (id) => invoke('profiles:get', id),
    save: (profileJson) => invoke('profiles:save', profileJson),
    remove: (id) => invoke('profiles:remove', id),
  },

  /** Birth-place lookup. */
  searchCities: (query) => invoke('cities:search', query),

  locations: {
    resolve: (input) => invoke('locations:resolve', input),
  },

  app: {
    onCloseRequested: (callback) => subscribe('app:closeRequested', callback),
    decideClose: (decision) => invoke('app:closeDecision', decision),
  },

  /** Chart computation. */
  computeChart: (request) => invoke('chart:compute', request),

  /** Chinese astrology (命理). */
  chinese: {
    getReferenceData: () => invoke('chinese:reference'),
    computeBazi: (profileData) => invoke('chinese:computeBazi', profileData),
    getSolarTerms: (year) => invoke('chinese:solarTerms', year),
    searchCities: (query) => invoke('chinese:searchCities', query),
  },

  /** AI astrology advisor. */
  ai: {
    interpret: (chartData, options) => invoke('ai:interpret', chartData, options),
    chat: (messages, context) => invoke('ai:chat', messages, context),
    stop: (sessionId) => invoke('ai:stop', sessionId),
    configure: (settings) => invoke('ai:configure', settings),
    status: () => invoke('ai:status'),
    testConnection: () => invoke('ai:testConnection'),
    testWithSettings: (settings) => invoke('ai:testWithSettings', settings),
    providers: () => invoke('ai:providers'),
    catalog: {
      providers: () => invoke('ai:catalog:providers'),
      models: (providerKey) => invoke('ai:catalog:models', providerKey),
    },
    setContext: (context) => invoke('ai:setContext', assertAiContext(context)),
    onToken: (callback) => ipcRenderer.on('ai:token', (_e, data) => callback(data)),
    onDone: (callback) => ipcRenderer.on('ai:done', (_e, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('ai:error', (_e, data) => callback(data)),
    onStatusChanged: (callback) => subscribe('ai:statusChanged', callback),
    onInitProgress: (callback) => subscribe('ai:initProgress', callback),
    initStatus: () => invoke('ai:initStatus'),
    onSessionsChanged: (callback) => subscribe('ai:sessionsChanged', callback),
    removeAllListeners: () => {
      // Only the per-request streaming channels are cleared between turns;
      // statusChanged / sessionsChanged are long-lived and registered once.
      for (const ch of ['ai:token', 'ai:done', 'ai:error'])
        ipcRenderer.removeAllListeners(ch);
    },
    readTextAttachment: (filePath) => invoke('ai:readTextAttachment', filePath),
    knowledge: {
      list: () => invoke('ai:knowledge:list'),
      import: (filePaths) => invoke('ai:knowledge:import', filePaths),
      remove: (docId) => invoke('ai:knowledge:remove', docId),
    },
    tools: {
      describe: () => invoke('ai:tools:describe'),
      setProviderEnabled: (id, enabled) => invoke('ai:tools:setProviderEnabled', id, enabled),
    },
    mcp: {
      list: () => invoke('ai:mcp:list'),
      save: (servers) => invoke('ai:mcp:save', servers),
    },
    sessions: {
      list: () => invoke('ai:sessions:list'),
      get: (id) => invoke('ai:sessions:get', id),
      create: () => invoke('ai:sessions:create'),
      delete: (id) => invoke('ai:sessions:delete', id),
      append: (sessionId, message) => invoke('ai:sessions:append', sessionId, message),
      rename: (id, title) => invoke('ai:sessions:rename', id, title),
      generateTitle: (id) => invoke('ai:sessions:generateTitle', id),
      fork: (sessionId, messageIndex) => invoke('ai:sessions:fork', sessionId, messageIndex),
      setPinned: (sessionId, pinned) => invoke('ai:sessions:setPinned', sessionId, pinned),
      replaceFrom: (sessionId, messageIndex, message) => invoke('ai:sessions:replaceFrom', sessionId, messageIndex, message),
    },
  },
});
