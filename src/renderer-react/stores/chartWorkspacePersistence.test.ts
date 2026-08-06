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
  sanitizeComparisonLayoutForMode,
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
    expect(workspace.tableLayouts.natal.tabs.planets.columnPinning.left).toEqual(['selected']);
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

  test('restores distinct layouts for all 20 exact chart types', () => {
    const source = defaultWesternWorkspace();
    CHART_TYPES.forEach((type, index) => {
      source.tableLayouts[type].tabs.planets.columnSizing.longitude = 100 + index;
    });
    const parsed = parseWesternWorkspace(source);
    expect(CHART_TYPES.map((type) => parsed.tableLayouts[type].tabs.planets.columnSizing.longitude))
      .toEqual(CHART_TYPES.map((_type, index) => 100 + index));
  });

  test('drops unknown entries and resets only a structurally invalid exact tab', () => {
    const source = defaultWesternWorkspace();
    source.recents.primaryProfileIds = ['p1'];
    source.split.personal.horizontal = [62, 38];
    source.tableLayouts.natal.tabs.planets.columnSizing.longitude = 123;
    source.tableLayouts.natal.tabs.houses.columnSizing.house = 77;
    source.tableLayouts.transit.tabs.planets.columnSizing.longitude = 234;
    source.tableLayouts.natal.tabs.planets.sorting = [{ id: 'unknown', desc: false }, { id: 'longitude', desc: true }];
    source.tableLayouts.natal.tabs.planets.columnVisibility.unknown = false;
    source.tableLayouts.natal.tabs.houses.columnOrder = ['house', 'house'];

    const parsed = parseWesternWorkspace(source);
    expect(parsed.tableLayouts.natal.tabs.planets).toMatchObject({
      sorting: [{ id: 'longitude', desc: true }],
      columnSizing: { longitude: 123 },
      columnVisibility: {},
    });
    expect(parsed.tableLayouts.natal.tabs.houses).toEqual(defaultTableLayout().tabs.houses);
    expect(parsed.tableLayouts.transit.tabs.planets.columnSizing.longitude).toBe(234);
    expect(parsed.recents.primaryProfileIds).toEqual(['p1']);
    expect(parsed.split.personal.horizontal).toEqual([62, 38]);
  });

  test('validates comparison columns against the saved exact mode and keeps selection pinned', () => {
    const source = defaultWesternWorkspace();
    source.tableLayouts.natal.comparisonMode = 'merged';
    source.tableLayouts.natal.tabs.comparison.sorting = [
      { id: 'secondLongitude', desc: true },
      { id: 'longitude', desc: false },
    ];
    source.tableLayouts.natal.tabs.comparison.columnPinning = { left: [], right: [] };

    const parsed = parseWesternWorkspace(source);

    expect(parsed.tableLayouts.natal.tabs.comparison.sorting).toEqual([{ id: 'longitude', desc: false }]);
    expect(parsed.tableLayouts.natal.tabs.comparison.columnPinning.left).toEqual(['selected']);
  });

  test('sanitizes comparison layout through merged, difference, side-by-side, and persistence reload', () => {
    const merged = defaultTableLayout().tabs.comparison;
    merged.sorting = [{ id: 'longitude', desc: true }];
    merged.filters = [{ id: 'sign', value: ['aries'] }];
    merged.columnOrder = ['selected', 'point', 'longitude', 'sign'];
    merged.columnPinning = { left: ['selected', 'longitude'], right: ['sign'] };
    merged.columnSizing = { longitude: 120, point: 90 };
    const difference = sanitizeComparisonLayoutForMode(merged, 'difference');
    expect(difference).toMatchObject({ sorting: [], filters: [], columnOrder: ['selected', 'point'], columnSizing: { point: 90 } });
    const side = sanitizeComparisonLayoutForMode({ ...difference, sorting: [{ id: 'longitudeDelta', desc: true }], columnSizing: { ...difference.columnSizing, longitudeDelta: 140 } }, 'sideBySide');
    expect(side.sorting).toEqual([]);
    expect(side.columnSizing).not.toHaveProperty('longitudeDelta');
    const source = defaultWesternWorkspace();
    source.tableLayouts.natal.comparisonMode = 'sideBySide'; source.tableLayouts.natal.tabs.comparison = side;
    expect(parseWesternWorkspace(source).tableLayouts.natal.tabs.comparison).toEqual(side);
  });

  test.each([
    ['negative size', -1, { id: 'point', value: 'sun' }],
    ['excessive size', 481, { id: 'point', value: 'sun' }],
    ['malformed numeric filter', 120, { id: 'longitude', value: 'wide' }],
    ['malformed boolean filter', 120, { id: 'retrograde', value: 'yes' }],
    ['malformed token filter', 120, { id: 'sign', value: [1, 2] }],
  ])('resets only the exact tab for %s', (_label, size, filter) => {
    const source = defaultWesternWorkspace();
    source.tableLayouts.natal.tabs.planets.columnSizing.longitude = size;
    source.tableLayouts.natal.tabs.planets.filters = [filter];
    source.tableLayouts.natal.tabs.houses.columnSizing.house = 88;
    source.tableLayouts.transit.tabs.planets.columnSizing.longitude = 144;

    const parsed = parseWesternWorkspace(source);

    expect(parsed.tableLayouts.natal.tabs.planets).toEqual(defaultTableLayout().tabs.planets);
    expect(parsed.tableLayouts.natal.tabs.houses.columnSizing.house).toBe(88);
    expect(parsed.tableLayouts.transit.tabs.planets.columnSizing.longitude).toBe(144);
  });

  test('retains valid bounded sizes and typed filter payloads', () => {
    const source = defaultWesternWorkspace();
    source.tableLayouts.natal.tabs.planets.columnSizing = { point: 48, longitude: 480 };
    source.tableLayouts.natal.tabs.planets.filters = [
      { id: 'longitude', value: [0, 30] },
      { id: 'retrograde', value: false },
      { id: 'sign', value: ['aries', 'taurus'] },
      { id: 'point', value: 'sun' },
    ];

    expect(parseWesternWorkspace(source).tableLayouts.natal.tabs.planets).toMatchObject({
      columnSizing: { point: 48, longitude: 480 },
      filters: source.tableLayouts.natal.tabs.planets.filters,
    });
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

  test('reconciles profile IDs while retaining, sanitizing, deduplicating, and bounding places', () => {
    const workspace = defaultWesternWorkspace();
    workspace.recents.primaryProfileIds = ['deleted', 'p1'];
    workspace.recents.secondaryProfileIds = ['p2', 'deleted'];
    workspace.recents.relocationPlaces = [
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `${index.toFixed(6)}:${index.toFixed(6)}`, label: `Place ${index}`, latitude: index, longitude: index,
      })),
      { id: '0.000000:0.000000', label: 'Duplicate', latitude: 0, longitude: 0 },
      { id: 'malformed', label: '', latitude: Number.NaN, longitude: 2 },
    ];
    const result = reconcileWorkspace(workspace, ['p1', 'p2']);
    expect(result.recents.primaryProfileIds).toEqual(['p1']);
    expect(result.recents.secondaryProfileIds).toEqual(['p2']);
    expect(result.recents.relocationPlaces).toHaveLength(8);
    expect(result.recents.relocationPlaces[0]).toMatchObject({ id: '0.000000:0.000000', label: 'Place 0' });
    expect(result.recents.relocationPlaces.some(({ id }) => id === 'malformed')).toBe(false);
  });

  test('parsing prunes malformed places without resetting valid sibling histories', () => {
    const workspace = defaultWesternWorkspace();
    workspace.recents.primaryProfileIds = ['p1'];
    const parsed = parseWesternWorkspace({ ...workspace, recents: { ...workspace.recents, relocationPlaces: [
      { id: '31.230400:121.473700', label: 'Shanghai', latitude: 31.2304, longitude: 121.4737 },
      { id: 'bad', label: 'Bad', latitude: Number.POSITIVE_INFINITY, longitude: 0 },
    ] } });
    expect(parsed.recents.primaryProfileIds).toEqual(['p1']);
    expect(parsed.recents.relocationPlaces).toEqual([
      { id: '31.230400:121.473700', label: 'Shanghai', latitude: 31.2304, longitude: 121.4737 },
    ]);
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
