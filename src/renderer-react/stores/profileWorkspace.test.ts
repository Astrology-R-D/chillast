import { describe, expect, test, vi } from 'vitest';
import {
  PROFILE_WORKSPACE_STORAGE_KEY,
  createProfileWorkspaceStore,
} from './profileWorkspace';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 2, 12);

function createStorage(value?: string): Storage & { writes: string[] } {
  const data = new Map<string, string>();
  if (value !== undefined) data.set(PROFILE_WORKSPACE_STORAGE_KEY, value);
  const writes: string[] = [];

  return {
    writes,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem(key, nextValue) {
      writes.push(nextValue);
      data.set(key, nextValue);
    },
  };
}

function persisted(storage: Storage): Record<string, unknown> {
  return JSON.parse(storage.getItem(PROFILE_WORKSPACE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

describe('profile workspace persistence', () => {
  test('starts empty and writes only canonical persistent fields', () => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState()).toMatchObject({
      primaryProfileId: null,
      recentUses: {},
      chartNavigationIntent: null,
    });
    expect(persisted(storage)).toEqual({ primaryProfileId: null, recentUses: {} });
  });

  test('restores a valid payload and prunes expired records at creation', () => {
    const storage = createStorage(JSON.stringify({
      primaryProfileId: 'profile-a',
      recentUses: {
        'profile-a': NOW - 90 * DAY_MS,
        expired: NOW - 90 * DAY_MS - 1,
      },
    }));

    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState().primaryProfileId).toBe('profile-a');
    expect(store.getState().recentUses).toEqual({ 'profile-a': NOW - 90 * DAY_MS });
  });

  test('prunes invalid recent entries without discarding valid workspace data', () => {
    const storage = createStorage(JSON.stringify({
      primaryProfileId: 'profile-a',
      recentUses: {
        'profile-a': NOW,
        future: NOW + 1,
        invalid: 'yesterday',
      },
    }));

    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState()).toMatchObject({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
    });
  });

  test.each([
    '{',
    '[]',
    '{"primaryProfileId":"","recentUses":{}}',
    '{"primaryProfileId":null,"recentUses":[]}',
    `{"primaryProfileId":null,"recentUses":{"profile-a":${NOW + 1}}}`,
    `{"primaryProfileId":null,"recentUses":{"__proto__":${NOW}}}`,
    `{"primaryProfileId":null,"recentUses":{"constructor":${NOW}}}`,
    `{"primaryProfileId":null,"recentUses":{"prototype":${NOW}}}`,
  ])('replaces corrupt or unsafe persisted data: %s', (value) => {
    const storage = createStorage(value);
    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState()).toMatchObject({ primaryProfileId: null, recentUses: {} });
    expect(persisted(storage)).toEqual({ primaryProfileId: null, recentUses: {} });
  });

  test('survives storage reads, writes, and JSON operations throwing', () => {
    const readFailure = createStorage();
    readFailure.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
    readFailure.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    const readStore = createProfileWorkspaceStore(readFailure, () => NOW);
    expect(() => readStore.getState().setPrimaryProfileId('profile-a')).not.toThrow();
    expect(readStore.getState().primaryProfileId).toBe('profile-a');

    const stringify = JSON.stringify;
    const parse = JSON.parse;
    vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('stringify failed'); });
    expect(() => createProfileWorkspaceStore(createStorage(), () => NOW)).not.toThrow();
    vi.mocked(JSON.stringify).mockImplementation(stringify);
    vi.spyOn(JSON, 'parse').mockImplementation(() => { throw new Error('parse failed'); });
    expect(createProfileWorkspaceStore(createStorage('{}'), () => NOW).getState().primaryProfileId).toBeNull();
    vi.mocked(JSON.parse).mockImplementation(parse);
    vi.restoreAllMocks();
  });
});

describe('profile workspace actions', () => {
  test('reconciles normalized repository IDs in supplied order and persists the fallback', () => {
    const storage = createStorage(JSON.stringify({
      primaryProfileId: 'missing',
      recentUses: { 'profile-b': NOW - 1, missing: NOW - 2 },
    }));
    const store = createProfileWorkspaceStore(storage, () => NOW);

    store.getState().reconcileProfileIds([' ', 'profile-a', 'profile-a', ' profile-b ']);

    expect(store.getState()).toMatchObject({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-b': NOW - 1 },
    });
    expect(persisted(storage)).toEqual({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-b': NOW - 1 },
    });
  });

  test('keeps a persisted primary when it exists in the repository', () => {
    const storage = createStorage(JSON.stringify({ primaryProfileId: 'profile-b', recentUses: {} }));
    const store = createProfileWorkspaceStore(storage, () => NOW);

    store.getState().reconcileProfileIds(['profile-a', 'profile-b']);

    expect(store.getState().primaryProfileId).toBe('profile-b');
  });

  test('setting primary records a recent use and persists both together', () => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);
    const writesBefore = storage.writes.length;

    store.getState().setPrimaryProfileId(' profile-a ');

    expect(store.getState()).toMatchObject({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
    });
    expect(storage.writes).toHaveLength(writesBefore + 1);
  });

  test('keeps at most 50 valid recents ordered newest then ID', () => {
    const store = createProfileWorkspaceStore(createStorage(), () => NOW);
    for (let index = 54; index >= 0; index -= 1) {
      store.getState().recordRecentUse(`profile-${String(index).padStart(2, '0')}`, NOW - (index % 3));
    }

    const entries = Object.entries(store.getState().recentUses);
    expect(entries).toHaveLength(50);
    expect(entries).toEqual([...entries].sort(([leftId, leftAt], [rightId, rightAt]) =>
      rightAt - leftAt || leftId.localeCompare(rightId)));
    expect(entries.slice(0, 3).map(([id]) => id)).toEqual(['profile-00', 'profile-03', 'profile-06']);
  });

  test('accepts the inclusive 90-day boundary and ignores invalid or future uses', () => {
    const store = createProfileWorkspaceStore(createStorage(), () => NOW);

    store.getState().recordRecentUse('boundary', NOW - 90 * DAY_MS);
    store.getState().recordRecentUse('expired', NOW - 90 * DAY_MS - 1);
    store.getState().recordRecentUse('future', NOW + 1);
    store.getState().recordRecentUse('nan', Number.NaN);
    store.getState().recordRecentUse(' ', NOW);

    expect(store.getState().recentUses).toEqual({ boundary: NOW - 90 * DAY_MS });
  });

  test('removing a profile clears its recent and leaves primary null until reconciliation', () => {
    const store = createProfileWorkspaceStore(createStorage(), () => NOW);
    store.getState().setPrimaryProfileId('profile-a');
    store.getState().recordRecentUse('profile-b');

    store.getState().removeProfile('profile-a');
    expect(store.getState()).toMatchObject({
      primaryProfileId: null,
      recentUses: { 'profile-b': NOW },
    });

    store.getState().reconcileProfileIds(['profile-b']);
    expect(store.getState().primaryProfileId).toBe('profile-b');
  });
});

describe('chart navigation intent', () => {
  test.each([
    [{ route: 'personal', chartType: 'natal', primaryProfileId: 'profile-a' }],
    [{ route: 'personal', chartType: 'transit', primaryProfileId: 'profile-a' }],
    [{ route: 'relationship', chartType: 'synastry', primaryProfileId: 'profile-a' }],
  ] as const)('opens a valid chart atomically and persists cross-route state once', (intent) => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);
    const listener = vi.fn();
    store.subscribe(listener);
    const writesBefore = storage.writes.length;

    store.getState().openChart(intent);

    expect(store.getState()).toMatchObject({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
      chartNavigationIntent: intent,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.writes).toHaveLength(writesBefore + 1);
    expect(persisted(storage)).toEqual({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
    });
  });

  test.each([
    { route: 'personal', chartType: 'synastry', primaryProfileId: 'profile-a' },
    { route: 'relationship', chartType: 'natal', primaryProfileId: 'profile-a' },
    { route: 'relationship', chartType: 'transit', primaryProfileId: 'profile-a' },
    { route: 'other', chartType: 'natal', primaryProfileId: 'profile-a' },
    { route: 'personal', chartType: 'natal', primaryProfileId: ' ' },
  ])('ignores an invalid chart intent %#', (intent) => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);
    const writesBefore = storage.writes.length;

    expect(() => store.getState().openChart(intent as never)).not.toThrow();
    expect(store.getState().chartNavigationIntent).toBeNull();
    expect(storage.writes).toHaveLength(writesBefore);
  });

  test('consumes intent once and does not persist it across store recreation', () => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);
    const intent = { route: 'personal', chartType: 'natal', primaryProfileId: 'profile-a' } as const;
    store.getState().openChart(intent);

    expect(store.getState().consumeChartIntent()).toEqual(intent);
    expect(store.getState().consumeChartIntent()).toBeNull();

    store.getState().openChart(intent);
    const recreated = createProfileWorkspaceStore(storage, () => NOW);
    expect(recreated.getState()).toMatchObject({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
      chartNavigationIntent: null,
    });
  });
});
