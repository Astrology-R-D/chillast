import type { WesternChartAiContext } from '../../../api/contracts';
import type { ChartIdentity } from '../contracts';
import type { ChartRouteState } from '../../../stores/chartWorkspace';
import type { ExplorerRow } from '../explorer/explorerRows';

export interface WesternChartContextState {
  routeState: ChartRouteState;
  focusedIdentity: ChartIdentity | null;
  bulkSelection: readonly string[];
}

export interface WesternChartContextOptions {
  includeSelectedRows?: boolean;
  visibleRows?: readonly ExplorerRow[];
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
  const selected = new Set(state.bulkSelection);
  const selectedRows = options.includeSelectedRows
    ? (options.visibleRows ?? [])
      .filter((row) => selected.has(row.id))
      .map((row) => ({ id: row.id, values: { ...row.values } }))
    : undefined;
  return {
    kind: 'western-chart',
    resultId: result.resultId,
    chartType: accepted.type,
    subjects: result.subjects,
    successfulFilters: accepted,
    result,
    focusedIdentity: state.focusedIdentity,
    draftIsStale: routeState.isStale,
    draftSummary,
    ...(options.includeSelectedRows ? { selectedRows } : {}),
  };
}
