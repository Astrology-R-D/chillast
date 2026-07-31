import { vi } from 'vitest';

export interface MatchMediaController {
  matchMedia: typeof window.matchMedia;
  setMatches(matches: boolean): void;
  listenerCount(): number;
}

export function createMatchMediaController(initialMatches = false): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  return {
    matchMedia: vi.fn(() => mediaQueryList),
    setMatches(nextMatches) {
      matches = nextMatches;
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent;
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.size,
  };
}
