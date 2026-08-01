import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export const PROFILE_WORKSPACE_KEY = 'chillast.profileWorkspace';

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
  chartIntent: ChartNavigationIntent | null;
  reconcileProfiles(profileIds: readonly string[]): void;
  setPrimaryProfile(profileId: string): void;
  recordRecentUse(profileId: string, usedAt?: number, now?: number): void;
  removeProfile(profileId: string): void;
  openChart(intent: ChartNavigationIntent): void;
  consumeChartIntent(): ChartNavigationIntent | null;
}

interface PersistedProfileWorkspace {
  primaryProfileId: string | null;
  recentUses: Record<string, number>;
}

type ReadWorkspaceResult =
  | { status: 'valid'; workspace: PersistedProfileWorkspace }
  | { status: 'missing' | 'malformed' | 'read-error'; workspace: PersistedProfileWorkspace };

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
    .flatMap(([id, usedAt]) => {
      if (
        validId(id) !== id
        || typeof usedAt !== 'number'
        || !Number.isFinite(usedAt)
        || (allowedIds && !allowedIds.has(id))
      ) return [];

      const timestamp = Math.min(usedAt, now);
      return timestamp >= now - RECENT_USE_MAX_AGE ? [[id, timestamp] as const] : [];
    })
    .sort(([leftId, leftAt], [rightId, rightAt]) =>
      rightAt - leftAt || compareIds(leftId, rightId))
    .slice(0, RECENT_USE_LIMIT)
    .reduce<Record<string, number>>((recents, [id, usedAt]) => {
      recents[id] = usedAt;
      return recents;
    }, {});
}

function withRecentUse(
  recentUses: Record<string, number>,
  profileId: string,
  usedAt: number,
  now: number,
): Record<string, number> {
  const normalized = normalizeRecents(recentUses, now);
  normalized[profileId] = Math.max(normalized[profileId] ?? Number.NEGATIVE_INFINITY, usedAt);
  return normalizeRecents(normalized, now);
}

function emptyWorkspace(): PersistedProfileWorkspace {
  return { primaryProfileId: null, recentUses: {} };
}

function readWorkspace(storage: Storage, now: number): ReadWorkspaceResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(PROFILE_WORKSPACE_KEY);
  } catch {
    return { status: 'read-error', workspace: emptyWorkspace() };
  }
  if (serialized === null) return { status: 'missing', workspace: emptyWorkspace() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { status: 'malformed', workspace: emptyWorkspace() };
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.recentUses)) {
    return { status: 'malformed', workspace: emptyWorkspace() };
  }
  if (parsed.primaryProfileId !== null && validId(parsed.primaryProfileId) === null) {
    return { status: 'malformed', workspace: emptyWorkspace() };
  }
  if (Object.keys(parsed.recentUses).some((key) => validId(key) !== key)) {
    return { status: 'malformed', workspace: emptyWorkspace() };
  }

  return {
    status: 'valid',
    workspace: {
      primaryProfileId: parsed.primaryProfileId === null ? null : validId(parsed.primaryProfileId),
      recentUses: normalizeRecents(parsed.recentUses, now),
    },
  };
}

function persistWorkspace(storage: Storage, workspace: PersistedProfileWorkspace): void {
  try {
    storage.setItem(PROFILE_WORKSPACE_KEY, JSON.stringify(workspace));
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
  const readResult = readWorkspace(storage, safeNow(nowProvider));
  const initial = readResult.workspace;
  if (readResult.status === 'valid') persistWorkspace(storage, initial);

  return createStore<ProfileWorkspaceState>((set, get) => {
    const commit = (
      next: PersistedProfileWorkspace & { chartIntent?: ChartNavigationIntent | null },
    ): void => {
      persistWorkspace(storage, {
        primaryProfileId: next.primaryProfileId,
        recentUses: next.recentUses,
      });
      set(next);
    };

    return {
      ...initial,
      chartIntent: null,
      reconcileProfiles(profileIds) {
        const ids = [...new Set(profileIds.map(validId).filter((id): id is string => id !== null))];
        const allowedIds = new Set(ids);
        const state = get();
        commit({
          primaryProfileId: state.primaryProfileId && allowedIds.has(state.primaryProfileId)
            ? state.primaryProfileId
            : ids[0] ?? null,
          recentUses: normalizeRecents(state.recentUses, safeNow(nowProvider), allowedIds),
        });
      },
      setPrimaryProfile(profileId) {
        const id = validId(profileId);
        if (!id) return;
        const now = safeNow(nowProvider);
        commit({
          primaryProfileId: id,
          recentUses: withRecentUse(get().recentUses, id, now, now),
        });
      },
      recordRecentUse(profileId, usedAt, nowOverride) {
        const id = validId(profileId);
        if (nowOverride !== undefined && !Number.isFinite(nowOverride)) return;
        const now = nowOverride ?? safeNow(nowProvider);
        if (!id || (usedAt !== undefined && !Number.isFinite(usedAt))) return;
        const timestamp = Math.min(usedAt ?? now, now);
        if (timestamp < now - RECENT_USE_MAX_AGE) return;
        commit({
          primaryProfileId: get().primaryProfileId,
          recentUses: withRecentUse(get().recentUses, id, timestamp, now),
        });
      },
      removeProfile(profileId) {
        const id = validId(profileId);
        if (!id) return;
        const state = get();
        if (state.primaryProfileId !== id && !Object.hasOwn(state.recentUses, id)) return;
        const { [id]: _removed, ...recentUses } = state.recentUses;
        commit({
          primaryProfileId: state.primaryProfileId === id ? null : state.primaryProfileId,
          recentUses,
        });
      },
      openChart(intent) {
        const normalizedIntent = validIntent(intent);
        if (!normalizedIntent) return;
        const now = safeNow(nowProvider);
        commit({
          primaryProfileId: normalizedIntent.primaryProfileId,
          recentUses: withRecentUse(
            get().recentUses,
            normalizedIntent.primaryProfileId,
            now,
            now,
          ),
          chartIntent: normalizedIntent,
        });
      },
      consumeChartIntent() {
        const intent = get().chartIntent;
        if (intent) set({ chartIntent: null });
        return intent;
      },
    };
  });
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
