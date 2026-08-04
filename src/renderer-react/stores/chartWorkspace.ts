import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { ChartIdentity, ChartRoute, ChartType, NormalizedChartResult, Zodiac } from '../features/charts/contracts';
import {
  structurallyEqual,
  type ChartDraft,
  type SubmittedChartSnapshot,
} from '../features/charts/workbench/chartDraft';
import {
  pushRecent,
  readWesternWorkspace,
  reconcileWorkspace,
  relocationRecentId,
  writeWesternWorkspace,
  type ComparisonMode,
  type ExplorerTab,
  type WesternChartWorkspaceV1,
} from './chartWorkspacePersistence';

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';
export type RequestFailureKind = 'parser' | 'ipc' | 'domain';
export interface ChartTransform { scale: number; x: number; y: number }
export interface LayerState {
  majorAspects: boolean;
  minorAspects: boolean;
  houses: boolean;
  labels: boolean;
  rings: Record<string, boolean>;
}

export interface ChartRouteState {
  draft: ChartDraft;
  submitted: SubmittedChartSnapshot | null;
  accepted: SubmittedChartSnapshot | null;
  lastSuccessfulResult: NormalizedChartResult | null;
  latestIssuedSequence: number;
  activeSequence: number | null;
  requestStatus: RequestStatus;
  requestFailureKind: RequestFailureKind | null;
  requestMessage: string | null;
  isStale: boolean;
  submittedDraft: ChartDraft | null;
  acceptedDraft: ChartDraft | null;
}

export interface ChartWorkspaceState {
  routes: Partial<Record<ChartRoute, ChartRouteState>>;
  workspace: WesternChartWorkspaceV1;
  focusedIdentity: ChartIdentity | null;
  hoverIdentity: ChartIdentity | null;
  layers: LayerState;
  transform: ChartTransform;
  activeTab: ExplorerTab;
  comparisonMode: ComparisonMode;
  bulkSelection: ChartIdentity[];
  aiContextSource: string | null;
  initializeRoute(route: ChartRoute, draft: ChartDraft, replace?: boolean): void;
  editDraft(route: ChartRoute, patch: Partial<ChartDraft>): void;
  resetDraft(route: ChartRoute, draft: ChartDraft): void;
  submit(snapshot: SubmittedChartSnapshot): number | null;
  acceptSuccess(route: ChartRoute, sequence: number, result: NormalizedChartResult, snapshot: SubmittedChartSnapshot): boolean;
  acceptFailure(route: ChartRoute, sequence: number, kind: RequestFailureKind, message: string): boolean;
  cancel(route: ChartRoute): void;
  setFocus(identity: ChartIdentity | null): void;
  setHover(identity: ChartIdentity | null): void;
  setLayers(patch: Partial<LayerState>): void;
  setTransform(transform: ChartTransform): void;
  setActiveTab(tab: ExplorerTab): void;
  setComparisonMode(mode: ComparisonMode): void;
  setBulkSelection(identities: ChartIdentity[]): void;
  setAiContextSource(source: string | null): void;
  setSplit(route: ChartRoute, orientation: 'horizontal' | 'vertical', value: [number, number]): void;
  clearRecent(key: keyof WesternChartWorkspaceV1['recents']): void;
  reconcileRecents(authority: {
    profileIds: readonly string[];
    chartTypes: readonly ChartType[];
    houseSystems: readonly string[];
    zodiacs: readonly Zodiac[];
    relocationIds: readonly string[];
  }): void;
}

const maySettle = (state: ChartRouteState, sequence: number) =>
  sequence === state.latestIssuedSequence
  && sequence === state.activeSequence
  && state.requestStatus === 'loading';

function initialRouteState(draft: ChartDraft): ChartRouteState {
  return {
    draft, submitted: null, accepted: null, lastSuccessfulResult: null,
    latestIssuedSequence: 0, activeSequence: null, requestStatus: 'idle',
    requestFailureKind: null, requestMessage: null, isStale: false,
    submittedDraft: null, acceptedDraft: null,
  };
}

function getBrowserStorage(): Storage {
  if (typeof window !== 'undefined') {
    try { return window.localStorage; } catch { /* fall through */ }
  }
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value),
  };
}

export function createChartWorkspaceStore(storage: Storage): StoreApi<ChartWorkspaceState> {
  const persisted = readWesternWorkspace(storage);
  return createStore<ChartWorkspaceState>((set, get) => {
    const persist = (workspace: WesternChartWorkspaceV1): void => {
      writeWesternWorkspace(storage, workspace);
      set({ workspace });
    };
    const updateRoute = (route: ChartRoute, update: (state: ChartRouteState) => ChartRouteState): void => {
      const current = get().routes[route];
      if (!current) return;
      set({ routes: { ...get().routes, [route]: update(current) } });
    };

    return {
      routes: {},
      workspace: persisted,
      focusedIdentity: null,
      hoverIdentity: null,
      layers: { majorAspects: true, minorAspects: false, houses: true, labels: true, rings: {} },
      transform: { scale: 1, x: 0, y: 0 },
      activeTab: 'planets',
      comparisonMode: 'merged',
      bulkSelection: [],
      aiContextSource: null,
      initializeRoute(route, draft, replace = false) {
        const existing = get().routes[route];
        if (existing && !replace) return;
        set({ routes: { ...get().routes, [route]: existing ? {
          ...existing,
          draft,
          isStale: Boolean(existing.lastSuccessfulResult && existing.acceptedDraft
            && !structurallyEqual(draft, existing.acceptedDraft)),
        } : initialRouteState(draft) } });
      },
      editDraft(route, patch) {
        updateRoute(route, (state) => {
          const draft = { ...state.draft, ...patch };
          return {
            ...state,
            draft,
            isStale: Boolean(state.lastSuccessfulResult && state.acceptedDraft
              && !structurallyEqual(draft, state.acceptedDraft)),
          };
        });
      },
      resetDraft(route, draft) {
        updateRoute(route, (state) => ({
          ...state,
          draft,
          isStale: Boolean(state.lastSuccessfulResult && state.acceptedDraft
            && !structurallyEqual(draft, state.acceptedDraft)),
        }));
      },
      submit(snapshot) {
        const route = snapshot.route;
        const state = get().routes[route];
        if (!state) return null;
        if (state.requestStatus === 'loading' && state.submitted && structurallyEqual(state.submitted, snapshot)) return null;
        const sequence = state.latestIssuedSequence + 1;
        updateRoute(route, (current) => ({
          ...current,
          submitted: snapshot,
          submittedDraft: structuredClone(current.draft),
          latestIssuedSequence: sequence,
          activeSequence: sequence,
          requestStatus: 'loading',
          requestFailureKind: null,
          requestMessage: null,
        }));
        return sequence;
      },
      acceptSuccess(route, sequence, result, snapshot) {
        const state = get().routes[route];
        if (!state || !maySettle(state, sequence)) return false;
        const acceptedDraft = state.submittedDraft ? structuredClone(state.submittedDraft) : structuredClone(state.draft);
        updateRoute(route, (current) => ({
          ...current,
          accepted: snapshot,
          acceptedDraft,
          lastSuccessfulResult: result,
          activeSequence: null,
          requestStatus: 'success',
          requestFailureKind: null,
          requestMessage: null,
          isStale: !structurallyEqual(current.draft, acceptedDraft),
        }));
        const recent = get().workspace.recents;
        const place = snapshot.request.options.latitude === undefined ? null : {
          id: relocationRecentId({ latitude: snapshot.request.options.latitude, longitude: snapshot.request.options.longitude! }),
          label: snapshot.request.options.locationLabel ?? '',
          latitude: snapshot.request.options.latitude,
          longitude: snapshot.request.options.longitude!,
        };
        persist({
          ...get().workspace,
          recents: {
            primaryProfileIds: pushRecent(recent.primaryProfileIds, snapshot.primaryProfileId),
            secondaryProfileIds: snapshot.secondaryProfileId
              ? pushRecent(recent.secondaryProfileIds, snapshot.secondaryProfileId) : recent.secondaryProfileIds,
            chartTypes: pushRecent(recent.chartTypes, snapshot.type),
            houseSystems: pushRecent(recent.houseSystems, snapshot.request.settings.houseSystem),
            zodiacs: pushRecent(recent.zodiacs, snapshot.request.settings.zodiac),
            relocationPlaces: place
              ? pushRecent(recent.relocationPlaces, place, ({ id }) => id) : recent.relocationPlaces,
          },
        });
        const focus = get().focusedIdentity;
        if (focus && !result.identities.includes(focus)) set({ focusedIdentity: null });
        return true;
      },
      acceptFailure(route, sequence, kind, message) {
        const state = get().routes[route];
        if (!state || !maySettle(state, sequence)) return false;
        updateRoute(route, (current) => ({
          ...current, activeSequence: null, requestStatus: 'error', requestFailureKind: kind, requestMessage: message,
        }));
        return true;
      },
      cancel(route) {
        updateRoute(route, (state) => state.requestStatus === 'loading' ? {
          ...state, activeSequence: null, requestStatus: 'cancelled', requestFailureKind: null, requestMessage: null,
        } : state);
      },
      setFocus: (focusedIdentity) => set({ focusedIdentity }),
      setHover: (hoverIdentity) => set({ hoverIdentity }),
      setLayers: (patch) => set({ layers: { ...get().layers, ...patch } }),
      setTransform: (transform) => set({ transform }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setComparisonMode: (comparisonMode) => set({ comparisonMode }),
      setBulkSelection: (bulkSelection) => set({ bulkSelection }),
      setAiContextSource: (aiContextSource) => set({ aiContextSource }),
      setSplit(route, orientation, value) {
        const workspace = get().workspace;
        persist({
          ...workspace,
          split: { ...workspace.split, [route]: { ...workspace.split[route], [orientation]: value } },
        });
      },
      clearRecent(key) {
        const workspace = get().workspace;
        persist({ ...workspace, recents: { ...workspace.recents, [key]: [] } });
      },
      reconcileRecents(authority) {
        const profilesAndPlaces = reconcileWorkspace(
          get().workspace,
          authority.profileIds,
          authority.relocationIds,
        );
        const chartTypes = new Set(authority.chartTypes);
        const houseSystems = new Set(authority.houseSystems);
        const zodiacs = new Set(authority.zodiacs);
        persist({
          ...profilesAndPlaces,
          recents: {
            ...profilesAndPlaces.recents,
            chartTypes: profilesAndPlaces.recents.chartTypes.filter((value) => chartTypes.has(value)),
            houseSystems: profilesAndPlaces.recents.houseSystems.filter((value) => houseSystems.has(value)),
            zodiacs: profilesAndPlaces.recents.zodiacs.filter((value) => zodiacs.has(value)),
          },
        });
      },
    };
  });
}

export const chartWorkspaceStore = createChartWorkspaceStore(getBrowserStorage());

const ChartWorkspaceContext = createContext<StoreApi<ChartWorkspaceState>>(chartWorkspaceStore);

export function ChartWorkspaceProvider({
  store,
  children,
}: { store: StoreApi<ChartWorkspaceState>; children: ReactNode }) {
  return createElement(ChartWorkspaceContext.Provider, { value: store }, children);
}

export function useChartWorkspaceStoreApi(): StoreApi<ChartWorkspaceState> {
  return useContext(ChartWorkspaceContext);
}

export function useChartWorkspace<T>(selector: (state: ChartWorkspaceState) => T): T {
  return useStore(useChartWorkspaceStoreApi(), selector);
}
