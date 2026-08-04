'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
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
