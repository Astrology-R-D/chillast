import { useMutation } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { apiClient, ChartBoundaryError } from '../../../api/client';
import {
  useChartWorkspaceStoreApi,
  type RequestFailureKind,
} from '../../../stores/chartWorkspace';
import type { ChartRoute } from '../contracts';
import {
  buildSubmittedSnapshot,
  structurallyEqual,
  type DraftEnvironment,
  type SubmittedChartSnapshot,
} from './chartDraft';

export interface ChartCalculationController {
  calculate(): void;
  retry(): void;
  cancel(): void;
  isEquivalentInFlight: boolean;
}

interface MutationInput {
  sequence: number;
  snapshot: SubmittedChartSnapshot;
}

export function useChartCalculation(
  route: ChartRoute,
  environment: DraftEnvironment,
): ChartCalculationController {
  const store = useChartWorkspaceStoreApi();
  const routeState = useStore(store, (state) => state.routes[route]);
  const mutation = useMutation({
    mutationFn: ({ snapshot }: MutationInput) => apiClient.computeChart(snapshot.request),
    onSuccess(result, { sequence, snapshot }) {
      store.getState().acceptSuccess(route, sequence, result, snapshot);
    },
    onError(error, { sequence }) {
      const kind: RequestFailureKind = error instanceof ChartBoundaryError ? error.kind : 'ipc';
      const message = error instanceof ChartBoundaryError ? error.message : '星盘请求失败';
      store.getState().acceptFailure(route, sequence, kind, message);
    },
  });

  const calculate = (): void => {
    const current = store.getState().routes[route];
    if (!current) return;
    let snapshot: SubmittedChartSnapshot;
    try {
      snapshot = buildSubmittedSnapshot(current.draft, environment);
    } catch {
      return;
    }
    const sequence = store.getState().submit(snapshot);
    if (sequence === null) return;
    mutation.reset();
    mutation.mutate({ sequence, snapshot });
  };

  return {
    calculate,
    retry: calculate,
    cancel() {
      store.getState().cancel(route);
      mutation.reset();
    },
    isEquivalentInFlight: Boolean(
      routeState?.requestStatus === 'loading'
      && routeState.submittedDraft
      && structurallyEqual(routeState.draft, routeState.submittedDraft),
    ),
  };
}
