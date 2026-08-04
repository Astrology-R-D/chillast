import { describe, expect, test, vi } from 'vitest';
import { CHART_TYPES } from '../features/charts/contracts';
import {
  WESTERN_WORKSPACE_KEY,
  defaultTableLayout,
  defaultWesternWorkspace,
  parseWesternWorkspace,
  pushRecent,
  readWesternWorkspace,
  reconcileWorkspace,
  relocationRecentId,
  writeWesternWorkspace,
} from './chartWorkspacePersistence';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('western chart workspace persistence', () => {
  test('creates isolated defaults for all 20 chart types', () => {
    const workspace = defaultWesternWorkspace();
    expect(workspace.tableLayouts).toEqual(Object.fromEntries(CHART_TYPES.map((type) => [
      type,
      expect.objectContaining({ version: 1, activeTab: 'planets' }),
    ])));
    workspace.tableLayouts.natal.tabs.planets.columnOrder.push('changed');
    expect(workspace.tableLayouts.transit.tabs.planets.columnOrder).toEqual([]);
  });

  test('moves stable recents to the front, deduplicates, and caps at eight', () => {
    expect(pushRecent(['b', 'a'], 'a')).toEqual(['a', 'b']);
    expect(pushRecent(Array.from({ length: 8 }, (_, index) => `p${index}`), 'new')).toHaveLength(8);
    expect(pushRecent(
      [{ id: 'a', label: 'old' }, { id: 'b', label: 'b' }],
      { id: 'a', label: 'new' },
      (value) => value.id,
    )).toEqual([{ id: 'a', label: 'new' }, { id: 'b', label: 'b' }]);
    expect(relocationRecentId({ latitude: 39.9042004, longitude: 116.4073996 }))
      .toBe('39.904200:116.407400');
  });

  test('parses valid V1 values and recovers only a corrupt chart layout', () => {
    const source = defaultWesternWorkspace();
    source.split.personal.horizontal = [60, 40];
    source.tableLayouts.natal.activeTab = 'aspects';
    const parsed = parseWesternWorkspace({
      ...source,
      tableLayouts: { ...source.tableLayouts, transit: { version: 1, activeTab: 'invalid' } },
    });
    expect(parsed.split.personal.horizontal).toEqual([60, 40]);
    expect(parsed.tableLayouts.natal.activeTab).toBe('aspects');
    expect(parsed.tableLayouts.transit).toEqual(defaultTableLayout());
  });

  test('unsupported top-level versions reset only the western chart payload', () => {
    const profileContainer = {
      primaryProfileId: 'p1',
      recentUses: { p1: 123 },
      westernChart: { ...defaultWesternWorkspace(), version: 2 },
    };
    const before = JSON.stringify({
      primaryProfileId: profileContainer.primaryProfileId,
      recentUses: profileContainer.recentUses,
    });
    profileContainer.westernChart = parseWesternWorkspace(profileContainer.westernChart);
    expect(profileContainer.westernChart).toEqual(defaultWesternWorkspace());
    expect(JSON.stringify({
      primaryProfileId: profileContainer.primaryProfileId,
      recentUses: profileContainer.recentUses,
    })).toBe(before);
  });

  test('reconciles deleted profile and relocation IDs', () => {
    const workspace = defaultWesternWorkspace();
    workspace.recents.primaryProfileIds = ['deleted', 'p1'];
    workspace.recents.secondaryProfileIds = ['p2', 'deleted'];
    workspace.recents.relocationPlaces = [
      { id: 'old', label: 'Old', latitude: 1, longitude: 2 },
      { id: 'kept', label: 'Kept', latitude: 3, longitude: 4 },
    ];
    const result = reconcileWorkspace(workspace, ['p1', 'p2'], ['kept']);
    expect(result.recents.primaryProfileIds).toEqual(['p1']);
    expect(result.recents.secondaryProfileIds).toEqual(['p2']);
    expect(result.recents.relocationPlaces.map(({ id }) => id)).toEqual(['kept']);
  });

  test('reads and writes only its key and tolerates storage failures', () => {
    const storage = memoryStorage();
    const value = defaultWesternWorkspace();
    value.recents.chartTypes = ['transit'];
    writeWesternWorkspace(storage, value);
    expect(readWesternWorkspace(storage).recents.chartTypes).toEqual(['transit']);
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe(WESTERN_WORKSPACE_KEY);

    const broken = {
      ...storage,
      getItem: vi.fn(() => { throw new Error('denied'); }),
      setItem: vi.fn(() => { throw new Error('denied'); }),
    } as Storage;
    expect(readWesternWorkspace(broken)).toEqual(defaultWesternWorkspace());
    expect(() => writeWesternWorkspace(broken, value)).not.toThrow();
  });
});
