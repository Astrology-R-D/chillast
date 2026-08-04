import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createMatchMediaController } from './matchMedia';

afterEach(cleanup);

beforeEach(() => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
});

vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserverMock {
    private elements = new Set<Element>();
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) {
      this.elements.add(element);
      const callbacks = resizeCallbacks.get(element) ?? new Set<ResizeObserverCallback>();
      callbacks.add(this.callback); resizeCallbacks.set(element, callbacks);
    }
    unobserve(element: Element) { this.elements.delete(element); resizeCallbacks.get(element)?.delete(this.callback); }
    disconnect() { for (const element of this.elements) resizeCallbacks.get(element)?.delete(this.callback); this.elements.clear(); }
  },
);

const resizeCallbacks = new Map<Element, Set<ResizeObserverCallback>>();

export function setObservedSize(element: Element, size: { width: number; height: number }): void {
  const callbacks = resizeCallbacks.get(element);
  if (!callbacks?.size) throw new Error('Element is not currently observed');
  const entry = {
    target: element,
    contentRect: { x: 0, y: 0, top: 0, left: 0, bottom: size.height, right: size.width, ...size, toJSON: () => ({}) },
    borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [],
  } as ResizeObserverEntry;
  for (const callback of callbacks) callback([entry], {} as ResizeObserver);
}
