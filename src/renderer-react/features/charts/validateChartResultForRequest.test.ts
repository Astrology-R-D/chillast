import { describe, expect, test } from 'vitest';
import { CHART_DESCRIPTORS } from './catalog';
import { CHART_TYPES, type ChartRequest, type ChartType, type NormalizedChartResult } from './contracts';
import { EXPECTED_RINGS_BY_CHART_TYPE, validateChartResultForRequest } from './validateChartResultForRequest';

const expectedRings = {
  natal: [['natal', 'primary']],
  transit: [['natal', 'primary'], ['transit', 'transit']],
  tertiaryProgressed: [['natal', 'primary'], ['tertiary', 'progressed']],
  progressed: [['natal', 'primary'], ['progressed', 'progressed']],
  lunarReturn: [['lunarReturn', 'primary']],
  solarReturn: [['solarReturn', 'primary']],
  solarArc: [['natal', 'primary'], ['solarArc', 'progressed']],
  firdaria: [['natal', 'primary']],
  profection: [['profection', 'primary']],
  relocation: [['relocation', 'primary']],
  synastry: [['primary', 'primary'], ['secondary', 'secondary']],
  composite: [['composite', 'composite']],
  marx: [['marx', 'composite']],
  davison: [['davison', 'composite']],
  compositeSecondary: [['compositeSecondary', 'composite']],
  compositeTertiary: [['compositeTertiary', 'composite']],
  marxSecondary: [['marxSecondary', 'composite']],
  marxTertiary: [['marxTertiary', 'composite']],
  davisonSecondary: [['davison', 'primary'], ['davisonSecondary', 'progressed']],
  davisonTertiary: [['davison', 'primary'], ['davisonTertiary', 'progressed']],
} as const satisfies Record<ChartType, readonly (readonly [string, string])[]>;

function request(type: ChartType): ChartRequest {
  return {
    type,
    primary: { id: 'a' } as ChartRequest['primary'],
    ...(CHART_DESCRIPTORS[type].route === 'relationship' ? { secondary: { id: 'b' } as ChartRequest['primary'] } : {}),
    settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } },
    options: {},
  };
}

function result(type: ChartType): NormalizedChartResult {
  const rings = expectedRings[type].map(([id, role]) => ({ id, role, identity: `ring:${id}`, label: id, points: [] }));
  return {
    resultId: type,
    identities: rings.map(({ identity }) => identity) as NormalizedChartResult['identities'],
    meta: { type, typeNameZh: type, title: type, subtitle: '', settings: { houseSystem: 'placidus', zodiac: 'tropical' }, generatedAt: '2026-01-01T00:00:00.000Z', instantUtc: null },
    subjects: Array.from({ length: CHART_DESCRIPTORS[type].route === 'personal' ? 1 : 2 }, (_, index) => ({ role: index ? 'secondary' : 'primary' })) as NormalizedChartResult['subjects'],
    houses: Array.from({ length: 12 }, (_, index) => ({ index: index + 1, id: `house:${index + 1}` })) as NormalizedChartResult['houses'],
    angles: {}, rings, aspects: [], distributions: { elements: { fire: 0, earth: 0, air: 0, water: 0 }, modalities: { cardinal: 0, fixed: 0, mutable: 0 } },
  } as NormalizedChartResult;
}

describe('validateChartResultForRequest', () => {
  test.each(CHART_TYPES)('defines and accepts the production shape for %s', (type) => {
    expect(EXPECTED_RINGS_BY_CHART_TYPE[type].map(({ id, role }) => [id, role])).toEqual(expectedRings[type]);
    const value = result(type);
    expect(validateChartResultForRequest(value, request(type))).toBe(value);
  });

  test.each([
    ['type', 'synastry', (value: NormalizedChartResult) => { value.meta.type = 'natal'; }],
    ['house system', 'natal', (value: NormalizedChartResult) => { value.meta.settings.houseSystem = 'whole-sign'; }],
    ['zodiac', 'natal', (value: NormalizedChartResult) => { value.meta.settings.zodiac = 'sidereal'; }],
    ['subject count', 'synastry', (value: NormalizedChartResult) => { value.subjects.pop(); }],
    ['ring count', 'transit', (value: NormalizedChartResult) => { value.rings.pop(); }],
    ['ring role', 'synastry', (value: NormalizedChartResult) => { value.rings[1].role = 'primary'; }],
    ['missing house', 'natal', (value: NormalizedChartResult) => { value.houses.splice(5, 1); }],
  ] as const)('rejects a structurally valid result with wrong %s', (_label, type, mutate) => {
    const value = result(type);
    mutate(value);
    expect(() => validateChartResultForRequest(value, request(type))).toThrow(/request/i);
  });
});
