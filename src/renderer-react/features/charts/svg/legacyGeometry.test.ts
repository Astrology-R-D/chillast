import { describe, expect, test } from 'vitest';
import { createLegacySvg } from './legacyGeometry';
import { spreadAngles } from '../../../../renderer/app/components/ChartWheel.js';
import { chartReference, point, twoRingResult } from './chartTestFixtures';

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
