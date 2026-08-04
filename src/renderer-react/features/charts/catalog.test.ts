import { describe, expect, test } from 'vitest';
import type {
  AspectLevel,
  AspectIdentity,
  ChartAngle,
  ChartAspect,
  ChartCatalogDefinition,
  ChartDescriptor,
  ChartHouse,
  ChartIdentity,
  ChartMeta,
  ChartOptions,
  ChartPoint,
  ChartReferenceData,
  ChartRing,
  ChartRoute,
  ChartType,
  HouseIdentity,
  NormalizedChartResult,
  PointIdentity,
  RingIdentity,
} from './contracts';
import {
  assertCatalogMatchesDescriptors,
  CHART_DESCRIPTORS,
  CHART_TYPES,
  PERSONAL_CHART_TYPES,
  RELATIONSHIP_CHART_TYPES,
} from './catalog';

const RELOCATION_OPTIONS = {
  latitude: 31.23,
  longitude: 121.47,
  locationLabel: 'Shanghai',
} satisfies ChartOptions;
void RELOCATION_OPTIONS;

const RING_IDENTITY = 'ring:natal' satisfies ChartIdentity;
const POINT_IDENTITY = 'natal:sun' satisfies ChartIdentity;
const HOUSE_IDENTITY = 'house:1' satisfies ChartIdentity;
const ASPECT_IDENTITY = 'aspect:natal:sun:conjunction:transit:moon' satisfies AspectIdentity;
const NULL_POINT_HOUSE = null satisfies ChartPoint['house'];
const NULL_CHART_INSTANT = null satisfies ChartMeta['instantUtc'];
const STRUCTURED_DMS = { degrees: 12, minutes: 34, seconds: 56 } satisfies ChartPoint['dms'];
const STRUCTURED_ANGLE_DMS = STRUCTURED_DMS satisfies ChartAngle['dms'];
const RESULT_ID = 'result-1' satisfies NormalizedChartResult['resultId'];
const RESULT_IDENTITIES = [
  RING_IDENTITY,
  POINT_IDENTITY,
  HOUSE_IDENTITY,
  ASPECT_IDENTITY,
] satisfies NormalizedChartResult['identities'];
const CHART_RING_IDENTITY = RING_IDENTITY satisfies ChartRing['identity'];
type SameType<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
const RING_IDENTITY_IS_EXACT = true satisfies SameType<ChartRing['identity'], RingIdentity>;
const POINT_IDENTITY_IS_EXACT = true satisfies SameType<ChartPoint['id'], PointIdentity>;
const HOUSE_IDENTITY_IS_EXACT = true satisfies SameType<ChartHouse['id'], HouseIdentity>;
const ASPECT_IDENTITY_IS_EXACT = true satisfies SameType<ChartAspect['id'], AspectIdentity>;
type ReferenceAspect = ChartReferenceData['aspects'][string];
type ReferenceSign = ChartReferenceData['signs'][number];
type ReferencePoint = ChartReferenceData['points'][string];
type ReferenceHouseSystem = ChartReferenceData['houseSystems'][number];
const CATALOG_TYPE_IS_EXACT = true satisfies SameType<ChartCatalogDefinition['type'], ChartType>;
const REFERENCE_ASPECT_LEVEL_IS_EXACT = true satisfies SameType<ReferenceAspect['level'], AspectLevel>;
const REFERENCE_ASPECT_ORB_IS_EXACT = true satisfies SameType<ReferenceAspect['defaultOrb'], number>;
const REFERENCE_SIGN_KEY_IS_EXACT = true satisfies SameType<ReferenceSign['key'], string>;
const REFERENCE_POINT_KIND_IS_EXACT = true satisfies SameType<ReferencePoint['kind'], 'body' | 'point' | 'angle'>;
const REFERENCE_HOUSE_SYSTEM_IS_EXACT = true satisfies SameType<
  ReferenceHouseSystem,
  { value: string; nameEn: string; nameZh: string }
>;
const REFERENCE_ASPECT_IS_EXACT = true satisfies SameType<ReferenceAspect, {
  level: AspectLevel;
  defaultOrb: number;
  nameEn: string;
  nameZh: string;
  angle: number;
  glyph: string;
}>;
void [
  NULL_POINT_HOUSE,
  NULL_CHART_INSTANT,
  STRUCTURED_DMS,
  STRUCTURED_ANGLE_DMS,
  RESULT_ID,
  RESULT_IDENTITIES,
  CHART_RING_IDENTITY,
  RING_IDENTITY_IS_EXACT,
  POINT_IDENTITY_IS_EXACT,
  HOUSE_IDENTITY_IS_EXACT,
  ASPECT_IDENTITY_IS_EXACT,
  CATALOG_TYPE_IS_EXACT,
  REFERENCE_ASPECT_LEVEL_IS_EXACT,
  REFERENCE_ASPECT_ORB_IS_EXACT,
  REFERENCE_SIGN_KEY_IS_EXACT,
  REFERENCE_POINT_KIND_IS_EXACT,
  REFERENCE_HOUSE_SYSTEM_IS_EXACT,
  REFERENCE_ASPECT_IS_EXACT,
];

const EXPECTED_DESCRIPTORS = [
  { type: 'natal', route: 'personal', requiresSecondary: false, serviceOptions: [], controls: [] },
  { type: 'transit', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'tertiaryProgressed', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'progressed', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'lunarReturn', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'solarReturn', route: 'personal', requiresSecondary: false, serviceOptions: ['year'], controls: ['returnYear'] },
  { type: 'solarArc', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'firdaria', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'profection', route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  { type: 'relocation', route: 'personal', requiresSecondary: false, serviceOptions: ['location'], controls: ['relocationPlace'] },
  { type: 'synastry', route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  { type: 'composite', route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  { type: 'marx', route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  { type: 'davison', route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  { type: 'compositeSecondary', route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  { type: 'compositeTertiary', route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  { type: 'marxSecondary', route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  { type: 'marxTertiary', route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  { type: 'davisonSecondary', route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  { type: 'davisonTertiary', route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
] as const satisfies readonly (ChartDescriptor & { type: ChartType })[];

const SERVICE_CATALOG = EXPECTED_DESCRIPTORS.map(({ type, route, requiresSecondary, serviceOptions }) => ({
  type,
  nameZh: type,
  nameEn: type,
  category: route,
  requiresSecondary,
  options: [...serviceOptions],
})) satisfies ChartCatalogDefinition[];

describe('chart catalog descriptors', () => {
  test('defines all 20 chart tokens in service order without extras', () => {
    expect(CHART_TYPES).toEqual(EXPECTED_DESCRIPTORS.map(({ type }) => type));
    expect(CHART_TYPES).toHaveLength(20);
    expect(Object.keys(CHART_DESCRIPTORS)).toEqual(CHART_TYPES);
  });

  test.each(EXPECTED_DESCRIPTORS)('maps $type to its exact route, options, and controls', ({ type, ...expected }) => {
    expect(CHART_DESCRIPTORS[type]).toEqual(expected);
  });

  test('exports route-specific chart tokens in catalog order', () => {
    expect(PERSONAL_CHART_TYPES).toEqual(EXPECTED_DESCRIPTORS
      .filter(({ route }) => route === 'personal')
      .map(({ type }) => type));
    expect(RELATIONSHIP_CHART_TYPES).toEqual(EXPECTED_DESCRIPTORS
      .filter(({ route }) => route === 'relationship')
      .map(({ type }) => type));
  });
});

describe('assertCatalogMatchesDescriptors', () => {
  test('accepts the matching service catalog', () => {
    expect(() => assertCatalogMatchesDescriptors(SERVICE_CATALOG)).not.toThrow();
  });

  test('rejects unknown and missing chart tokens with stable messages', () => {
    const unknown: ChartCatalogDefinition[] = SERVICE_CATALOG.map((entry) => ({ ...entry }));
    unknown[0] = { ...unknown[0], type: 'unknownChart' } as unknown as ChartCatalogDefinition;

    expect(() => assertCatalogMatchesDescriptors(unknown)).toThrow(
      'Unknown chart type in service catalog: unknownChart',
    );
    expect(() => assertCatalogMatchesDescriptors(SERVICE_CATALOG.slice(0, -1))).toThrow(
      'Chart catalog count mismatch: expected 20, received 19',
    );
  });

  test('rejects an extra known chart through the count branch', () => {
    const extra = [...SERVICE_CATALOG, { ...SERVICE_CATALOG[0] }];

    expect(() => assertCatalogMatchesDescriptors(extra)).toThrow(
      'Chart catalog count mismatch: expected 20, received 21',
    );
  });

  test('rejects service catalog order mismatches with the failing index', () => {
    const reordered = SERVICE_CATALOG.map((entry) => ({ ...entry }));
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];

    expect(() => assertCatalogMatchesDescriptors(reordered)).toThrow(
      'Chart catalog order mismatch at index 0: expected natal, received transit',
    );
  });

  test.each([
    ['route', { category: 'relationship' }, 'Chart route mismatch for natal: expected personal, received relationship'],
    ['requiresSecondary', { requiresSecondary: true }, 'Chart requiresSecondary mismatch for natal: expected false, received true'],
    ['service options', { options: ['year', 'targetDate'] }, 'Chart service options mismatch for natal: expected [], received [year, targetDate]'],
  ] as const)('rejects a %s mismatch', (_label, replacement, message) => {
    const catalog: ChartCatalogDefinition[] = SERVICE_CATALOG.map((entry) => ({ ...entry }));
    catalog[0] = { ...catalog[0], ...replacement } as ChartCatalogDefinition;

    expect(() => assertCatalogMatchesDescriptors(catalog)).toThrow(message);
  });
});
