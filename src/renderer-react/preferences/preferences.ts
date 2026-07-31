import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

export interface PreferenceValues {
  theme: ThemePreference;
  density: Density;
}

export interface PreferencesState extends PreferenceValues {
  setTheme(theme: ThemePreference): void;
  setDensity(density: Density): void;
}

const THEME_KEY = 'chillast.theme';
const DENSITY_KEY = 'chillast.density';

function readTheme(storage: Storage): ThemePreference {
  const value = storage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function readDensity(storage: Storage): Density {
  const value = storage.getItem(DENSITY_KEY);
  return value === 'compact' || value === 'comfortable' ? value : 'compact';
}

export function createPreferencesStore(storage: Storage): StoreApi<PreferencesState> {
  const theme = readTheme(storage);
  const density = readDensity(storage);

  storage.setItem(THEME_KEY, theme);
  storage.setItem(DENSITY_KEY, density);

  return createStore<PreferencesState>((set) => ({
    theme,
    density,
    setTheme(nextTheme) {
      storage.setItem(THEME_KEY, nextTheme);
      set({ theme: nextTheme });
    },
    setDensity(nextDensity) {
      storage.setItem(DENSITY_KEY, nextDensity);
      set({ density: nextDensity });
    },
  }));
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function getBrowserStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

export const preferencesStore = createPreferencesStore(getBrowserStorage());

export function usePreferences<T>(selector: (state: PreferencesState) => T): T {
  return useStore(preferencesStore, selector);
}

export function syncPreferencesToDocument(
  values: PreferenceValues,
  darkModeQuery: MediaQueryList,
): void {
  const resolvedTheme =
    values.theme === 'system' ? (darkModeQuery.matches ? 'dark' : 'light') : values.theme;
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = values.theme;
  root.dataset.density = values.density;
  root.style.colorScheme = resolvedTheme;
}

export function startPreferenceSync(
  store: StoreApi<PreferencesState> = preferencesStore,
  darkModeQuery: MediaQueryList = window.matchMedia('(prefers-color-scheme: dark)'),
): () => void {
  const sync = () => syncPreferencesToDocument(store.getState(), darkModeQuery);
  const handleSystemThemeChange = () => {
    if (store.getState().theme === 'system') sync();
  };

  sync();
  const unsubscribe = store.subscribe(sync);
  darkModeQuery.addEventListener('change', handleSystemThemeChange);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    darkModeQuery.removeEventListener('change', handleSystemThemeChange);
  };
}
