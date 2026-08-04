import { describe, expect, test } from 'vitest';
import { CHART_DESCRIPTORS } from './catalog';
import { normalizeChartResult } from './normalizeChartResult';
import {
  chartRequestSchema,
  parseChartReferenceData,
  parseChartRequest,
} from './schemas';
import type { ChartReferenceData } from './contracts';

function profile(id: string) {
  return {
    id,
    nameZh: id,
    nameEn: id,
    gender: 'other' as const,
    birthData: {
      year: 1990,
      month: 1,
      day: 2,
      hour: 3,
      minute: 4,
      location: { label: 'Shanghai', latitude: 31.23, longitude: 121.47 },
    },
    notes: '',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function catalog() {
  return Object.entries(CHART_DESCRIPTORS).map(([type, descriptor]) => ({
    type,
    nameZh: type,
    nameEn: type,
    category: descriptor.route,
    requiresSecondary: descriptor.requiresSecondary,
    options: [...descriptor.serviceOptions],
  }));
}

function reference(): ChartReferenceData {
  return parseChartReferenceData({
    signs: [{ key: 'aries', nameEn: 'Aries', nameZh: 'Aries', shortZh: 'A', glyph: 'A', element: 'fire', modality: 'cardinal', ruler: 'mars' }],
    points: { sun: { nameEn: 'Sun', nameZh: 'Sun', glyph: 'S', kind: 'body' } },
    aspects: { conjunction: { nameEn: 'Conjunction', nameZh: 'Conjunction', angle: 0, defaultOrb: 8, level: 'major', glyph: 'C' } },
    elements: { fire: { nameEn: 'Fire', nameZh: 'Fire', token: 'fire' } },
    modalities: { cardinal: { nameEn: 'Cardinal', nameZh: 'Cardinal' } },
    houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: 'Placidus' }],
    chartTypes: catalog(),
  });
}

const dms = { degrees: 10, minutes: 0, seconds: 0 };

function point(key: string, longitude = 10) {
  return {
    key,
    kind: 'body',
    glyph: key,
    nameEn: key,
    nameZh: key,
    longitude,
    signKey: 'aries',
    signGlyph: 'A',
    signNameZh: 'Aries',
    signIndex: 0,
    degreeInSign: 10,
    dms,
    retrograde: false,
    house: 1,
  };
}

function ring(id: string, points = [point('sun')]) {
  return { id, role: 'primary', label: id, points };
}

function house(index: number) {
  return { index, cuspLongitude: 0, signKey: 'aries', signGlyph: 'A', signNameZh: 'Aries', degreeInSign: 0 };
}

function aspect(point1 = 'sun', aspectKey = 'conjunction', point2 = 'moon') {
  return {
    point1,
    point2,
    aspectKey,
    glyph: 'C',
    nameZh: aspectKey,
    nameEn: aspectKey,
    level: 'major',
    exactAngle: 0,
    orb: 1,
    orbUsed: 8,
    strength: 0.9,
    separation: 1,
  };
}

function rawResult(patch: Record<string, unknown> = {}) {
  return {
    meta: {
      type: 'natal',
      typeNameZh: 'Natal',
      title: 'Natal',
      subtitle: 'Natal',
      settings: { houseSystem: 'placidus', zodiac: 'tropical' },
      generatedAt: '2026-01-01T00:00:00.000Z',
      instantUtc: '2000-01-01T00:00:00.000Z',
      strategyData: { retained: true },
    },
    subjects: [{ role: 'primary', nameZh: 'A', nameEn: 'A', gender: 'other', birthLabel: '2000', location: { label: 'Shanghai', latitude: 31.23, longitude: 121.47 } }],
    houses: [house(1)],
    angles: {
      ascendant: { key: 'ascendant', glyph: 'Asc', nameZh: 'Asc', longitude: 0, signKey: 'aries', signGlyph: 'A', signIndex: 0, degreeInSign: 0, dms: { degrees: 0, minutes: 0, seconds: 0 } },
    },
    rings: [ring('natal', [point('sun'), point('moon', 11)])],
    aspects: [aspect()],
    distributions: { elements: { fire: 2 }, modalities: { cardinal: 2 } },
    ...patch,
  };
}

function request(patch: Record<string, unknown> = {}) {
  return {
    type: 'natal',
    primary: profile('primary'),
    settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: ['conjunction'], orbOverrides: { conjunction: 8 } } },
    options: {},
    ...patch,
  };
}

describe('chart request and reference schemas', () => {
  test('accepts a declared request against parsed reference data', () => {
    expect(parseChartRequest(request(), reference()).type).toBe('natal');
  });

  test.each([
    request({ type: 'unknown' }),
    request({ type: 'synastry', secondary: profile('primary') }),
    request({ options: { undeclared: true } }),
    request({ settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: ['conjunction'], orbOverrides: { conjunction: 0.09 } } } }),
    request({ settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: ['conjunction'], orbOverrides: { conjunction: 15.01 } } } }),
  ])('rejects malformed structural request %#', (value) => {
    expect(chartRequestSchema.safeParse(value).success).toBe(false);
  });

  test.each([
    request({ settings: { houseSystem: 'unknown', zodiac: 'tropical', aspects: { enabled: ['conjunction'], orbOverrides: {} } } }),
    request({ settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: ['unknown'], orbOverrides: {} } } }),
    request({ type: 'transit', options: { targetDate: 'not-an-instant' } }),
    request({ type: 'relocation', options: { latitude: 91, longitude: 0, locationLabel: 'X' } }),
    request({ type: 'relocation', options: { latitude: 1, longitude: 2 } }),
    request({ type: 'relocation', options: { longitude: 2, locationLabel: 'X' } }),
    request({ type: 'relocation', options: { latitude: 1, locationLabel: 'X' } }),
    request({ type: 'relocation', options: { latitude: 1, longitude: 2, locationLabel: '   ' } }),
  ])('rejects a request incompatible with reference or option constraints %#', (value) => {
    expect(() => parseChartRequest(value, reference())).toThrow('Chart request validation failed');
  });

  test('rejects unknown keys at nested reference boundaries', () => {
    const value = { ...reference(), houseSystems: [{ value: 'placidus', nameEn: 'P', nameZh: 'P', extra: true }] };
    expect(() => parseChartReferenceData(value)).toThrow('Chart reference validation failed');
  });
});

describe('normalizeChartResult', () => {
  test('parses finite chart data and creates deterministic ring-qualified identities', () => {
    const result = normalizeChartResult(rawResult({
      rings: [ring('natal', [point('sun')]), ring('transit', [point('moon', 90)])],
      aspects: [aspect('sun', 'conjunction', 'moon')],
    }));

    expect(result.resultId).toBe('natal:2026-01-01T00:00:00.000Z:natal+transit');
    expect(result.rings.flatMap((value) => value.points.map(({ id }) => id))).toEqual(['natal:sun', 'transit:moon']);
    expect(result.houses[0].id).toBe('house:1');
    expect(result.aspects[0].id).toBe('aspect:natal:sun:conjunction:transit:moon');
    expect(result.identities).toEqual([
      'ring:natal', 'ring:transit', 'natal:sun', 'transit:moon', 'house:1',
      'aspect:natal:sun:conjunction:transit:moon',
    ]);
    expect(result.meta.strategyData).toEqual({ retained: true });
  });

  test.each([
    ['ring', { rings: [ring('same'), ring('same')] }],
    ['point', { rings: [ring('natal', [point('sun'), point('sun')])] }],
    ['house', { houses: [house(1), house(1)] }],
    ['aspect', { aspects: [aspect(), aspect()] }],
  ])('rejects duplicate %s identities', (_name, patch) => {
    expect(() => normalizeChartResult(rawResult(patch))).toThrow('Duplicate');
  });

  test.each([Number.NaN, Infinity, Number.NEGATIVE_INFINITY])('rejects non-finite numeric values: %s', (longitude) => {
    expect(() => normalizeChartResult(rawResult({ rings: [ring('natal', [point('sun', longitude)])] })))
      .toThrow('Chart response validation failed');
  });

  test('rejects absent and wrong-ring aspect endpoints', () => {
    expect(() => normalizeChartResult(rawResult({ aspects: [aspect('missing')] }))).toThrow('Aspect endpoint missing: missing');
    expect(() => normalizeChartResult(rawResult({
      rings: [ring('a', [point('sun')]), ring('b', [point('moon')])],
      aspects: [aspect('moon', 'conjunction', 'sun')],
    }))).toThrow('Aspect endpoint missing: moon');
  });

  test('sorts intra-ring aspect endpoints and rejects more than two rings', () => {
    const result = normalizeChartResult(rawResult({ aspects: [aspect('sun', 'conjunction', 'moon')] }));
    expect(result.aspects[0].id).toBe('aspect:natal:moon:conjunction:natal:sun');
    expect(() => normalizeChartResult(rawResult({ rings: [ring('a'), ring('b'), ring('c')] })))
      .toThrow('Chart response has more than two rings');
  });
});
