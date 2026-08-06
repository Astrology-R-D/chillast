'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildContextTools } = require('../src/core/ai/AstroToolkit');
const ContextToolProvider = require('../src/core/ai/tools/ContextToolProvider');

async function toolsFor(context) {
  const tools = await buildContextTools({ getContext: () => context });
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

test('AstroToolkit consumes successful Western context without duplicating chart data', async () => {
  const lastChartData = { resultId: 'result-1', meta: { type: 'natal', title: 'Natal' }, rings: [], houses: [], aspects: [] };
  const context = {
    kind: 'western-chart', route: 'personal', resultId: 'result-1', chartType: 'natal',
    activeProfile: { id: 'p1', displayName: 'Alice' }, lastChartData,
    successfulFilters: { type: 'natal', primary: { id: 'p1', displayName: 'Alice' }, secondary: null, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
    focusedIdentity: 'natal:sun', draftIsStale: false, draftSummary: null,
  };
  const provider = new ContextToolProvider({ getContext: () => context });
  const tools = Object.fromEntries((await provider.listTools()).map((tool) => [tool.name, tool]));
  const chart = await tools.get_current_chart.invoke({});
  assert.match(chart, /natal/i);
  assert.match(chart, /"route":"personal"/);
  assert.match(chart, /"displayName":"Alice"/);
  assert.match(chart, /"zodiac":"tropical"/);
  assert.match(chart, /"focusedIdentity":"natal:sun"/);
  assert.match(chart, /"draftIsStale":false/);
  assert.match(await tools.get_current_context.invoke({}), /personal.*natal/s);
  assert.match(await tools.get_active_profile.invoke({}), /Alice/);
  assert.equal(Object.hasOwn(context, 'result'), false);
});

test('ContextToolProvider distinguishes accepted filters from a stale uncalculated draft', async () => {
  const context = {
    kind: 'western-chart', route: 'personal', resultId: 'result-1', chartType: 'natal',
    activeProfile: { id: 'p1', displayName: 'Alice' },
    lastChartData: { resultId: 'result-1', meta: { type: 'natal' }, rings: [], houses: [], aspects: [] },
    successfulFilters: { type: 'natal', primary: { id: 'p1', displayName: 'Alice' }, secondary: null, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
    focusedIdentity: 'natal:moon', draftIsStale: true,
    draftSummary: { label: 'uncalculated', type: 'natal', houseSystem: 'placidus', zodiac: 'sidereal' },
    selectedRows: [{ id: 'natal:moon', values: { point: 'moon', longitude: 123.5 } }],
  };
  const provider = new ContextToolProvider({ getContext: () => context });
  const chartTool = (await provider.listTools()).find(({ name }) => name === 'get_current_chart');
  const output = await chartTool.invoke({});
  assert.match(output, /"zodiac":"tropical"/);
  assert.match(output, /"draftIsStale":true/);
  assert.match(output, /"draftSummary":\{"label":"uncalculated".*"zodiac":"sidereal"/);
  assert.match(output, /"selectedRows":\[\{"id":"natal:moon"/);
});

test('AstroToolkit reports no chart before a successful Western result', async () => {
  const tools = await toolsFor({ kind: 'western-chart', route: 'personal', activeProfile: { id: 'p1', displayName: 'Alice' }, lastChartData: null, chartType: null });
  assert.match(await tools.get_current_chart.invoke({}), /尚未计算/);
});

test('AstroToolkit preserves legacy current-chart serialization', async () => {
  const tools = await toolsFor({
    route: 'charts', activeProfile: null, chartType: 'natal',
    lastChartData: { meta: { type: 'natal' }, rings: [], houses: [], aspects: [] },
  });
  const output = await tools.get_current_chart.invoke({});
  assert.match(output, /natal/i);
  assert.doesNotMatch(output, /当前工作区上下文|successfulFilters/);
});
