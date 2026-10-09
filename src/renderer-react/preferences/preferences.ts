import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { aiReadingStyles, DEFAULT_AI_READING, normalizeAiReading, type AiReadingPreferences } from './aiReading';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

export interface PreferenceValues {
  theme: ThemePreference;
  density: Density;
  aiReading?: AiReadingPreferences;
}

export interface PreferencesState extends PreferenceValues {
  aiReading: AiReadingPreferences;
  setTheme(theme: ThemePreference): void;
  setDensity(density: Density): void;
  setAiReading(values: Partial<AiReadingPreferences>): void;
  resetAiReading(): void;
}

const THEME_KEY = 'chillast.theme';
const DENSITY_KEY = 'chillast.density';
const AI_READING_KEY = 'chillast.aiReading';

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Preferences remain usable when persistence is unavailable.
  }
}

function readTheme(storage: Storage): ThemePreference {
  const value = safeGetItem(storage, THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function readDensity(storage: Storage): Density {
  const value = safeGetItem(storage, DENSITY_KEY);
  return value === 'compact' || value === 'comfortable' ? value : 'compact';
}

export function createPreferencesStore(storage: Storage): StoreApi<PreferencesState> {
  const theme = readTheme(storage);
  const density = readDensity(storage);
  let aiReading: AiReadingPreferences;
  try { aiReading = normalizeAiReading(JSON.parse(safeGetItem(storage, AI_READING_KEY) || '{}')); }
  catch { aiReading = { ...DEFAULT_AI_READING }; }

  safeSetItem(storage, THEME_KEY, theme);
  safeSetItem(storage, DENSITY_KEY, density);
  safeSetItem(storage, AI_READING_KEY, JSON.stringify(aiReading));

  return createStore<PreferencesState>((set, get) => ({
    theme,
    density,
    aiReading,
    setTheme(nextTheme) {
      set({ theme: nextTheme });
      safeSetItem(storage, THEME_KEY, nextTheme);
    },
    setDensity(nextDensity) {
      set({ density: nextDensity });
      safeSetItem(storage, DENSITY_KEY, nextDensity);
    },
    setAiReading(values) {
      const next = normalizeAiReading({ ...get().aiReading, ...values });
      set({ aiReading: next }); safeSetItem(storage, AI_READING_KEY, JSON.stringify(next));
    },
    resetAiReading() {
      const next = { ...DEFAULT_AI_READING };
      set({ aiReading: next }); safeSetItem(storage, AI_READING_KEY, JSON.stringify(next));
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
  for (const [name, value] of Object.entries(aiReadingStyles(values.aiReading || DEFAULT_AI_READING))) root.style.setProperty(name, value);
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
