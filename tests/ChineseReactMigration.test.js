'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Service = require('../src/core/chinese/ChineseAstrologyService');
const Adapter = require('../src/core/chinese/ChineseAstrologyAdapter');
const { getSolarTermCalendar } = require('../src/core/chinese/SolarTermCalendar');
const { assertAiContext } = require('../src/shared/WesternChartAiContext');
const { buildContextTools } = require('../src/core/ai/AstroToolkit');
const fixture = require('./fixtures/chinese-ui-results.json');

test('converts local birth time to UTC before true solar time and highlights exactly one hour pillar', () => {
  const result = new Service().computeBaZi(fixture.profile);
  assert.equal(result.bazi.localTrueSolarTime, '10:09:26');
  assert.equal(result.bazi.pillars.hour.full, '乙巳');
  assert.equal(result.bazi.allHourPillars.filter((h) => h.isCurrent).length, 1);
  assert.equal(result.bazi.allHourPillars.find((h) => h.isCurrent).full, result.bazi.pillars.hour.full);
  const observed = [];
  const jd = { toJD() { observed.push([this.Y, this.M, this.D, this.h, this.m]); return 0; } };
  const adapter = new Adapter({ JD: jd, J2000: 0, obb: { mingLiBaZi(_jd, _lon, ob) { Object.assign(ob, { bz_jn: '甲子', bz_jy: '甲子', bz_jr: '甲子', bz_js: '甲子' }); } } });
  adapter.computeBaZi({ year: 2026, month: 7, day: 1, hour: 23, minute: 15, location: { latitude: 40.7128 } }, -74.006);
  assert.deepEqual(observed[0], [2026, 7, 2, 3, 15]);
});

test('calendar validates the year and returns 24 ordered terms with padded dates', () => {
  for (const year of [1, 2026, 3000]) { const calendar = getSolarTermCalendar(year); assert.equal(calendar.terms.length, 24); assert.match(calendar.terms[0].date, /^\d{4}-/); assert.deepEqual(calendar.terms.map((t) => t.date), calendar.terms.map((t) => t.date).sort()); }
  for (const year of [0, 3001, 2026.5, '2026']) assert.throws(() => getSolarTermCalendar(year), /整数/);
});

test('Chinese workspace context supplies original computed facts to AI without stale Western charts', async () => {
  const { id, nameZh, nameEn, gender, birthData } = fixture.profile;
  const context = { kind: 'chinese-chart', route: 'chinese', chartType: 'bazi', resultId: 'bazi:fixture', activeProfile: { id, nameZh, nameEn, gender, birthData, displayName: nameZh }, lastBaziData: fixture.bazi };
  assert.equal(assertAiContext(context), context);
  assert.throws(() => assertAiContext({ ...context, lastChartData: {} }), /malformed/);
  const tools = await buildContextTools({ getContext: () => context });
  const [text, artifact] = await tools.find((t) => t.name === 'get_current_chart').func({});
  assert.equal(artifact.kind, 'bazi'); assert.match(text, /乙巳/); assert.match(text, /真太阳时: 10:09:26/);
  assert.deepEqual(artifact.data, fixture.bazi);
  const AiService = require('../src/core/ai/AiService'); const ai = new AiService({}, {}); ai.setContext(context);
  assert.match(ai._chartText(), /乙巳/); assert.match(ai._workspaceFacts()[0].artifact.facts['bazi:0'], /乙巳/);
});
