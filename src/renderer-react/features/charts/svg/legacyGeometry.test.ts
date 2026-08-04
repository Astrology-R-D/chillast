import { describe, expect, test } from 'vitest';
import type { ChartReferenceData, NormalizedChartResult } from '../contracts';
import { createLegacySvg } from './legacyGeometry';
import { spreadAngles } from '../../../../renderer/app/components/ChartWheel.js';

export const chartReference = {
  signs: Array.from({ length: 12 }, (_, index) => ({
    key: `sign-${index}`, nameEn: `Sign ${index}`, nameZh: `宫${index}`, shortZh: String(index),
    glyph: String(index), element: ['fire', 'earth', 'air', 'water'][index % 4], modality: 'cardinal', ruler: 'sun',
  })),
  points: {
    sun: { nameEn: 'Sun', nameZh: '太阳', glyph: 'S', kind: 'body' },
    moon: { nameEn: 'Moon', nameZh: '月亮', glyph: 'M', kind: 'body' },
    saturn: { nameEn: 'Saturn', nameZh: '土星', glyph: 'T', kind: 'body' },
  },
  aspects: {
    trine: { nameEn: 'Trine', nameZh: '拱', angle: 120, defaultOrb: 8, level: 'major', glyph: '△' },
    semisquare: { nameEn: 'Semisquare', nameZh: '八分相', angle: 45, defaultOrb: 2, level: 'minor', glyph: '∠' },
  },
  elements: {}, modalities: {}, houseSystems: [], chartTypes: [],
} as unknown as ChartReferenceData;

const point = (ringId: string, key: string, longitude: number) => ({
  id: `${ringId}:${key}`, ringId, key, kind: 'body', glyph: key[0].toUpperCase(), nameEn: key,
  nameZh: key, longitude, signKey: 'sign-0', signGlyph: '0', signNameZh: '宫0', signIndex: 0,
  degreeInSign: longitude % 30, dms: { degrees: 0, minutes: 0, seconds: 0 }, retrograde: false, house: 1,
});

export const twoRingResult = {
  resultId: 'fixture',
  identities: [
    'ring:natal', 'natal:sun', 'natal:moon', 'house:1', 'house:2',
    'ring:transit', 'transit:saturn', 'aspect:natal:moon:trine:natal:sun',
  ],
  meta: { type: 'transit', typeNameZh: '行运盘', title: '测试星盘', subtitle: '', settings: { houseSystem: 'placidus', zodiac: 'tropical' }, generatedAt: '2026-08-02T00:00:00.000Z', instantUtc: null },
  subjects: [],
  rings: [
    { id: 'natal', identity: 'ring:natal', role: 'primary', label: '本命', points: [point('natal', 'sun', 10), point('natal', 'moon', 130)] },
    { id: 'transit', identity: 'ring:transit', role: 'transit', label: '行运', points: [point('transit', 'saturn', 250)] },
  ],
  houses: [
    { id: 'house:1', index: 1, cuspLongitude: 0, signKey: 'sign-0', signGlyph: '0', signNameZh: '宫0', degreeInSign: 0 },
    { id: 'house:2', index: 2, cuspLongitude: 180, signKey: 'sign-6', signGlyph: '6', signNameZh: '宫6', degreeInSign: 0 },
  ],
  angles: { ascendant: { key: 'ascendant', glyph: 'A', nameZh: '上升', longitude: 0, signKey: 'sign-0', signGlyph: '0', signIndex: 0, degreeInSign: 0, dms: { degrees: 0, minutes: 0, seconds: 0 } } },
  aspects: [{ id: 'aspect:natal:moon:trine:natal:sun', ringA: 'natal', point1: 'moon', aspectKey: 'trine', ringB: 'natal', point2: 'sun', glyph: '△', nameZh: '拱', nameEn: 'Trine', level: 'major', exactAngle: 120, orb: 0, orbUsed: 8, strength: 1, separation: 120 }],
  distributions: { elements: { fire: 0, earth: 0, air: 0, water: 0 }, modalities: { cardinal: 0, fixed: 0, mutable: 0 } },
} as unknown as NormalizedChartResult;

function geometry(svg: XMLDocument) {
  return {
    viewBox: svg.documentElement.getAttribute('viewBox'),
    paths: [...svg.querySelectorAll('path')].map((node) => node.getAttribute('d')),
    lines: [...svg.querySelectorAll('line')].map((node) => ['x1', 'y1', 'x2', 'y2'].map((name) => node.getAttribute(name))),
    circles: [...svg.querySelectorAll('circle')].map((node) => ['cx', 'cy', 'r'].map((name) => node.getAttribute(name))),
    text: [...svg.querySelectorAll('text')].map((node) => [node.getAttribute('x'), node.getAttribute('y'), node.textContent]),
  };
}

describe('legacy chart geometry adapter', () => {
  test('preserves every legacy geometry value while adding stable identities', () => {
    const adapted = createLegacySvg(twoRingResult, chartReference);
    const identities = [...adapted.document.querySelectorAll('[data-chart-identity]')]
      .map((node) => node.getAttribute('data-chart-identity'));
    expect(identities).toEqual(expect.arrayContaining([
      'ring:natal', 'natal:sun', 'house:1', 'aspect:natal:moon:trine:natal:sun',
      'ring:transit', 'transit:saturn',
    ]));
    expect(geometry(adapted.document)).toMatchSnapshot();
  });

  test('rejects non-finite output and keeps clustered points separately targetable', () => {
    const spread = spreadAngles([359, 0, 1, 2], 11);
    expect(spread).toHaveLength(4);
    expect(spread.every(Number.isFinite)).toBe(true);
    expect(spread.map((_value: number, index: number) => index)).toEqual([0, 1, 2, 3]);
    const clustered = structuredClone(twoRingResult);
    clustered.rings[0].points = [359, 0, 1, 2].map((longitude, index) => point('natal', `cluster-${index}`, longitude)) as typeof clustered.rings[0]['points'];
    clustered.identities = clustered.rings[0].points.map(({ id }) => id);
    const { markup, document } = createLegacySvg(clustered, chartReference);
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
    expect(document.querySelectorAll('[data-ring-id="natal"] > [data-chart-kind="point"]')).toHaveLength(4);
  });
});
