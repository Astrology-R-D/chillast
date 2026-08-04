import { describe, expect, test, vi } from 'vitest';
import type { CitySearchResult, Profile } from '../../../api/contracts';
import { CHART_DESCRIPTORS } from '../catalog';
import { CHART_TYPES, type ChartReferenceData, type ChartRoute, type ChartType } from '../contracts';
import {
  DEFAULT_ASPECTS,
  buildSubmittedSnapshot,
  controlsFor,
  createDefaultDraft,
  structurallyEqual,
  validateChartDraft,
  type ChartDraft,
  type DraftEnvironment,
} from './chartDraft';

function profile(id: string, latitude = 39.9042, longitude = 116.4074): Profile {
  return {
    id, nameZh: id, nameEn: id, gender: 'other', notes: '', tags: [],
    birthData: { year: 2000, month: 1, day: 2, hour: 3, minute: 4, location: { label: `${id} city`, latitude, longitude } },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const aspects = Object.fromEntries(DEFAULT_ASPECTS.map((key) => [key, {
  nameEn: key, nameZh: key, angle: 0, defaultOrb: 5, level: 'major' as const, glyph: key,
}]));
const reference = {
  aspects,
  houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: '普拉西德' }],
  chartTypes: CHART_TYPES.map((type) => ({
    type, nameZh: type, nameEn: type, category: CHART_DESCRIPTORS[type].route,
    requiresSecondary: CHART_DESCRIPTORS[type].requiresSecondary,
    options: [...CHART_DESCRIPTORS[type].serviceOptions],
  })),
  signs: [], points: {}, elements: {} as ChartReferenceData['elements'],
  modalities: {} as ChartReferenceData['modalities'],
} satisfies ChartReferenceData;

function environment(overrides: Partial<DraftEnvironment> = {}): DraftEnvironment {
  return {
    now: new Date(2026, 7, 2, 12, 34),
    profiles: [profile('p1'), profile('p2')],
    reference,
    persistedPrimaryId: 'p1',
    recentSecondaryIds: ['p2'],
    toInstant: (local) => `${local}:00.000Z`,
    ...overrides,
  };
}

function draftFor(type: ChartType): ChartDraft {
  const route = CHART_DESCRIPTORS[type].route;
  return { ...createDefaultDraft(route, environment()), type };
}

describe('chart draft mapping', () => {
  test.each(CHART_TYPES)('maps %s controls and only declared service options', (type) => {
    const descriptor = CHART_DESCRIPTORS[type];
    const draft = draftFor(type);
    const submitted = buildSubmittedSnapshot(draft, environment());
    const expectedOptions: Record<string, unknown> = {};
    if (descriptor.serviceOptions.some((option) => option === 'targetDate')) expectedOptions.targetDate = '2026-08-02T12:34:00.000Z';
    if (descriptor.serviceOptions.some((option) => option === 'year')) expectedOptions.year = 2026;
    if (descriptor.serviceOptions.some((option) => option === 'location')) Object.assign(expectedOptions, {
      latitude: 39.9042, longitude: 116.4074, locationLabel: 'p1 city',
    });

    expect(controlsFor(type)).toEqual(descriptor.controls);
    expect(submitted).toEqual({
      route: descriptor.route,
      type,
      primaryProfileId: 'p1',
      secondaryProfileId: descriptor.requiresSecondary ? 'p2' : null,
      request: {
        type,
        primary: environment().profiles[0],
        ...(descriptor.requiresSecondary ? { secondary: environment().profiles[1] } : {}),
        settings: {
          houseSystem: 'placidus', zodiac: 'tropical',
          aspects: { enabled: DEFAULT_ASPECTS, orbOverrides: {} },
        },
        options: expectedOptions,
      },
    });
    expect(Object.isFrozen(submitted)).toBe(true);
    expect(Object.isFrozen(submitted.request.settings.aspects.enabled)).toBe(true);
  });

  test('uses injected local instant conversion exactly once', () => {
    const toInstant = vi.fn(() => '2026-08-02T04:34:00.000Z');
    const submitted = buildSubmittedSnapshot(draftFor('transit'), environment({ toInstant }));
    expect(toInstant).toHaveBeenCalledWith('2026-08-02T12:34');
    expect(submitted.request.options.targetDate).toBe('2026-08-02T04:34:00.000Z');
  });

  test.each([[1, true], [3000, true], [0, false], [3001, false], [1.5, false]])(
    'validates return year %s', (returnYear, valid) => {
      expect(validateChartDraft({ ...draftFor('solarReturn'), returnYear }, environment()).valid).toBe(valid);
    },
  );

  test.each([
    [-90, -180, true], [90, 180, true], [-90.1, 0, false], [0, 180.1, false],
  ])('validates relocation coordinates %s/%s', (latitude, longitude, valid) => {
    const relocationPlace = { ...draftFor('relocation').relocationPlace!, latitude, longitude };
    expect(validateChartDraft({ ...draftFor('relocation'), relocationPlace }, environment()).valid).toBe(valid);
  });

  test('rejects unresolved relocation and same relationship profile', () => {
    expect(validateChartDraft({ ...draftFor('relocation'), relocationPlace: null }, environment()).fieldErrors.relocationPlace)
      .toBeTruthy();
    expect(validateChartDraft({ ...draftFor('synastry'), secondaryProfileId: 'p1' }, environment()).fieldErrors.secondaryProfileId)
      .toBeTruthy();
  });

  test('rejects unknown house, zodiac, aspect, and orb values outside inclusive bounds', () => {
    expect(validateChartDraft({ ...draftFor('natal'), houseSystem: 'unknown' }, environment()).valid).toBe(false);
    expect(validateChartDraft({ ...draftFor('natal'), zodiac: 'unknown' as 'tropical' }, environment()).valid).toBe(false);
    expect(validateChartDraft({ ...draftFor('natal'), enabledAspects: ['unknown'] }, environment()).valid).toBe(false);
    expect(validateChartDraft({ ...draftFor('natal'), orbOverrides: { conjunction: 0.1, opposition: 15 } }, environment()).valid).toBe(true);
    expect(validateChartDraft({ ...draftFor('natal'), orbOverrides: { conjunction: 0.09 } }, environment()).valid).toBe(false);
    expect(validateChartDraft({ ...draftFor('natal'), orbOverrides: { conjunction: 15.01 } }, environment()).valid).toBe(false);
  });

  test('chooses deterministic profile fallbacks and birth-location relocation defaults', () => {
    const env = environment({ persistedPrimaryId: 'deleted', recentSecondaryIds: ['deleted', 'p2'] });
    const personal = createDefaultDraft('personal', env);
    const relationship = createDefaultDraft('relationship', env);
    expect(personal).toMatchObject({ type: 'natal', primaryProfileId: 'p1', targetLocal: '2026-08-02T12:34', returnYear: 2026 });
    expect(personal.relocationPlace).toEqual(expect.objectContaining({
      key: '39.904200:116.407400', label: 'p1 city', latitude: 39.9042, longitude: 116.4074, source: 'western',
    }));
    expect(relationship).toMatchObject({ type: 'synastry', primaryProfileId: 'p1', secondaryProfileId: 'p2' });
  });

  test('prefers the actual placidus value and otherwise uses the first valid house system', () => {
    const systems = [
      { value: 'whole-sign', nameEn: 'Whole Sign', nameZh: '整宫制' },
      { value: 'Placidus', nameEn: 'Placidus', nameZh: '普拉西德' },
    ];
    expect(createDefaultDraft('personal', environment({ reference: { ...reference, houseSystems: systems } })).houseSystem).toBe('Placidus');
    expect(createDefaultDraft('personal', environment({ reference: { ...reference, houseSystems: systems.slice(0, 1) } })).houseSystem).toBe('whole-sign');
  });

  test('returns stable validation codes instead of localized messages', () => {
    const validation = validateChartDraft({
      ...draftFor('relocation'), primaryProfileId: null, houseSystem: 'bad', relocationPlace: null,
    }, environment());
    expect(validation.fieldErrors).toMatchObject({
      primaryProfileId: 'errorPrimaryProfile', houseSystem: 'errorHouseSystem', relocationPlace: 'errorRelocation',
    });
  });

  test('compares sorted object keys but preserves array order', () => {
    expect(structurallyEqual({ b: 2, a: [1, 2] }, { a: [1, 2], b: 2 })).toBe(true);
    expect(structurallyEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });

  test('rejects route/type mismatch and invalid target local time', () => {
    expect(validateChartDraft({ ...draftFor('natal'), route: 'relationship' as ChartRoute }, environment()).valid).toBe(false);
    expect(validateChartDraft({ ...draftFor('transit'), targetLocal: 'not-a-date' }, environment()).valid).toBe(false);
  });
});
