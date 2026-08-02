import { describe, expect, test } from 'vitest';
import type {
  ChartCatalogDefinition,
  ChartDescriptor,
  ChartOptions,
  ChartRoute,
  ChartType,
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
    unknown[0] = { ...unknown[0], type: 'unknownChart' };

    expect(() => assertCatalogMatchesDescriptors(unknown)).toThrow(
      'Unknown chart type in service catalog: unknownChart',
    );
    expect(() => assertCatalogMatchesDescriptors(SERVICE_CATALOG.slice(0, -1))).toThrow(
      'Chart catalog count mismatch: expected 20, received 19',
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
