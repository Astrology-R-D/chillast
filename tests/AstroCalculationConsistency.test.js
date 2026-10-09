'use strict';

// Run with the native binding built for the chosen runtime, like AstrologyCatalog.test.js.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const AstrologyService = require('../src/core/astrology/AstrologyService');
const ChartStrategyFactory = require('../src/core/astrology/ChartStrategyFactory');
const SwissephAdapter = require('../src/core/astrology/ephemeris/SwissephAdapter');
const SwissEphCore = require('../src/core/astrology/ephemeris/SwissEphCore');
const ConfigManager = require('../src/core/config/ConfigManager');
const { buildComputeTools } = require('../src/core/ai/AstroToolkit');
const { chartFacts } = require('../src/core/ai/ToolResult');
const { toText } = require('../src/core/ai/prompts/ChartSerializer');

SwissEphCore.configure({ ephePath: path.join(__dirname, '..', 'assets', 'ephemeris') });
after(() => SwissEphCore.close());
const service = new AstrologyService(new ChartStrategyFactory({ backend: ConfigManager.load().ephemeris.backend }));
const birth = { year: 2004, month: 7, day: 7, hour: 11, minute: 15, latitude: 26.6, longitude: 104.8333 };
const other = { year: 2005, month: 7, day: 4, hour: 12, minute: 0, latitude: 23.35, longitude: 116.6833 };
function profile(b, name) {
  return { nameZh: name, gender: 'other', birthData: { year: b.year, month: b.month, day: b.day, hour: b.hour, minute: b.minute, location: { label: name, latitude: b.latitude, longitude: b.longitude } } };
}
function physicalData(c) {
  return { points: c.rings.map((r) => r.points), houses: c.houses, angles: c.angles, aspects: c.aspects, settings: c.meta.settings, instantUtc: c.meta.instantUtc };
}

test('production configuration uses Swiss Ephemeris and reproduces the screenshot Moon position', () => {
  assert.equal(service.factory.deps.EphemerisAdapter, SwissephAdapter);
  const chart = service.computeChart({ type: 'natal', primary: profile(birth, 'vac') });
  const moon = chart.rings[0].points.find((p) => p.key === 'moon');
  assert.equal(chart.meta.instantUtc, '2004-07-07T03:15:00.000Z');
  assert.equal(moon.longitude, 348.9872);
  assert.equal(moon.degreeInSign, 18.9872);
  assert.equal(moon.house, 6);
  assert.deepEqual(moon.dms, { degrees: 18, minutes: 59, seconds: 14 });
  assert.match(chartFacts(chart)['natal:moon'], /双鱼座 18°59′ 第6宫/);
  assert.match(toText(chart), /双鱼座 18°59′ 第6宫/);
});

test('all AI Western tools produce the same Swiss physical data as direct UI service requests', async () => {
  const targetDate = '2026-10-09T12:00:00.000Z';
  const pair = Object.fromEntries([birth, other].flatMap((b, i) => Object.entries(b).map(([k, v]) => [`${k}${i + 1}`, v])));
  for (const settings of [{ houseSystem: 'placidus', zodiac: 'tropical' }, { houseSystem: 'whole-sign', zodiac: 'sidereal' }]) {
    const tools = await buildComputeTools(service, {}, settings);
    for (const [name, type, input, options] of [
      ['compute_natal_chart', 'natal', birth, {}],
      ['compute_transit', 'transit', { ...birth, targetYear: 2026, targetMonth: 10, targetDay: 9 }, { targetDate }],
      ['compute_synastry', 'synastry', pair, {}],
      ['compute_solar_return', 'solarReturn', { ...birth, targetYear: 2026 }, { year: 2026 }],
      ['compute_progressed', 'progressed', { ...birth, targetYear: 2026, targetMonth: 10, targetDay: 9 }, { targetDate }],
    ]) {
      const request = { type, primary: profile(birth, 'vac'), settings, options };
      if (type === 'synastry') request.secondary = profile(other, 'ljy');
      const expected = service.computeChart(request);
      const [content, artifact] = await tools.find((t) => t.name === name).func(input);
      assert.equal(artifact.kind, 'chart', `${name}: ${content}`);
      assert.deepEqual(physicalData(artifact.data), physicalData(expected), `${name}: ${JSON.stringify(settings)}`);
    }
  }
});
