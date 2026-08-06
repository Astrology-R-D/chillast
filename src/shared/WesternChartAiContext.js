'use strict';

const MAX_CONTEXT_BYTES = 512 * 1024;
const WESTERN_KEYS = ['activeProfile', 'chartType', 'draftIsStale', 'draftSummary', 'focusedIdentity', 'kind', 'lastChartData', 'resultId', 'route', 'successfulFilters'];
const WESTERN_OPTIONAL_KEYS = ['selectedRows'];
const LEGACY_KEYS = ['activeProfile', 'chartType', 'lastChartData', 'route'];
const RESULT_KEYS = ['angles', 'aspects', 'distributions', 'houses', 'identities', 'meta', 'resultId', 'rings', 'subjects'];

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, allowed) { return object(value) && Object.keys(value).every((key) => allowed.includes(key)) && allowed.every((key) => Object.hasOwn(value, key)); }
function exactKeysWithOptional(value, required, optional) {
  return object(value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}
function shortString(value, maximum = 256) { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }
function profile(value) { return value === null || (exactKeys(value, ['displayName', 'id']) && shortString(value.id, 128) && shortString(value.displayName)); }
function profileFilter(value) { return exactKeys(value, ['displayName', 'id']) && shortString(value.id, 128) && shortString(value.displayName); }
function settings(value) {
  return exactKeys(value, ['aspects', 'houseSystem', 'zodiac']) && shortString(value.houseSystem, 64)
    && ['tropical', 'sidereal'].includes(value.zodiac) && exactKeys(value.aspects, ['enabled', 'orbOverrides'])
    && Array.isArray(value.aspects.enabled) && value.aspects.enabled.length <= 32 && value.aspects.enabled.every((entry) => shortString(entry, 64))
    && object(value.aspects.orbOverrides) && Object.keys(value.aspects.orbOverrides).length <= 32
    && Object.entries(value.aspects.orbOverrides).every(([key, entry]) => shortString(key, 64) && typeof entry === 'number' && Number.isFinite(entry));
}
function options(value) {
  const keys = ['latitude', 'locationLabel', 'longitude', 'targetDate', 'year'];
  return object(value) && Object.keys(value).every((key) => keys.includes(key))
    && Object.values(value).every((entry) => (typeof entry === 'string' && entry.length <= 256) || (typeof entry === 'number' && Number.isFinite(entry)));
}
function chartResult(value) {
  return exactKeys(value, RESULT_KEYS) && shortString(value.resultId, 256) && object(value.meta)
    && object(value.angles) && object(value.distributions)
    && ['aspects', 'houses', 'identities', 'rings', 'subjects'].every((key) => Array.isArray(value[key]));
}
function draftSummary(value) {
  if (value === null) return true;
  const required = ['houseSystem', 'label', 'type', 'zodiac'];
  const allowed = [...required, 'relocationLabel', 'returnYear', 'targetLocal'];
  return object(value) && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.includes(key)) && value.label === 'uncalculated'
    && shortString(value.type, 64) && shortString(value.houseSystem, 64) && ['tropical', 'sidereal'].includes(value.zodiac)
    && (!Object.hasOwn(value, 'returnYear') || (typeof value.returnYear === 'number' && Number.isFinite(value.returnYear)))
    && ['relocationLabel', 'targetLocal'].every((key) => !Object.hasOwn(value, key) || shortString(value[key]));
}
function successfulFilters(value) {
  return exactKeys(value, ['options', 'primary', 'secondary', 'settings', 'type']) && shortString(value.type, 64)
    && profileFilter(value.primary) && (value.secondary === null || profileFilter(value.secondary)) && settings(value.settings) && options(value.options);
}
function selectedRows(value) {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every((row) => exactKeys(row, ['id', 'values']) && shortString(row.id, 256) && object(row.values)
    && Object.keys(row.values).length <= 32
    && Object.entries(row.values).every(([key, entry]) => shortString(key, 256) && (
      entry === null || typeof entry === 'boolean'
      || (typeof entry === 'number' && Number.isFinite(entry))
      || (typeof entry === 'string' && entry.length <= 1024)
    )));
}
function western(value) {
  return exactKeysWithOptional(value, WESTERN_KEYS, WESTERN_OPTIONAL_KEYS) && value.kind === 'western-chart' && shortString(value.route, 32)
    && shortString(value.resultId, 256) && shortString(value.chartType, 64) && profile(value.activeProfile)
    && chartResult(value.lastChartData) && value.lastChartData.resultId === value.resultId
    && successfulFilters(value.successfulFilters) && (value.focusedIdentity === null || shortString(value.focusedIdentity, 256))
    && value.successfulFilters.type === value.chartType
    && (!value.activeProfile || value.activeProfile.id === value.successfulFilters.primary.id)
    && typeof value.draftIsStale === 'boolean' && draftSummary(value.draftSummary)
    && (!Object.hasOwn(value, 'selectedRows') || selectedRows(value.selectedRows));
}
function legacyLocation(value) {
  return exactKeys(value, ['label', 'latitude', 'longitude']) && typeof value.label === 'string'
    && typeof value.latitude === 'number' && Number.isFinite(value.latitude)
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude);
}
function legacyBirthData(value) {
  return exactKeys(value, ['day', 'hour', 'location', 'minute', 'month', 'year'])
    && ['day', 'hour', 'minute', 'month', 'year'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && legacyLocation(value.location);
}
function legacyProfile(value) {
  if (value === null) return true;
  return object(value) && Object.keys(value).every((key) => ['birthData', 'displayName', 'gender', 'id', 'nameEn', 'nameZh'].includes(key))
    && (!value.id || shortString(value.id, 128)) && (!value.displayName || shortString(value.displayName))
    && (!value.birthData || legacyBirthData(value.birthData));
}
function legacy(value) {
  return exactKeys(value, LEGACY_KEYS) && shortString(value.route, 64) && legacyProfile(value.activeProfile)
    && (value.lastChartData === null || object(value.lastChartData)) && (value.chartType === null || shortString(value.chartType, 64));
}

function assertAiContext(value) {
  if (value === null) return null;
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw new TypeError('AI context must be serializable'); }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CONTEXT_BYTES) throw new RangeError('AI context exceeds size limit');
  if (!western(value) && !legacy(value)) throw new TypeError('AI context has malformed or extra fields');
  return value;
}

module.exports = { MAX_CONTEXT_BYTES, assertAiContext };
