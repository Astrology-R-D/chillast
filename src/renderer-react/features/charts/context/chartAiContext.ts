import type { WesternChartAiContext } from '../../../api/contracts';
import type { ChartIdentity } from '../contracts';
import type { ChartRouteState } from '../../../stores/chartWorkspace';
import type { Profile } from '../../../api/contracts';

export interface WesternChartContextState {
  routeState: ChartRouteState;
  focusedIdentity: ChartIdentity | null;
}

export interface WesternChartContextOptions {
  profiles?: readonly Pick<Profile, 'id' | 'nameZh' | 'nameEn'>[];
}

function profileSummary(id: string, profiles: WesternChartContextOptions['profiles']) {
  const profile = profiles?.find((candidate) => candidate.id === id);
  return { id, displayName: profile?.nameZh || profile?.nameEn || id };
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
  };
}
