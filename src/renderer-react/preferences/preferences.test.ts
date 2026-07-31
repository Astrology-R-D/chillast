import { beforeEach, describe, expect, test } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';
import {
  createPreferencesStore,
  startPreferenceSync,
  syncPreferencesToDocument,
} from './preferences';

function createStorage(values: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(values));

  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-preference');
  document.documentElement.removeAttribute('data-density');
  document.documentElement.style.colorScheme = '';
});

describe('createPreferencesStore', () => {
  test('defaults to system theme and compact density', () => {
    const store = createPreferencesStore(createStorage());

    expect(store.getState()).toMatchObject({ theme: 'system', density: 'compact' });
  });

  test('replaces invalid persisted values with defaults', () => {
    const storage = createStorage({
      'chillast.theme': 'sepia',
      'chillast.density': 'spacious',
    });

    const store = createPreferencesStore(storage);

    expect(store.getState()).toMatchObject({ theme: 'system', density: 'compact' });
    expect(storage.getItem('chillast.theme')).toBe('system');
    expect(storage.getItem('chillast.density')).toBe('compact');
  });

  test('persists theme and density updates', () => {
    const storage = createStorage();
    const store = createPreferencesStore(storage);

    store.getState().setTheme('dark');
    store.getState().setDensity('comfortable');

    expect(store.getState()).toMatchObject({ theme: 'dark', density: 'comfortable' });
    expect(storage.getItem('chillast.theme')).toBe('dark');
    expect(storage.getItem('chillast.density')).toBe('comfortable');
  });
});

describe('document preference sync', () => {
  test.each([
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('resolves %s with dark media %s to %s', (theme, darkMedia, resolved) => {
    const media = createMatchMediaController(darkMedia);
    const query = media.matchMedia('(prefers-color-scheme: dark)');

    syncPreferencesToDocument({ theme, density: 'comfortable' }, query);

    expect(document.documentElement.dataset.theme).toBe(resolved);
    expect(document.documentElement.dataset.themePreference).toBe(theme);
    expect(document.documentElement.dataset.density).toBe('comfortable');
    expect(document.documentElement.style.colorScheme).toBe(resolved);
  });

  test('syncs immediately and follows system theme changes', () => {
    const media = createMatchMediaController(false);
    const query = media.matchMedia('(prefers-color-scheme: dark)');
    const store = createPreferencesStore(createStorage());

    const cleanup = startPreferenceSync(store, query);
    expect(document.documentElement.dataset.theme).toBe('light');

    media.setMatches(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    cleanup();
  });

  test('keeps a manual theme stable across system changes', () => {
    const media = createMatchMediaController(false);
    const query = media.matchMedia('(prefers-color-scheme: dark)');
    const store = createPreferencesStore(createStorage({ 'chillast.theme': 'light' }));

    const cleanup = startPreferenceSync(store, query);
    media.setMatches(true);

    expect(document.documentElement.dataset.theme).toBe('light');
    cleanup();
  });

  test('updates when preferences change and cleanup stops all future sync', () => {
    const media = createMatchMediaController(false);
    const query = media.matchMedia('(prefers-color-scheme: dark)');
    const store = createPreferencesStore(createStorage());
    const cleanup = startPreferenceSync(store, query);

    expect(media.listenerCount()).toBe(1);
    store.getState().setDensity('comfortable');
    store.getState().setTheme('dark');
    expect(document.documentElement.dataset.density).toBe('comfortable');
    expect(document.documentElement.dataset.theme).toBe('dark');

    cleanup();
    cleanup();
    expect(media.listenerCount()).toBe(0);

    store.getState().setTheme('light');
    media.setMatches(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
