import { describe, expect, test, vi } from 'vitest';
import {
  PROFILE_WORKSPACE_KEY,
  createProfileWorkspaceStore,
} from './profileWorkspace';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 2, 12);

function createStorage(value?: string): Storage & { writes: string[] } {
  const data = new Map<string, string>();
  if (value !== undefined) data.set(PROFILE_WORKSPACE_KEY, value);
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
  return JSON.parse(storage.getItem(PROFILE_WORKSPACE_KEY) ?? '{}') as Record<string, unknown>;
}

describe('profile workspace persistence', () => {
  test('starts empty without writing when persisted state is missing', () => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState()).toMatchObject({
      primaryProfileId: null,
      recentUses: {},
      chartIntent: null,
    });
    expect(storage.getItem(PROFILE_WORKSPACE_KEY)).toBeNull();
    expect(storage.writes).toEqual([]);
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

  test('prunes invalid recents and clamps future recents without discarding valid data', () => {
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
      recentUses: { future: NOW, 'profile-a': NOW },
    });
    expect(persisted(storage)).toEqual({
      primaryProfileId: 'profile-a',
      recentUses: { future: NOW, 'profile-a': NOW },
    });
  });

  test.each([
    '{',
    '[]',
    '{"primaryProfileId":"","recentUses":{}}',
    '{"primaryProfileId":null,"recentUses":[]}',
    `{"primaryProfileId":null,"recentUses":{"__proto__":${NOW}}}`,
    `{"primaryProfileId":null,"recentUses":{"constructor":${NOW}}}`,
    `{"primaryProfileId":null,"recentUses":{"prototype":${NOW}}}`,
  ])('preserves malformed or unsafe persisted data for inspection: %s', (value) => {
    const storage = createStorage(value);
    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState()).toMatchObject({ primaryProfileId: null, recentUses: {} });
    expect(storage.getItem(PROFILE_WORKSPACE_KEY)).toBe(value);
    expect(storage.writes).toEqual([]);
  });

  test('does not overwrite storage after a read error and persists on a later action', () => {
    const storage = createStorage(JSON.stringify({
      primaryProfileId: 'unread',
      recentUses: { unread: NOW },
    }));
    const read = storage.getItem.bind(storage);
    let failRead = true;
    storage.getItem = (key) => {
      if (failRead) {
        failRead = false;
        throw new DOMException('denied', 'SecurityError');
      }
      return read(key);
    };

    const store = createProfileWorkspaceStore(storage, () => NOW);
    expect(storage.writes).toEqual([]);
    expect(store.getState().primaryProfileId).toBeNull();

    store.getState().setPrimaryProfile('profile-a');
    expect(persisted(storage)).toEqual({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
    });
  });

  test('preserves malformed JSON until an explicit action replaces it', () => {
    const storage = createStorage('{forensic');
    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(storage.getItem(PROFILE_WORKSPACE_KEY)).toBe('{forensic');
    expect(storage.writes).toEqual([]);

    store.getState().setPrimaryProfile('profile-a');
    expect(persisted(storage)).toEqual({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
    });
  });

  test('survives storage reads, writes, and JSON operations throwing', () => {
    const readFailure = createStorage();
    readFailure.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
    readFailure.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    const readStore = createProfileWorkspaceStore(readFailure, () => NOW);
    expect(() => readStore.getState().setPrimaryProfile('profile-a')).not.toThrow();
    expect(readStore.getState().primaryProfileId).toBe('profile-a');

    const stringify = JSON.stringify;
    const parse = JSON.parse;
    vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('stringify failed'); });
    const stringifyStore = createProfileWorkspaceStore(createStorage(), () => NOW);
    expect(() => stringifyStore.getState().setPrimaryProfile('profile-a')).not.toThrow();
    expect(stringifyStore.getState().primaryProfileId).toBe('profile-a');
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

    store.getState().reconcileProfiles([' ', 'profile-a', 'profile-a', ' profile-b ']);

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

    store.getState().reconcileProfiles(['profile-a', 'profile-b']);

    expect(store.getState().primaryProfileId).toBe('profile-b');
  });

  test('setting primary records a recent use and persists both together', () => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);
    const writesBefore = storage.writes.length;

    store.getState().setPrimaryProfile(' profile-a ');

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

  test('accepts the inclusive 90-day boundary, clamps future uses, and ignores invalid uses', () => {
    const store = createProfileWorkspaceStore(createStorage(), () => NOW);

    store.getState().recordRecentUse('boundary', NOW - 90 * DAY_MS);
    store.getState().recordRecentUse('expired', NOW - 90 * DAY_MS - 1);
    store.getState().recordRecentUse('future', NOW + 1);
    store.getState().recordRecentUse('nan', Number.NaN);
    store.getState().recordRecentUse(' ', NOW);

    expect(store.getState().recentUses).toEqual({
      future: NOW,
      boundary: NOW - 90 * DAY_MS,
    });
  });

  test('does not regress a recent use when an older event arrives later', () => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);

    store.getState().recordRecentUse('profile-a', NOW - 1);
    store.getState().recordRecentUse('profile-a', NOW - DAY_MS);

    expect(store.getState().recentUses).toEqual({ 'profile-a': NOW - 1 });
    expect(persisted(storage)).toEqual({
      primaryProfileId: null,
      recentUses: { 'profile-a': NOW - 1 },
    });
  });

  test('clamps persisted future recents when the clock moves backward', () => {
    const storage = createStorage(JSON.stringify({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW + DAY_MS },
    }));

    const store = createProfileWorkspaceStore(storage, () => NOW);

    expect(store.getState().recentUses).toEqual({ 'profile-a': NOW });
    expect(persisted(storage)).toEqual({
      primaryProfileId: 'profile-a',
      recentUses: { 'profile-a': NOW },
    });
  });

  test('uses a finite per-call now override for validation and pruning', () => {
    const injectedNow = NOW + 200 * DAY_MS;
    const store = createProfileWorkspaceStore(createStorage(), () => injectedNow);

    store.getState().recordRecentUse('profile-a', NOW - 90 * DAY_MS, NOW);
    store.getState().recordRecentUse('profile-b', NOW, NOW);

    expect(store.getState().recentUses).toEqual({
      'profile-b': NOW,
      'profile-a': NOW - 90 * DAY_MS,
    });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'ignores an invalid per-call now override: %s',
    (now) => {
      const storage = createStorage();
      const store = createProfileWorkspaceStore(storage, () => NOW);
      const writesBefore = storage.writes.length;

      expect(() => store.getState().recordRecentUse('profile-a', NOW, now)).not.toThrow();
      expect(store.getState().recentUses).toEqual({});
      expect(storage.writes).toHaveLength(writesBefore);
    },
  );

  test('removing a profile clears its recent and leaves primary null until reconciliation', () => {
    const store = createProfileWorkspaceStore(createStorage(), () => NOW);
    store.getState().setPrimaryProfile('profile-a');
    store.getState().recordRecentUse('profile-b');

    store.getState().removeProfile('profile-a');
    expect(store.getState()).toMatchObject({
      primaryProfileId: null,
      recentUses: { 'profile-b': NOW },
    });

    store.getState().reconcileProfiles(['profile-b']);
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
      chartIntent: intent,
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
    expect(store.getState().chartIntent).toBeNull();
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
      chartIntent: null,
    });
  });
});

describe('reentrant persistence', () => {
  const chartIntent = {
    route: 'personal',
    chartType: 'natal',
    primaryProfileId: 'outer',
  } as const;

  test.each([
    ['reconcileProfiles', (store: ReturnType<typeof createProfileWorkspaceStore>) => {
      store.getState().reconcileProfiles(['outer']);
    }],
    ['setPrimaryProfile', (store: ReturnType<typeof createProfileWorkspaceStore>) => {
      store.getState().setPrimaryProfile('outer');
    }],
    ['openChart', (store: ReturnType<typeof createProfileWorkspaceStore>) => {
      store.getState().openChart(chartIntent);
    }],
  ] as const)('keeps nested state newest after %s notifies subscribers', (_name, outerAction) => {
    const storage = createStorage();
    const store = createProfileWorkspaceStore(storage, () => NOW);
    let nested = false;
    store.subscribe(() => {
      if (nested) return;
      nested = true;
      store.getState().setPrimaryProfile('nested');
    });

    outerAction(store);

    const memory = store.getState();
    const recreated = createProfileWorkspaceStore(storage, () => NOW).getState();
    expect(memory).toMatchObject({
      primaryProfileId: 'nested',
      recentUses: { nested: NOW },
    });
    expect(recreated).toMatchObject({
      primaryProfileId: memory.primaryProfileId,
      recentUses: memory.recentUses,
      chartIntent: null,
    });
  });
});
