import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient, ChartBoundaryError } from '../../../api/client';
import type { Profile } from '../../../api/contracts';
import type { ChartReferenceData, NormalizedChartResult } from '../contracts';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import { CHART_TYPES } from '../contracts';
import { CHART_DESCRIPTORS } from '../catalog';
import { DEFAULT_ASPECTS, createDefaultDraft, type DraftEnvironment } from './chartDraft';
import { useChartCalculation } from './chartCalculation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const profile = (id: string): Profile => ({
  id, nameZh: id, nameEn: id, gender: 'other', notes: '', tags: [],
  birthData: { year: 2000, month: 1, day: 1, hour: 0, minute: 0, location: { label: 'City', latitude: 1, longitude: 2 } },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const reference = {
  aspects: Object.fromEntries(DEFAULT_ASPECTS.map((key) => [key, { nameEn: key, nameZh: key, angle: 0, defaultOrb: 5, level: 'major', glyph: key }])),
  houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: 'P' }], signs: [], points: {}, elements: {}, modalities: {},
  chartTypes: CHART_TYPES.map((type) => ({ type, nameEn: type, nameZh: type, category: CHART_DESCRIPTORS[type].route, requiresSecondary: CHART_DESCRIPTORS[type].requiresSecondary, options: [...CHART_DESCRIPTORS[type].serviceOptions] })),
} as unknown as ChartReferenceData;
const environment: DraftEnvironment = {
  now: new Date(2026, 7, 2, 12, 34), profiles: [profile('p1'), profile('p2')], reference,
  persistedPrimaryId: 'p1', recentSecondaryIds: ['p2'], toInstant: (value) => `${value}:00.000Z`,
};
const result = (id: string) => ({ resultId: id, identities: [] } as unknown as NormalizedChartResult);

function setup() {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null, removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;
  const store = createChartWorkspaceStore(storage);
  store.getState().initializeRoute('personal', createDefaultDraft('personal', environment));
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ChartWorkspaceProvider store={store}>{children}</ChartWorkspaceProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useChartCalculation('personal', environment), { wrapper });
  return { hook, store };
}

beforeEach(() => vi.restoreAllMocks());

describe('chart calculation coordination', () => {
  test('commits only B when overlapping B then A settle', async () => {
    const a = deferred<NormalizedChartResult>();
    const b = deferred<NormalizedChartResult>();
    const compute = vi.spyOn(apiClient, 'computeChart').mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { hook, store } = setup();
    act(() => hook.result.current.calculate());
    act(() => store.getState().editDraft('personal', { zodiac: 'sidereal' }));
    act(() => hook.result.current.calculate());
    await waitFor(() => expect(compute).toHaveBeenCalledTimes(2));
    await act(async () => b.resolve(result('b')));
    await waitFor(() => expect(store.getState().routes.personal!.lastSuccessfulResult?.resultId).toBe('b'));
    await act(async () => a.resolve(result('a')));
    expect(store.getState().routes.personal!.lastSuccessfulResult?.resultId).toBe('b');
  });

  test('cancel ignores every late settlement and edits never compute', async () => {
    const a = deferred<NormalizedChartResult>();
    const compute = vi.spyOn(apiClient, 'computeChart').mockReturnValue(a.promise);
    const { hook, store } = setup();
    act(() => store.getState().editDraft('personal', { returnYear: 2027 }));
    expect(compute).not.toHaveBeenCalled();
    act(() => hook.result.current.calculate());
    act(() => hook.result.current.cancel());
    await act(async () => a.resolve(result('late')));
    expect(store.getState().routes.personal).toMatchObject({ requestStatus: 'cancelled', lastSuccessfulResult: null });
  });

  test('retains success on failure and retry issues a new sequence', async () => {
    vi.spyOn(apiClient, 'computeChart')
      .mockResolvedValueOnce(result('kept'))
      .mockRejectedValueOnce(new ChartBoundaryError('domain', 'bad request'))
      .mockResolvedValueOnce(result('retried'));
    const { hook, store } = setup();
    act(() => hook.result.current.calculate());
    await waitFor(() => expect(store.getState().routes.personal!.requestStatus).toBe('success'));
    act(() => hook.result.current.calculate());
    await waitFor(() => expect(store.getState().routes.personal!.requestStatus).toBe('error'));
    expect(store.getState().routes.personal!.lastSuccessfulResult?.resultId).toBe('kept');
    act(() => hook.result.current.retry());
    await waitFor(() => expect(store.getState().routes.personal!.lastSuccessfulResult?.resultId).toBe('retried'));
    expect(store.getState().routes.personal!.latestIssuedSequence).toBe(3);
  });

  test('an edit during a request makes its accepted immutable snapshot stale', async () => {
    const pending = deferred<NormalizedChartResult>();
    vi.spyOn(apiClient, 'computeChart').mockReturnValue(pending.promise);
    const { hook, store } = setup();
    act(() => hook.result.current.calculate());
    act(() => store.getState().editDraft('personal', { zodiac: 'sidereal' }));
    await act(async () => pending.resolve(result('a')));
    await waitFor(() => expect(store.getState().routes.personal!.requestStatus).toBe('success'));
    expect(store.getState().routes.personal!.isStale).toBe(true);
    expect(store.getState().routes.personal!.accepted!.request.settings.zodiac).toBe('tropical');
  });

  test.each([
    ['parser', new ChartBoundaryError('parser', 'malformed')],
    ['ipc', new Error('unexpected')],
  ] as const)('maps %s failures without committing malformed data', async (kind, error) => {
    vi.spyOn(apiClient, 'computeChart').mockRejectedValue(error);
    const { hook, store } = setup();
    act(() => hook.result.current.calculate());
    await waitFor(() => expect(store.getState().routes.personal!.requestStatus).toBe('error'));
    expect(store.getState().routes.personal).toMatchObject({ requestFailureKind: kind, lastSuccessfulResult: null });
  });
});
