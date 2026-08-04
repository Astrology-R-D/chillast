import type { ChartTransform } from '../../../stores/chartWorkspace';

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;
export const RESET_TRANSFORM: ChartTransform = Object.freeze({ scale: 1, x: 0, y: 0 });
const MAX_OFFSET = 740 * MAX_SCALE;

export interface SvgBounds { x: number; y: number; width: number; height: number }

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const finiteTransform = (transform: ChartTransform) =>
  [transform.scale, transform.x, transform.y].every(Number.isFinite);

export function zoomAt(transform: ChartTransform, factor: number, anchor: { x: number; y: number }): ChartTransform {
  if (!finiteTransform(transform) || !Number.isFinite(factor) || factor <= 0 || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return { ...RESET_TRANSFORM };
  }
  const scale = clamp(transform.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = scale / transform.scale;
  return {
    scale,
    x: clamp(anchor.x - (anchor.x - transform.x) * ratio, -MAX_OFFSET, MAX_OFFSET),
    y: clamp(anchor.y - (anchor.y - transform.y) * ratio, -MAX_OFFSET, MAX_OFFSET),
  };
}

export function panBy(transform: ChartTransform, dx: number, dy: number): ChartTransform {
  if (!finiteTransform(transform) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { ...RESET_TRANSFORM };
  return { ...transform, x: clamp(transform.x + dx, -MAX_OFFSET, MAX_OFFSET), y: clamp(transform.y + dy, -MAX_OFFSET, MAX_OFFSET) };
}

export function visibleBounds(svg: SVGSVGElement): SvgBounds | null {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const node of svg.querySelectorAll<SVGGraphicsElement>('[data-chart-identity]')) {
    if (node.hasAttribute('hidden') || node.closest('[hidden]') || typeof node.getBBox !== 'function') continue;
    try {
      const box = node.getBBox();
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) continue;
      left = Math.min(left, box.x); top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
    } catch { /* detached SVG nodes can reject geometry reads */ }
  }
  return Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

export function fitBounds(bounds: SvgBounds | null, viewport: { width: number; height: number }, padding = 24): ChartTransform {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height, viewport.width, viewport.height, padding].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0 || viewport.width <= 0 || viewport.height <= 0 || padding < 0) return { ...RESET_TRANSFORM };
  const padded = { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
  const scale = clamp(Math.min(viewport.width / padded.width, viewport.height / padded.height), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: viewport.width / 2 - (padded.x + padded.width / 2) * scale,
    y: viewport.height / 2 - (padded.y + padded.height / 2) * scale,
  };
}
