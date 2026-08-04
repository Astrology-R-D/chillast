import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { apiClient } from '../../../api/client';
import { useProfiles } from '../../profiles/profileQueries';
import { profileWorkspaceStore } from '../../../stores/profileWorkspace';
import { useChartWorkspaceStoreApi } from '../../../stores/chartWorkspace';
import { CHART_DESCRIPTORS } from '../catalog';
import type { ChartReferenceData, ChartRoute } from '../contracts';
import { ChartFilterBand } from './ChartFilterBand';
import { ChartResultShell } from './ChartResultShell';
import { useChartCalculation } from './chartCalculation';
import { createDefaultDraft, structurallyEqual, validateChartDraft, type DraftEnvironment } from './chartDraft';

const EMPTY_REFERENCE: ChartReferenceData = {
  signs: [], points: {}, aspects: {},
  elements: {} as ChartReferenceData['elements'], modalities: {} as ChartReferenceData['modalities'],
  houseSystems: [], chartTypes: [],
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ChartWorkbenchPage({ route }: { route: ChartRoute }) {
  const store = useChartWorkspaceStoreApi();
  const routeState = useStore(store, (state) => state.routes[route]);
  const persistedPrimaryId = useStore(profileWorkspaceStore, (state) => state.primaryProfileId);
  const profileRecents = useStore(profileWorkspaceStore, (state) => state.recentUses);
  const profilesQuery = useProfiles();
  const catalogQuery = useQuery({ queryKey: ['western-chart-catalog'], queryFn: apiClient.getChartCatalog });
  const referenceQuery = useQuery({ queryKey: ['western-chart-reference'], queryFn: apiClient.getChartReference });
  const profiles = profilesQuery.data ?? [];
  const reference = referenceQuery.data ?? EMPTY_REFERENCE;
  const recentSecondaryIds = Object.entries(profileRecents).sort((left, right) => right[1] - left[1]).map(([id]) => id);
  const environment: DraftEnvironment = {
    now: new Date(), profiles, reference, persistedPrimaryId, recentSecondaryIds,
    toInstant(local) {
      const instant = new Date(local);
      if (!Number.isFinite(instant.getTime())) throw new Error('目标日期时间无效');
      return instant.toISOString();
    },
  };

  useEffect(() => {
    if (!profilesQuery.isSuccess || !catalogQuery.isSuccess || !referenceQuery.isSuccess) return;
    const current = store.getState().routes[route];
    const intent = profileWorkspaceStore.getState().chartIntent;
    let nextDraft = current?.draft ?? createDefaultDraft(route, environment);
    const applicableIntent = intent
      && intent.route === route
      && profiles.some(({ id }) => id === intent.primaryProfileId)
      && CHART_DESCRIPTORS[intent.chartType].route === route
      ? intent
      : null;
    if (applicableIntent) {
      nextDraft = { ...nextDraft, type: applicableIntent.chartType, primaryProfileId: applicableIntent.primaryProfileId };
    }
    try {
      store.getState().initializeRoute(route, nextDraft, Boolean(current && applicableIntent));
    } catch {
      return;
    }
    if (!applicableIntent) return;
    const applied = store.getState().routes[route]?.draft;
    if (applied && structurallyEqual(
      { type: applied.type, primaryProfileId: applied.primaryProfileId },
      { type: applicableIntent.chartType, primaryProfileId: applicableIntent.primaryProfileId },
    )) profileWorkspaceStore.getState().consumeChartIntent();
  }, [profilesQuery.isSuccess, catalogQuery.isSuccess, referenceQuery.isSuccess, profiles, reference, route, store]);

  const calculation = useChartCalculation(route, environment);
  const validation = routeState
    ? validateChartDraft(routeState.draft, environment)
    : { valid: false, fieldErrors: {} };
  const startupError = profilesQuery.error ?? catalogQuery.error ?? referenceQuery.error;

  if (!routeState) {
    return <section className="chart-workbench">
      <div className="chart-filter-band" role="group" aria-label="星盘筛选" />
      <section className="chart-result"><header className="chart-result__header"><div role="status" aria-live="polite">
        {startupError ? `星盘目录加载失败：${errorMessage(startupError)}` : '正在加载星盘筛选…'}
      </div></header></section>
    </section>;
  }

  return <section className="chart-workbench">
    <ChartFilterBand route={route} draft={routeState.draft} profiles={profiles} reference={reference}
      validation={validation} status={routeState.requestStatus} equivalentInFlight={calculation.isEquivalentInFlight}
      onPatch={(patch) => store.getState().editDraft(route, patch)} onCalculate={calculation.calculate}
      onReset={() => store.getState().resetDraft(route, createDefaultDraft(route, environment))}
      onCancel={calculation.cancel} />
    <ChartResultShell route={route} state={routeState} profilesAvailable={profiles.length > 0}
      validDraft={validation.valid} startupError={startupError ? `星盘目录加载失败：${errorMessage(startupError)}` : null}
      onRetry={calculation.retry} onCancel={calculation.cancel} />
  </section>;
}
