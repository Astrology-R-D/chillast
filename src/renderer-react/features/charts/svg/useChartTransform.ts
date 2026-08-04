import { useEffect, useRef } from 'react';
import type { ChartTransform } from '../../../stores/chartWorkspace';
import { panBy, zoomAt } from './chartTransform';

interface Options {
  svg: SVGSVGElement | null;
  transform: ChartTransform;
  onChange(transform: ChartTransform): void;
}

function localPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  try {
    const matrix = svg.getScreenCTM?.();
    if (matrix && typeof DOMPoint !== 'undefined') {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
    }
  } catch { /* use viewBox fallback */ }
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number) ?? [];
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && rect.width > 0 && rect.height > 0) {
    return { x: viewBox[0] + ((clientX - rect.left) / rect.width) * viewBox[2], y: viewBox[1] + ((clientY - rect.top) / rect.height) * viewBox[3] };
  }
  return { x: clientX, y: clientY };
}

export function useChartTransform({ svg, transform, onChange }: Options): void {
  const transformRef = useRef(transform);
  const onChangeRef = useRef(onChange);
  transformRef.current = transform;
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!svg) return undefined;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; midpoint: { x: number; y: number } } | null = null;
    const emit = (next: ChartTransform) => { transformRef.current = next; onChangeRef.current(next); };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      emit(zoomAt(transformRef.current, Math.exp(-event.deltaY * 0.001), localPoint(svg, event.clientX, event.clientY)));
    };
    const pointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, localPoint(svg, event.clientX, event.clientY));
      svg.setPointerCapture?.(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
    };
    const pointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const current = localPoint(svg, event.clientX, event.clientY);
      pointers.set(event.pointerId, current);
      if (pointers.size === 1) emit(panBy(transformRef.current, current.x - previous.x, current.y - previous.y));
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch && pinch.distance > 0) emit(panBy(zoomAt(transformRef.current, distance / pinch.distance, pinch.midpoint), midpoint.x - pinch.midpoint.x, midpoint.y - pinch.midpoint.y));
        pinch = { distance, midpoint };
      }
    };
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinch = null;
      if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    };
    const keyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 48 : 16;
      const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0]
        : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null;
      if (delta) { event.preventDefault(); emit(panBy(transformRef.current, delta[0], delta[1])); }
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    svg.addEventListener('pointerdown', pointerDown);
    svg.addEventListener('pointermove', pointerMove);
    svg.addEventListener('pointerup', pointerUp);
    svg.addEventListener('pointercancel', pointerUp);
    svg.addEventListener('keydown', keyDown);
    return () => {
      pointers.clear();
      svg.removeEventListener('wheel', wheel);
      svg.removeEventListener('pointerdown', pointerDown);
      svg.removeEventListener('pointermove', pointerMove);
      svg.removeEventListener('pointerup', pointerUp);
      svg.removeEventListener('pointercancel', pointerUp);
      svg.removeEventListener('keydown', keyDown);
    };
  }, [svg]);
}
