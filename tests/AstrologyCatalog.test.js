'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const AstrologyService = require('../src/core/astrology/AstrologyService');
const ChartStrategyFactory = require('../src/core/astrology/ChartStrategyFactory');
const SwissEphCore = require('../src/core/astrology/ephemeris/SwissEphCore');

SwissEphCore.configure({ ephePath: path.join(__dirname, '..', 'assets', 'ephemeris') });

const requests = {
  natal: {},
  transit: { targetDate: '2026-06-18T12:00:00.000Z' },
  tertiaryProgressed: { targetDate: '2026-06-18T12:00:00.000Z' },
  progressed: { targetDate: '2026-06-18T12:00:00.000Z' },
  lunarReturn: { targetDate: '2026-06-18T12:00:00.000Z' },
  solarReturn: { year: 2026 },
  solarArc: { targetDate: '2026-06-18T12:00:00.000Z' },
  firdaria: { targetDate: '2026-06-18T12:00:00.000Z' },
  profection: { targetDate: '2026-06-18T12:00:00.000Z' },
  relocation: { latitude: 40.7128, longitude: -74.006, locationLabel: 'New York' },
  synastry: {},
  composite: {},
  marx: {},
  davison: {},
  compositeSecondary: { targetDate: '2026-06-18T12:00:00.000Z' },
  compositeTertiary: { targetDate: '2026-06-18T12:00:00.000Z' },
  marxSecondary: { targetDate: '2026-06-18T12:00:00.000Z' },
  marxTertiary: { targetDate: '2026-06-18T12:00:00.000Z' },
  davisonSecondary: { targetDate: '2026-06-18T12:00:00.000Z' },
  davisonTertiary: { targetDate: '2026-06-18T12:00:00.000Z' },
};

const expectedOptions = {
  natal: [], transit: ['targetDate'], tertiaryProgressed: ['targetDate'], progressed: ['targetDate'],
  lunarReturn: ['targetDate'], solarReturn: ['year'], solarArc: ['targetDate'], firdaria: ['targetDate'],
  profection: ['targetDate'], relocation: ['location'], synastry: [], composite: [], marx: [], davison: [],
  compositeSecondary: ['targetDate'], compositeTertiary: ['targetDate'], marxSecondary: ['targetDate'],
  marxTertiary: ['targetDate'], davisonSecondary: ['targetDate'], davisonTertiary: ['targetDate'],
};

const primary = {
  id: 'primary', nameZh: '甲', nameEn: 'Alpha', gender: 'male', notes: '', tags: [],
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
  birthData: { year: 1990, month: 1, day: 15, hour: 14, minute: 30, location: { label: 'Beijing', latitude: 39.9042, longitude: 116.4074 } },
};
const secondary = {
  id: 'secondary', nameZh: '乙', nameEn: 'Beta', gender: 'female', notes: '', tags: [],
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
  birthData: { year: 1992, month: 7, day: 3, hour: 9, minute: 5, location: { label: 'Shanghai', latitude: 31.2304, longitude: 121.4737 } },
};
const settings = { houseSystem: 'placidus', zodiac: 'tropical', aspects: {} };
const service = new AstrologyService(new ChartStrategyFactory({ backend: 'swisseph' }));
const twoRingTypes = new Set(['transit', 'progressed', 'tertiaryProgressed', 'solarArc', 'synastry', 'davisonSecondary', 'davisonTertiary']);

function assertFiniteChart(result) {
  assert.equal(typeof result.meta, 'object');
  assert.equal(result.houses.length, 12);
  assert.equal(new Set(result.houses.map(({ index }) => index)).size, 12);
  assert.equal(new Set(result.rings.map(({ id }) => id)).size, result.rings.length);
  for (const ring of result.rings) {
    assert.equal(new Set(ring.points.map(({ key }) => key)).size, ring.points.length);
    for (const point of ring.points) assert.ok(Number.isFinite(point.longitude));
  }
  for (const house of result.houses) assert.ok(Number.isFinite(house.cuspLongitude));
  for (const angle of Object.values(result.angles)) assert.ok(Number.isFinite(angle.longitude));
  for (const aspect of result.aspects) {
    for (const key of ['exactAngle', 'orb', 'orbUsed', 'strength', 'separation']) assert.ok(Number.isFinite(aspect[key]));
  }
}

test('authoritative catalog exposes the exact tokens and option mappings', () => {
  const definitions = service.chartTypes();
  assert.deepEqual(definitions.map(({ type }) => type), Object.keys(requests));
  for (const definition of definitions) {
    assert.deepEqual(definition.options, expectedOptions[definition.type]);
    assert.equal(definition.requiresSecondary, definition.category === 'relationship');
  }
});

for (const [type, options] of Object.entries(requests)) {
  test(`computes ${type} through the production Swiss factory`, () => {
    const definition = service.chartTypes().find((entry) => entry.type === type);
    const request = {
      type,
      primary,
      settings,
      options,
    };
    if (definition.requiresSecondary) request.secondary = secondary;
    const result = service.computeChart(request);
    assert.equal(result.meta.type, type);
    assert.equal(result.rings.length, twoRingTypes.has(type) ? 2 : 1);
    assertFiniteChart(result);
  });
}

test('rejects equal relationship profiles', () => {
  assert.throws(() => service.computeChart({ type: 'synastry', primary, secondary: { ...secondary, id: 'primary' }, settings, options: {} }), /不同档案/);
});

test('rejects undeclared options, personal secondary profiles, and malformed envelopes', () => {
  assert.throws(() => service.computeChart({ type: 'natal', primary, settings, options: { targetDate: '2026-01-01T00:00:00.000Z' } }), /选项|option/i);
  assert.throws(() => service.computeChart({ type: 'natal', primary, secondary, settings, options: {} }), /次体|secondary/i);
  assert.throws(() => service.computeChart({ type: 'natal', primary, secondary: null, settings, options: {} }), /次体|secondary/i);
  assert.throws(() => service.computeChart({ type: 'natal', primary, secondary: undefined, settings, options: {} }), /次体|secondary/i);
  for (const request of [null, [], { type: 'natal', primary, settings: [], options: {} }, { type: 'natal', primary, settings, options: [] }]) {
    assert.throws(() => service.computeChart(request), /请求|settings|options|对象/i);
  }
});

test.after(() => SwissEphCore.close());
