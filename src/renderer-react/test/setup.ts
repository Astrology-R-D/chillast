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
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
