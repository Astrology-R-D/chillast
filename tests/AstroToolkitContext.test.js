'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildContextTools } = require('../src/core/ai/AstroToolkit');

async function toolsFor(context) {
  const tools = await buildContextTools({ getContext: () => context });
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

test('AstroToolkit consumes successful Western context without duplicating chart data', async () => {
  const lastChartData = { resultId: 'result-1', meta: { type: 'natal', title: 'Natal' }, rings: [], houses: [], aspects: [] };
  const context = {
    kind: 'western-chart', route: 'personal', resultId: 'result-1', chartType: 'natal',
    activeProfile: { id: 'p1', displayName: 'Alice' }, lastChartData,
    successfulFilters: { type: 'natal', primary: { id: 'p1', displayName: 'Alice' }, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
    focusedIdentity: null, draftIsStale: false, draftSummary: null,
  };
  const tools = await toolsFor(context);
  assert.match(await tools.get_current_chart.invoke({}), /natal/i);
  assert.match(await tools.get_current_context.invoke({}), /personal.*natal/s);
  assert.match(await tools.get_active_profile.invoke({}), /Alice/);
  assert.equal(Object.hasOwn(context, 'result'), false);
});

test('AstroToolkit reports no chart before a successful Western result', async () => {
  const tools = await toolsFor({ kind: 'western-chart', route: 'personal', activeProfile: { id: 'p1', displayName: 'Alice' }, lastChartData: null, chartType: null });
  assert.match(await tools.get_current_chart.invoke({}), /尚未计算/);
});
