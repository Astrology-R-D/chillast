import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export const PROFILE_WORKSPACE_STORAGE_KEY = 'chillast.profileWorkspace';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_USE_MAX_AGE = 90 * DAY_MS;
const RECENT_USE_LIMIT = 50;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type ChartNavigationIntent =
  | { route: 'personal'; chartType: 'natal' | 'transit'; primaryProfileId: string }
  | { route: 'relationship'; chartType: 'synastry'; primaryProfileId: string };

export interface ProfileWorkspaceState {
  primaryProfileId: string | null;
  recentUses: Record<string, number>;
  chartNavigationIntent: ChartNavigationIntent | null;
  reconcileProfileIds(profileIds: readonly string[]): void;
  setPrimaryProfileId(profileId: string | null): void;
  recordRecentUse(profileId: string, usedAt?: number): void;
  removeProfile(profileId: string): void;
  openChart(intent: ChartNavigationIntent): void;
  consumeChartIntent(): ChartNavigationIntent | null;
}

interface PersistedProfileWorkspace {
  primaryProfileId: string | null;
  recentUses: Record<string, number>;
}

function validId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && !UNSAFE_KEYS.has(id) ? id : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeNow(nowProvider: () => number): number {
  try {
    const now = nowProvider();
    return Number.isFinite(now) ? now : Date.now();
  } catch {
    return Date.now();
  }
}

function normalizeRecents(
  value: Record<string, unknown>,
  now: number,
  allowedIds?: ReadonlySet<string>,
): Record<string, number> {
  return Object.entries(value)
    .filter(([id, usedAt]) => {
      return validId(id) === id
        && typeof usedAt === 'number'
        && Number.isFinite(usedAt)
        && usedAt <= now
        && usedAt >= now - RECENT_USE_MAX_AGE
        && (!allowedIds || allowedIds.has(id));
    })
    .sort(([leftId, leftAt], [rightId, rightAt]) =>
      (rightAt as number) - (leftAt as number) || compareIds(leftId, rightId))
    .slice(0, RECENT_USE_LIMIT)
    .reduce<Record<string, number>>((recents, [id, usedAt]) => {
      recents[id] = usedAt as number;
      return recents;
    }, {});
}

function emptyWorkspace(): PersistedProfileWorkspace {
  return { primaryProfileId: null, recentUses: {} };
}

function readWorkspace(storage: Storage, now: number): PersistedProfileWorkspace {
  try {
    const serialized = storage.getItem(PROFILE_WORKSPACE_STORAGE_KEY);
    if (serialized === null) return emptyWorkspace();
    const parsed: unknown = JSON.parse(serialized);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.recentUses)) return emptyWorkspace();
    if (parsed.primaryProfileId !== null && validId(parsed.primaryProfileId) === null) {
      return emptyWorkspace();
    }
    if (Object.keys(parsed.recentUses).some((key) => validId(key) !== key)) return emptyWorkspace();

    return {
      primaryProfileId: parsed.primaryProfileId === null ? null : validId(parsed.primaryProfileId),
      recentUses: normalizeRecents(parsed.recentUses, now),
    };
  } catch {
    return emptyWorkspace();
  }
}

function persistWorkspace(storage: Storage, workspace: PersistedProfileWorkspace): void {
  try {
    storage.setItem(PROFILE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // Workspace state remains usable when browser persistence is unavailable.
  }
}

function validIntent(value: ChartNavigationIntent): ChartNavigationIntent | null {
  if (!isPlainObject(value)) return null;
  const primaryProfileId = validId(value.primaryProfileId);
  if (!primaryProfileId) return null;
  if (value.route === 'personal' && (value.chartType === 'natal' || value.chartType === 'transit')) {
    return { route: value.route, chartType: value.chartType, primaryProfileId };
  }
  if (value.route === 'relationship' && value.chartType === 'synastry') {
    return { route: value.route, chartType: value.chartType, primaryProfileId };
  }
  return null;
}

export function createProfileWorkspaceStore(
  storage: Storage,
  nowProvider: () => number = Date.now,
): StoreApi<ProfileWorkspaceState> {
  const initial = readWorkspace(storage, safeNow(nowProvider));
  persistWorkspace(storage, initial);

  return createStore<ProfileWorkspaceState>((set, get) => ({
    ...initial,
    chartNavigationIntent: null,
    reconcileProfileIds(profileIds) {
      const ids = [...new Set(profileIds.map(validId).filter((id): id is string => id !== null))];
      const allowedIds = new Set(ids);
      const state = get();
      const next = {
        primaryProfileId: state.primaryProfileId && allowedIds.has(state.primaryProfileId)
          ? state.primaryProfileId
          : ids[0] ?? null,
        recentUses: normalizeRecents(state.recentUses, safeNow(nowProvider), allowedIds),
      };
      set(next);
      persistWorkspace(storage, next);
    },
    setPrimaryProfileId(profileId) {
      if (profileId === null) {
        const next = { primaryProfileId: null, recentUses: get().recentUses };
        set(next);
        persistWorkspace(storage, next);
        return;
      }
      const id = validId(profileId);
      if (!id) return;
      const now = safeNow(nowProvider);
      const recentUses = normalizeRecents({ ...get().recentUses, [id]: now }, now);
      const next = { primaryProfileId: id, recentUses };
      set(next);
      persistWorkspace(storage, next);
    },
    recordRecentUse(profileId, usedAt) {
      const id = validId(profileId);
      const now = safeNow(nowProvider);
      const timestamp = usedAt ?? now;
      if (!id || !Number.isFinite(timestamp) || timestamp > now || timestamp < now - RECENT_USE_MAX_AGE) return;
      const next = {
        primaryProfileId: get().primaryProfileId,
        recentUses: normalizeRecents({ ...get().recentUses, [id]: timestamp }, now),
      };
      set({ recentUses: next.recentUses });
      persistWorkspace(storage, next);
    },
    removeProfile(profileId) {
      const id = validId(profileId);
      if (!id) return;
      const state = get();
      if (state.primaryProfileId !== id && !Object.hasOwn(state.recentUses, id)) return;
      const { [id]: _removed, ...recentUses } = state.recentUses;
      const next = {
        primaryProfileId: state.primaryProfileId === id ? null : state.primaryProfileId,
        recentUses,
      };
      set(next);
      persistWorkspace(storage, next);
    },
    openChart(intent) {
      const normalizedIntent = validIntent(intent);
      if (!normalizedIntent) return;
      const now = safeNow(nowProvider);
      const recentUses = normalizeRecents({
        ...get().recentUses,
        [normalizedIntent.primaryProfileId]: now,
      }, now);
      const next = {
        primaryProfileId: normalizedIntent.primaryProfileId,
        recentUses,
        chartNavigationIntent: normalizedIntent,
      };
      set(next);
      persistWorkspace(storage, {
        primaryProfileId: next.primaryProfileId,
        recentUses: next.recentUses,
      });
    },
    consumeChartIntent() {
      const intent = get().chartNavigationIntent;
      if (intent) set({ chartNavigationIntent: null });
      return intent;
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
    return typeof window === 'undefined' ? createMemoryStorage() : window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

export const profileWorkspaceStore = createProfileWorkspaceStore(getBrowserStorage());

export function useProfileWorkspace<T>(selector: (state: ProfileWorkspaceState) => T): T {
  return useStore(profileWorkspaceStore, selector);
}
