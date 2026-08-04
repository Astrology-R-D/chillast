import { describe, expect, test, vi } from 'vitest';
import { fitBounds, MAX_SCALE, MIN_SCALE, panBy, RESET_TRANSFORM, visibleBounds, zoomAt } from './chartTransform';

describe('chart transform math', () => {
  test('zooms around a stable logical cursor and clamps finite scales', () => {
    const anchor = { x: 370, y: 370 };
    const before = { scale: 1, x: 0, y: 0 };
    const zoomed = zoomAt(before, 2, anchor);
    expect((anchor.x - before.x) / before.scale).toBe((anchor.x - zoomed.x) / zoomed.scale);
    expect((anchor.y - before.y) / before.scale).toBe((anchor.y - zoomed.y) / zoomed.scale);
    expect(zoomAt(before, 100, anchor).scale).toBe(MAX_SCALE);
    expect(zoomAt(before, 0.001, anchor).scale).toBe(MIN_SCALE);
    expect(zoomAt(before, Number.NaN, anchor)).toEqual(RESET_TRANSFORM);
  });

  test('pans in bounded finite SVG units and exposes an immutable reset', () => {
    expect(panBy({ scale: 2, x: 3, y: 4 }, 16, -48)).toEqual({ scale: 2, x: 19, y: -44 });
    const bounded = panBy({ scale: 1, x: 0, y: 0 }, Number.MAX_VALUE, Number.MAX_VALUE);
    expect(Number.isFinite(bounded.x) && Number.isFinite(bounded.y)).toBe(true);
    expect(RESET_TRANSFORM).toEqual({ scale: 1, x: 0, y: 0 });
  });

  test('uses actual geometry-root bboxes, excluding hidden, zero, export, and control geometry', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const boxes = [
      { x: 10, y: 8, width: 720, height: 724 },
      { x: -1000, y: -1000, width: 3000, height: 3000 },
      { x: 0, y: 0, width: 0, height: 0 },
      { x: -500, y: -500, width: 2000, height: 2000 },
      { x: -250, y: -250, width: 1000, height: 1000 },
    ];
    const getBoxes = boxes.map((box) => vi.fn(() => box));
    boxes.forEach((_box, index) => {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.dataset.chartGeometry = '';
      Object.defineProperty(group, 'getBBox', { value: getBoxes[index] });
      if (index === 1) group.setAttribute('hidden', '');
      if (index === 3) group.dataset.exportExclude = 'true';
      if (index === 4) group.dataset.chartControl = '';
      svg.append(group);
    });
    const bounds = visibleBounds(svg);
    expect(bounds).toEqual({ x: 10, y: 8, width: 720, height: 724 });
    if (!bounds) throw new Error('expected visible chart geometry');
    expect(getBoxes.map((getBox) => getBox.mock.calls.length)).toEqual([1, 0, 1, 0, 0]);
    const fitted = fitBounds(bounds, { width: 740, height: 740 });
    const left = fitted.x + bounds.x * fitted.scale;
    const top = fitted.y + bounds.y * fitted.scale;
    const right = fitted.x + (bounds.x + bounds.width) * fitted.scale;
    const bottom = fitted.y + (bounds.y + bounds.height) * fitted.scale;
    expect(fitted.scale).toBeCloseTo(740 / (bounds.height + 48));
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(740);
    expect(bottom).toBeLessThanOrEqual(740);
    expect(top).toBeCloseTo(24 * fitted.scale);
    expect(740 - bottom).toBeCloseTo(24 * fitted.scale);
    expect(fitBounds(null, { width: 740, height: 740 })).toEqual(RESET_TRANSFORM);
  });
});
