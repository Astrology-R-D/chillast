import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';
import { useNarrowLayout } from './useNarrowLayout';

test('uses the initial narrow media match and follows later changes', () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);

  const { result } = renderHook(() => useNarrowLayout());

  expect(media.matchMedia).toHaveBeenCalledWith('(max-width: 1199px)');
  expect(result.current).toBe(true);
  expect(media.listenerCount()).toBe(1);

  act(() => media.setMatches(false));
  expect(result.current).toBe(false);
  expect(media.listenerCount()).toBe(1);
});

test('removes its media listener when unmounted', () => {
  const media = createMatchMediaController();
  vi.stubGlobal('matchMedia', media.matchMedia);

  const { unmount } = renderHook(() => useNarrowLayout());
  expect(media.listenerCount()).toBe(1);

  unmount();
  expect(media.listenerCount()).toBe(0);
});
