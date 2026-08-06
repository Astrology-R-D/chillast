import type { WesternChartAiContext } from '../../../api/contracts';
import type { ChartIdentity } from '../contracts';
import type { ChartRouteState } from '../../../stores/chartWorkspace';
import type { Profile } from '../../../api/contracts';
import type { ExplorerRow, MachineValue } from '../explorer/explorerRows';

const MAX_SELECTED_ROWS = 100;
const MAX_SELECTED_VALUES = 32;
const MAX_SELECTED_ROWS_BYTES = 64 * 1024;

export interface WesternChartContextState {
  routeState: ChartRouteState;
  focusedIdentity: ChartIdentity | null;
  bulkSelection: readonly string[];
}

export interface WesternChartContextOptions {
  profiles?: readonly Pick<Profile, 'id' | 'nameZh' | 'nameEn'>[];
  includeSelectedRows?: boolean;
  visibleRows?: readonly ExplorerRow[];
}

function profileSummary(id: string, profiles: WesternChartContextOptions['profiles']) {
  const profile = profiles?.find((candidate) => candidate.id === id);
  return { id, displayName: profile?.nameZh || profile?.nameEn || id };
}

function selectedRows(state: WesternChartContextState, options: WesternChartContextOptions) {
  const selected = new Set(state.bulkSelection);
  const rows: Array<{ id: string; values: Record<string, MachineValue> }> = [];
  for (const row of options.visibleRows ?? []) {
    if (rows.length >= MAX_SELECTED_ROWS) break;
    if (!selected.has(row.id) || !row.id || row.id.length > 256) continue;
    const values = Object.fromEntries(Object.entries(row.values)
      .filter(([key, value]) => key.length > 0 && key.length <= 256 && (
        value === null || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
        || (typeof value === 'string' && value.length <= 1024)
      ))
      .slice(0, MAX_SELECTED_VALUES)) as Record<string, MachineValue>;
    const candidate = [...rows, { id: row.id, values }];
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_SELECTED_ROWS_BYTES) continue;
    rows.push({ id: row.id, values });
  }
  return rows;
}

export function buildWesternChartAiContext(
  state: WesternChartContextState,
  options: WesternChartContextOptions = {},
): WesternChartAiContext | null {
  const { routeState } = state;
  const result = routeState.lastSuccessfulResult;
  const accepted = routeState.accepted;
  if (!result || !accepted) return null;
  const draft = routeState.draft;
  const draftSummary = routeState.isStale ? {
    label: 'uncalculated' as const,
    type: draft.type,
    houseSystem: draft.houseSystem,
    zodiac: draft.zodiac,
    ...(draft.targetLocal ? { targetLocal: draft.targetLocal } : {}),
    ...(Number.isFinite(draft.returnYear) ? { returnYear: draft.returnYear } : {}),
    ...(draft.relocationPlace?.label ? { relocationLabel: draft.relocationPlace.label } : {}),
  } : null;
  const primary = profileSummary(accepted.primaryProfileId, options.profiles);
  const secondary = accepted.secondaryProfileId ? profileSummary(accepted.secondaryProfileId, options.profiles) : null;
  return {
    kind: 'western-chart',
    route: accepted.route,
    resultId: result.resultId,
    chartType: accepted.type,
    activeProfile: primary,
    successfulFilters: {
      type: accepted.type,
      primary,
      secondary,
      settings: structuredClone(accepted.request.settings),
      options: structuredClone(accepted.request.options),
    },
    lastChartData: result,
    focusedIdentity: state.focusedIdentity,
    draftIsStale: routeState.isStale,
    draftSummary,
    ...(options.includeSelectedRows ? { selectedRows: selectedRows(state, options) } : {}),
  };
}
