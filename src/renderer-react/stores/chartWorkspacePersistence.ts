import { z } from 'zod';
import type { GeoLocation } from '../api/contracts';
import { CHART_TYPES, type ChartType, type Zodiac } from '../features/charts/contracts';
import { allowedColumnIds } from '../features/charts/explorer/explorerColumns';

export type ExplorerTab = 'planets' | 'houses' | 'aspects' | 'distributions' | 'comparison';
export type ComparisonMode = 'merged' | 'sideBySide' | 'difference';

export interface TabLayoutV1 {
  sorting: Array<{ id: string; desc: boolean }>;
  filters: Array<{ id: string; value: unknown }>;
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: { left: string[]; right: string[] };
  columnSizing: Record<string, number>;
}

export interface ChartTableLayoutV1 {
  version: 1;
  activeTab: ExplorerTab;
  comparisonMode: ComparisonMode;
  tabs: Record<ExplorerTab, TabLayoutV1>;
}

export interface RelocationRecent {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface WesternChartWorkspaceV1 {
  schema: 'western-chart-workspace';
  version: 1;
  recents: {
    primaryProfileIds: string[];
    secondaryProfileIds: string[];
    chartTypes: ChartType[];
    houseSystems: string[];
    zodiacs: Zodiac[];
    relocationPlaces: RelocationRecent[];
  };
  split: {
    personal: { horizontal: [number, number]; vertical: [number, number] };
    relationship: { horizontal: [number, number]; vertical: [number, number] };
  };
  tableLayouts: Record<ChartType, ChartTableLayoutV1>;
}

export const WESTERN_WORKSPACE_KEY = 'chillast.westernChartWorkspace';
const EXPLORER_TABS = ['planets', 'houses', 'aspects', 'distributions', 'comparison'] as const;

const finiteNumber = z.number().finite();
const splitTuple = z.tuple([finiteNumber, finiteNumber]);
const tabLayoutSchema = z.object({
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })),
  filters: z.array(z.object({ id: z.string(), value: z.unknown() })),
  columnOrder: z.array(z.string()),
  columnVisibility: z.record(z.string(), z.boolean()),
  columnPinning: z.object({ left: z.array(z.string()), right: z.array(z.string()) }),
  columnSizing: z.record(z.string(), finiteNumber),
});
const tableLayoutSchema = z.object({
  version: z.literal(1),
  activeTab: z.enum(EXPLORER_TABS),
  comparisonMode: z.enum(['merged', 'sideBySide', 'difference']),
  tabs: z.object(Object.fromEntries(EXPLORER_TABS.map((tab) => [tab, tabLayoutSchema])) as Record<ExplorerTab, typeof tabLayoutSchema>),
});
const relocationRecentSchema = z.object({
  id: z.string(),
  label: z.string(),
  latitude: finiteNumber.min(-90).max(90),
  longitude: finiteNumber.min(-180).max(180),
}).strict();
const recentsSchema = z.object({
  primaryProfileIds: z.array(z.string()).max(8),
  secondaryProfileIds: z.array(z.string()).max(8),
  chartTypes: z.array(z.enum(CHART_TYPES)).max(8),
  houseSystems: z.array(z.string()).max(8),
  zodiacs: z.array(z.enum(['tropical', 'sidereal'])).max(8),
  relocationPlaces: z.array(relocationRecentSchema).max(8),
});
const splitSchema = z.object({
  personal: z.object({ horizontal: splitTuple, vertical: splitTuple }),
  relationship: z.object({ horizontal: splitTuple, vertical: splitTuple }),
});

export function defaultTabLayout(): TabLayoutV1 {
  return {
    sorting: [],
    filters: [],
    columnOrder: [],
    columnVisibility: {},
    columnPinning: { left: [], right: [] },
    columnSizing: {},
  };
}

function sanitizeTabLayout(value: unknown, allowed: ReadonlySet<string>): TabLayoutV1 {
  const parsed = tabLayoutSchema.safeParse(value);
  if (!parsed.success) return defaultTabLayout();
  const layout = parsed.data;
  if (new Set(layout.columnOrder).size !== layout.columnOrder.length) return defaultTabLayout();
  if (layout.columnPinning.left.some((id) => layout.columnPinning.right.includes(id))) return defaultTabLayout();
  const keep = (id: string) => allowed.has(id);
  return {
    sorting: layout.sorting.filter(({ id }) => keep(id)),
    filters: layout.filters.filter(({ id }) => keep(id)).map((entry) => ({ id: entry.id, value: entry.value })),
    columnOrder: layout.columnOrder.filter(keep),
    columnVisibility: Object.fromEntries(Object.entries(layout.columnVisibility).filter(([id]) => keep(id))),
    columnPinning: {
      left: layout.columnPinning.left.filter(keep),
      right: layout.columnPinning.right.filter(keep),
    },
    columnSizing: Object.fromEntries(Object.entries(layout.columnSizing).filter(([id]) => keep(id))),
  };
}

function parseTableLayout(value: unknown): ChartTableLayoutV1 {
  const parsed = tableLayoutSchema.pick({ version: true, activeTab: true, comparisonMode: true }).safeParse(value);
  if (!parsed.success || !value || typeof value !== 'object' || Array.isArray(value)) return defaultTableLayout();
  const source = value as Record<string, unknown>;
  const tabs = source.tabs && typeof source.tabs === 'object' && !Array.isArray(source.tabs)
    ? source.tabs as Record<string, unknown>
    : {};
  const allowed = allowedColumnIds();
  return {
    ...parsed.data,
    tabs: Object.fromEntries(EXPLORER_TABS.map((tab) => [
      tab,
      sanitizeTabLayout(tabs[tab], allowed[tab]),
    ])) as Record<ExplorerTab, TabLayoutV1>,
  };
}

export function defaultTableLayout(): ChartTableLayoutV1 {
  return {
    version: 1,
    activeTab: 'planets',
    comparisonMode: 'merged',
    tabs: Object.fromEntries(EXPLORER_TABS.map((tab) => [tab, defaultTabLayout()])) as Record<ExplorerTab, TabLayoutV1>,
  };
}

export function defaultWesternWorkspace(): WesternChartWorkspaceV1 {
  return {
    schema: 'western-chart-workspace',
    version: 1,
    recents: {
      primaryProfileIds: [], secondaryProfileIds: [], chartTypes: [], houseSystems: [],
      zodiacs: [], relocationPlaces: [],
    },
    split: {
      personal: { horizontal: [50, 50], vertical: [55, 45] },
      relationship: { horizontal: [50, 50], vertical: [55, 45] },
    },
    tableLayouts: Object.fromEntries(
      CHART_TYPES.map((type) => [type, defaultTableLayout()]),
    ) as Record<ChartType, ChartTableLayoutV1>,
  };
}

export function parseWesternWorkspace(value: unknown): WesternChartWorkspaceV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultWesternWorkspace();
  const source = value as Record<string, unknown>;
  if (source.schema !== 'western-chart-workspace' || source.version !== 1) return defaultWesternWorkspace();
  const defaults = defaultWesternWorkspace();
  const recentsSource = source.recents && typeof source.recents === 'object' && !Array.isArray(source.recents)
    ? source.recents as Record<string, unknown>
    : {};
  const parsedRecents = recentsSchema.safeParse({
    ...recentsSource,
    relocationPlaces: sanitizeRelocationRecents(recentsSource.relocationPlaces),
  });
  const parsedSplit = splitSchema.safeParse(source.split);
  const layouts = source.tableLayouts && typeof source.tableLayouts === 'object' && !Array.isArray(source.tableLayouts)
    ? source.tableLayouts as Record<string, unknown>
    : {};

  return {
    schema: defaults.schema,
    version: defaults.version,
    recents: parsedRecents.success ? parsedRecents.data : defaults.recents,
    split: parsedSplit.success ? parsedSplit.data : defaults.split,
    tableLayouts: Object.fromEntries(CHART_TYPES.map((type) => {
      return [type, parseTableLayout(layouts[type])];
    })) as Record<ChartType, ChartTableLayoutV1>,
  };
}

export function pushRecent<T>(
  values: readonly T[],
  value: T,
  identity: (value: T) => string = (entry) => String(entry),
): T[] {
  const valueId = identity(value);
  return [value, ...values.filter((entry) => identity(entry) !== valueId)].slice(0, 8);
}

export function relocationRecentId(place: Pick<GeoLocation, 'latitude' | 'longitude'>): string {
  return `${place.latitude.toFixed(6)}:${place.longitude.toFixed(6)}`;
}

function sanitizeRelocationRecents(value: unknown): RelocationRecent[] {
  if (!Array.isArray(value)) return [];
  const places: RelocationRecent[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const parsed = relocationRecentSchema.safeParse(candidate);
    if (!parsed.success || !parsed.data.label.trim()) continue;
    const id = relocationRecentId(parsed.data);
    if (parsed.data.id !== id || ids.has(id)) continue;
    ids.add(id);
    places.push(parsed.data);
    if (places.length === 8) break;
  }
  return places;
}

export function reconcileWorkspace(
  workspace: WesternChartWorkspaceV1,
  profileIds: readonly string[],
): WesternChartWorkspaceV1 {
  const profiles = new Set(profileIds);
  return {
    ...workspace,
    recents: {
      ...workspace.recents,
      primaryProfileIds: workspace.recents.primaryProfileIds.filter((id) => profiles.has(id)),
      secondaryProfileIds: workspace.recents.secondaryProfileIds.filter((id) => profiles.has(id)),
      relocationPlaces: sanitizeRelocationRecents(workspace.recents.relocationPlaces),
    },
  };
}

export function readWesternWorkspace(storage: Storage): WesternChartWorkspaceV1 {
  try {
    const serialized = storage.getItem(WESTERN_WORKSPACE_KEY);
    return serialized === null ? defaultWesternWorkspace() : parseWesternWorkspace(JSON.parse(serialized));
  } catch {
    return defaultWesternWorkspace();
  }
}

export function writeWesternWorkspace(storage: Storage, value: WesternChartWorkspaceV1): void {
  try {
    storage.setItem(WESTERN_WORKSPACE_KEY, JSON.stringify(value));
  } catch {
    // In-memory state remains authoritative when persistence is unavailable.
  }
}
