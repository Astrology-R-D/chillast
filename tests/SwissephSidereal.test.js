'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const knownValues = require('./fixtures/swisseph-lahiri-known-values.json');
const AngleMath = require('../src/core/util/AngleMath');
const AstrologyService = require('../src/core/astrology/AstrologyService');
const ChartStrategyFactory = require('../src/core/astrology/ChartStrategyFactory');
const SwissephAdapter = require('../src/core/astrology/ephemeris/SwissephAdapter');
const SwissEphCore = require('../src/core/astrology/ephemeris/SwissEphCore');
const {
  createSwissEphCore,
} = require('../src/core/astrology/ephemeris/SwissEphCore');
const {
  SIDEREAL_FLAGS,
  SIDEREAL_HOUSE_FLAGS,
  TROPICAL_FLAGS,
} = require('../src/core/astrology/ephemeris/SwissEphConstants');

test('applies explicit Lahiri flags to sidereal bodies and houses without contaminating tropical calls', () => {
  const calls = [];
  const swiss = {
    SE_GREG_CAL: 1,
    SE_SIDM_LAHIRI: 1,
    SEFLG_SIDEREAL: 65536,
    swe_set_ephe_path: (value) => calls.push(['setPath', value]),
    swe_set_sid_mode: (...args) => calls.push(['setSidMode', ...args]),
    swe_calc_ut: (...args) => { calls.push(['calc', ...args]); return { longitude: 1 }; },
    swe_houses: (...args) => { calls.push(['houses', ...args]); return { house: [] }; },
    swe_houses_ex: (...args) => { calls.push(['housesEx', ...args]); return { house: [] }; },
    swe_julday: () => 2451545,
    swe_close: () => calls.push(['close']),
  };
  const ephePath = path.join('fixture', 'ephemeris');
  const core = createSwissEphCore(swiss, { existsSync: () => true });
  core.configure({ ephePath });

  core.calcBody(2451545, 0, 'sidereal');
  core.houses(2451545, 51.4779, 0, 'P', 'sidereal');
  core.calcBody(2451545, 0, 'tropical');
  core.houses(2451545, 51.4779, 0, 'P', 'tropical');

  assert.deepEqual(calls, [
    ['setPath', ephePath],
    ['setSidMode', swiss.SE_SIDM_LAHIRI, 0, 0],
    ['calc', 2451545, 0, SIDEREAL_FLAGS],
    ['setSidMode', swiss.SE_SIDM_LAHIRI, 0, 0],
    ['housesEx', 2451545, SIDEREAL_HOUSE_FLAGS, 51.4779, 0, 'P'],
    ['calc', 2451545, 0, TROPICAL_FLAGS],
    ['houses', 2451545, 51.4779, 0, 'P'],
  ]);
  assert.throws(() => core.calcBody(2451545, 0, 'draconic'), /Unknown zodiac mode: draconic/);
});

const ephePath = path.join(__dirname, '..', 'assets', 'ephemeris');
SwissEphCore.configure({ ephePath });

function circularError(actual, expected) {
  return Math.abs(AngleMath.delta(actual, expected));
}

function cast(zodiac, instantUtc = knownValues.instantUtc) {
  const adapter = new SwissephAdapter({ houseSystem: 'placidus', zodiac });
  const frame = adapter.castFromInstant(new Date(instantUtc), knownValues.coordinates);
  return {
    sun: frame.points.find(({ key }) => key === 'sun').longitude,
    moon: frame.points.find(({ key }) => key === 'moon').longitude,
    ascendant: frame.angles.ascendant,
    midheaven: frame.angles.midheaven,
  };
}

test('matches independently pinned tropical and Lahiri positions', () => {
  for (const zodiac of ['tropical', 'sidereal']) {
    const actual = cast(zodiac);
    for (const key of ['sun', 'moon', 'ascendant', 'midheaven']) {
      assert.ok(circularError(actual[key], knownValues[zodiac][key]) <= knownValues.maximumAngularError,
        `${zodiac} ${key}: expected ${knownValues[zodiac][key]}, received ${actual[key]}`);
    }
  }
});

test('applies the Lahiri offset to bodies and angles and crosses the pinned Aries boundary', () => {
  const tropical = cast('tropical');
  const sidereal = cast('sidereal');
  for (const key of ['sun', 'moon', 'ascendant', 'midheaven']) {
    assert.ok(Math.abs(AngleMath.normalize(tropical[key] - sidereal[key]) - knownValues.ayanamsha) <= 0.01);
  }
  const before = cast('sidereal', knownValues.boundary.beforeUtc).sun;
  const after = cast('sidereal', knownValues.boundary.afterUtc).sun;
  assert.ok(circularError(before, knownValues.boundary.beforeSun) <= knownValues.maximumAngularError);
  assert.ok(circularError(after, knownValues.boundary.afterSun) <= knownValues.maximumAngularError);
  assert.equal(Math.floor(before / 30), 11);
  assert.equal(Math.floor(after / 30), 0);
});

test('alternating tropical and sidereal calls remain deterministic and isolated', () => {
  const tropicalA = cast('tropical');
  const siderealA = cast('sidereal');
  const tropicalB = cast('tropical');
  const siderealB = cast('sidereal');
  assert.deepEqual(tropicalB, tropicalA);
  assert.deepEqual(siderealB, siderealA);
  assert.notDeepEqual(siderealA, tropicalA);
});

test('sidereal return and progression strategies retain zodiac metadata and corrected longitudes', () => {
  const service = new AstrologyService(new ChartStrategyFactory({ backend: 'swisseph' }));
  const primary = {
    id: 'primary', nameZh: 'A', nameEn: 'A', gender: 'other', notes: '', tags: [],
    birthData: { year: 1990, month: 1, day: 15, hour: 14, minute: 30, location: { label: 'Beijing', latitude: 39.9042, longitude: 116.4074 } },
  };
  const settings = (zodiac) => ({ houseSystem: 'placidus', zodiac, aspects: {} });
  const compute = (type, zodiac, options) => service.computeChart({ type, primary, settings: settings(zodiac), options });
  const siderealNatal = compute('natal', 'sidereal', {});
  const siderealReturn = compute('solarReturn', 'sidereal', { year: 2026 });
  const tropicalReturn = compute('solarReturn', 'tropical', { year: 2026 });
  const siderealProgressed = compute('progressed', 'sidereal', { targetDate: '2026-06-18T12:00:00.000Z' });
  const tropicalProgressed = compute('progressed', 'tropical', { targetDate: '2026-06-18T12:00:00.000Z' });
  const sun = (result, ring = result.rings.length - 1) => result.rings[ring].points.find(({ key }) => key === 'sun').longitude;

  assert.equal(siderealReturn.meta.settings.zodiac, 'sidereal');
  assert.equal(siderealProgressed.meta.settings.zodiac, 'sidereal');
  assert.ok(circularError(sun(siderealReturn), sun(siderealNatal, 0)) < 0.05);
  assert.ok(circularError(sun(siderealReturn), sun(tropicalReturn)) > 20);
  assert.ok(circularError(sun(siderealProgressed), sun(tropicalProgressed)) > 20);
});

test.after(() => SwissEphCore.close());
