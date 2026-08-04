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

  test('unions only visible nonzero geometry and fits it with 24 units padding', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const boxes = [
      { x: 10, y: 20, width: 100, height: 80 },
      { x: 200, y: 100, width: 50, height: 50 },
      { x: 0, y: 0, width: 0, height: 0 },
    ];
    boxes.forEach((box, index) => {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.dataset.chartIdentity = `ring:${index}`;
      Object.defineProperty(group, 'getBBox', { value: vi.fn(() => box) });
      if (index === 2) group.setAttribute('hidden', '');
      svg.append(group);
    });
    const bounds = visibleBounds(svg);
    expect(bounds).toEqual({ x: 10, y: 20, width: 240, height: 130 });
    const fitted = fitBounds(bounds, { width: 740, height: 740 });
    const padded = { x: -14, y: -4, width: 288, height: 178 };
    expect(fitted.scale).toBeCloseTo(740 / padded.width);
    expect(fitted.x + padded.x * fitted.scale).toBeCloseTo(0);
    expect(fitted.y + padded.y * fitted.scale).toBeCloseTo((740 - padded.height * fitted.scale) / 2);
    expect(fitBounds(null, { width: 740, height: 740 })).toEqual(RESET_TRANSFORM);
  });
});
