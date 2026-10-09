'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildComputeTools } = require('../src/core/ai/AstroToolkit');
const AstroToolProvider = require('../src/core/ai/tools/AstroToolProvider');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const AiService = require('../src/core/ai/AiService');

const birth = { year: 2004, month: 7, day: 7, hour: 11, minute: 15, latitude: 26.6, longitude: 104.8333 };
const targets = { targetYear: 2026, targetMonth: 10, targetDay: 9 };
const pair = Object.fromEntries([1, 2].flatMap((n) => Object.entries(birth).map(([k, v]) => [`${k}${n}`, v])));
function calculator() {
  const requests = [];
  return { requests, computeChart(request) { requests.push(request); return { meta: { type: request.type, settings: request.settings }, rings: [], houses: [], aspects: [] }; } };
}

test('all Western tools preserve a snapshot of successful settings and allow explicit partial overrides', async () => {
  const svc = calculator();
  const settings = { houseSystem: 'whole-sign', zodiac: 'sidereal', aspects: { enabled: ['conjunction'], orbOverrides: { conjunction: 4 } } };
  const tools = await buildComputeTools(svc, {}, settings);
  settings.houseSystem = 'koch'; settings.aspects.orbOverrides.conjunction = 9;
  for (const name of ['compute_natal_chart', 'compute_transit', 'compute_synastry', 'compute_solar_return', 'compute_progressed']) {
    const tool = tools.find((t) => t.name === name);
    const input = name === 'compute_synastry' ? pair : { ...birth, ...targets };
    await tool.invoke(input);
    assert.deepEqual(svc.requests.at(-1).settings, { houseSystem: 'whole-sign', zodiac: 'sidereal', aspects: { enabled: ['conjunction'], orbOverrides: { conjunction: 4 } } });
    await tool.invoke({ ...input, settings: { zodiac: 'tropical' } });
    assert.equal(svc.requests.at(-1).settings.zodiac, 'tropical');
    assert.equal(svc.requests.at(-1).settings.houseSystem, 'whole-sign');
    assert.equal(tool.schema.safeParse({ ...input, settings: { zodiac: 'made-up' } }).success, false);
  }
  const defaults = await buildComputeTools(svc, {});
  await defaults.find((t) => t.name === 'compute_natal_chart').invoke(birth);
  assert.deepEqual(svc.requests.at(-1).settings, { houseSystem: 'placidus', zodiac: 'tropical' });
});

test('AI tools use successful filters, keep running requests stable, and isolate explicit chart snapshots', async () => {
  const svc = calculator();
  const ai = new AiService(svc, {});
  const registry = new ToolRegistry().register(new AstroToolProvider(svc, {}));
  ai._registry = registry;
  ai._context = {
    successfulFilters: { settings: { houseSystem: 'whole-sign', zodiac: 'sidereal' } },
    draftIsStale: true, draftSummary: { houseSystem: 'koch', zodiac: 'tropical' },
  };
  const first = await ai._toolsForSession();
  ai._context.successfulFilters.settings = { houseSystem: 'koch', zodiac: 'tropical' };
  const second = await ai._toolsForSession();
  await first.find((t) => t.name === 'compute_natal_chart').invoke(birth);
  assert.deepEqual(svc.requests.at(-1).settings, { houseSystem: 'whole-sign', zodiac: 'sidereal' });
  await second.find((t) => t.name === 'compute_natal_chart').invoke(birth);
  assert.deepEqual(svc.requests.at(-1).settings, { houseSystem: 'koch', zodiac: 'tropical' });
  const explicit = await ai._toolsForSession(null, [], { houseSystem: 'equal-house', zodiac: 'sidereal' });
  await explicit.find((t) => t.name === 'compute_natal_chart').invoke(birth);
  assert.deepEqual(svc.requests.at(-1).settings, { houseSystem: 'equal-house', zodiac: 'sidereal' });
  registry.setEnabled('astro', false);
  assert.deepEqual(await ai._toolsForSession(), []);
});
