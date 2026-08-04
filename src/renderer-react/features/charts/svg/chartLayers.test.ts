import { describe, expect, test } from 'vitest';
import { createLegacySvg } from './legacyGeometry';
import { chartReference, twoRingResult } from './chartTestFixtures';
import { applyLayers, defaultLayers, isIdentityVisible } from './chartLayers';

describe('chart layers', () => {
  test('defaults major houses labels and every result ring on with minor off', () => {
    expect(defaultLayers(twoRingResult)).toEqual({
      majorAspects: true, minorAspects: false, houses: true, labels: true,
      rings: { natal: true, transit: true },
    });
  });

  test('couples ring and reference-level aspect visibility without changing identity', () => {
    const result = structuredClone(twoRingResult);
    result.aspects.push({ ...result.aspects[0], id: 'aspect:natal:sun:semisquare:transit:saturn', aspectKey: 'semisquare', ringA: 'natal', point1: 'sun', ringB: 'transit', point2: 'saturn', level: 'major' });
    result.identities.push(result.aspects[1].id);
    const layers = { ...defaultLayers(result), minorAspects: true, rings: { natal: true, transit: false } };
    expect(isIdentityVisible('natal:sun', result, chartReference, layers)).toBe(true);
    expect(isIdentityVisible('transit:saturn', result, chartReference, layers)).toBe(false);
    expect(isIdentityVisible(result.aspects[0].id, result, chartReference, layers)).toBe(true);
    expect(isIdentityVisible(result.aspects[1].id, result, chartReference, layers)).toBe(false);
    expect(isIdentityVisible('house:1', result, chartReference, layers)).toBe(true);
  });

  test('applies house and label hooks without hiding point glyphs or dots', () => {
    const parsed = createLegacySvg(twoRingResult, chartReference).document;
    const svg = parsed.documentElement as unknown as SVGSVGElement;
    applyLayers(svg, twoRingResult, chartReference, {
      ...defaultLayers(twoRingResult), houses: false, labels: false,
    });
    expect(svg.querySelector('[data-chart-kind="house"]')?.hasAttribute('hidden')).toBe(true);
    expect(svg.querySelector('[data-chart-part="angle"]')?.hasAttribute('hidden')).toBe(true);
    expect(svg.querySelector('[data-chart-part="label"]')?.hasAttribute('hidden')).toBe(true);
    expect(svg.querySelector('[data-chart-part="leader"]')?.hasAttribute('hidden')).toBe(true);
    expect(svg.querySelector('[data-chart-part="glyph"]')?.hasAttribute('hidden')).toBe(false);
    expect(svg.querySelector('[data-chart-part="dot"]')?.hasAttribute('hidden')).toBe(false);
  });
});
