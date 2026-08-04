import { describe, expect, it } from 'vitest';
import type { NormalizedChartResult } from '../contracts';
import { twoRingResult } from '../svg/chartTestFixtures';
import { createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import type { ChartDraft, SubmittedChartSnapshot } from '../workbench/chartDraft';
import { buildWesternChartAiContext } from './chartAiContext';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

const draft = {
  route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
  targetLocal: '2026-08-02T12:34', returnYear: 2026, relocationPlace: null,
  houseSystem: 'placidus', zodiac: 'tropical', enabledAspects: [], orbOverrides: {},
} satisfies ChartDraft;
const snapshot = {
  route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
  request: { type: 'natal', primary: { id: 'p1' }, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
} as unknown as SubmittedChartSnapshot;
const resultA = { ...twoRingResult, resultId: 'result-a', meta: { ...twoRingResult.meta, type: 'natal' } } as NormalizedChartResult;

describe('last-successful western chart AI context', () => {
  it('publishes only accepted success through draft, failure, cancel, late, and parser lifecycles', () => {
    const store = createChartWorkspaceStore(storage());
    store.getState().initializeRoute('personal', draft);
    const a = store.getState().submit(snapshot)!;
    store.getState().acceptSuccess('personal', a, resultA, snapshot);
    store.getState().editDraft('personal', { zodiac: 'sidereal' });
    const sidereal = { ...snapshot, request: { ...snapshot.request, settings: { ...snapshot.request.settings, zodiac: 'sidereal' as const } } };
    const b = store.getState().submit(sidereal)!;
    store.getState().acceptFailure('personal', b, 'domain', 'failed B');
    const c = store.getState().submit(sidereal)!;
    store.getState().cancel('personal');
    store.getState().acceptSuccess('personal', c, { ...resultA, resultId: 'late-c' }, sidereal);
    const e = store.getState().submit(sidereal)!;
    store.getState().acceptFailure('personal', e, 'parser', 'malformed E');

    const context = buildWesternChartAiContext({
      routeState: store.getState().routes.personal!,
      focusedIdentity: store.getState().focusedIdentity,
      bulkSelection: store.getState().bulkSelection,
    });
    expect(context).toMatchObject({
      kind: 'western-chart', chartType: 'natal', resultId: 'result-a',
      draftIsStale: true,
      draftSummary: { label: 'uncalculated', type: 'natal', houseSystem: 'placidus', zodiac: 'sidereal' },
      successfulFilters: { request: { settings: { zodiac: 'tropical' } } },
    });
    expect(context?.result).toBe(resultA);
  });

  it('returns null before success, clears stale summary on revert, and changes focus independently', () => {
    const store = createChartWorkspaceStore(storage());
    store.getState().initializeRoute('personal', draft);
    const state = () => ({ routeState: store.getState().routes.personal!, focusedIdentity: store.getState().focusedIdentity, bulkSelection: store.getState().bulkSelection });
    expect(buildWesternChartAiContext(state())).toBeNull();
    const sequence = store.getState().submit(snapshot)!;
    store.getState().acceptSuccess('personal', sequence, resultA, snapshot);
    store.getState().editDraft('personal', { zodiac: 'sidereal' });
    store.getState().editDraft('personal', draft);
    expect(buildWesternChartAiContext(state())).toMatchObject({ draftIsStale: false, draftSummary: null, focusedIdentity: null });
    store.getState().setFocus('natal:sun');
    expect(buildWesternChartAiContext(state())).toMatchObject({ resultId: 'result-a', focusedIdentity: 'natal:sun' });
  });

  it('includes only requested selected machine rows without replacing result identity', () => {
    const store = createChartWorkspaceStore(storage());
    store.getState().initializeRoute('personal', draft);
    const sequence = store.getState().submit(snapshot)!;
    store.getState().acceptSuccess('personal', sequence, resultA, snapshot);
    store.getState().setBulkSelection(['natal:sun']);
    const state = { routeState: store.getState().routes.personal!, focusedIdentity: null, bulkSelection: ['natal:sun'] };
    expect(buildWesternChartAiContext(state)).not.toHaveProperty('selectedRows');
    expect(buildWesternChartAiContext(state, { includeSelectedRows: true, visibleRows: [
      { id: 'natal:sun', chartIdentity: 'natal:sun', values: { point: 'sun', longitude: 10 }, metadata: { component: () => null } },
    ] })).toMatchObject({
      resultId: 'result-a',
      selectedRows: [{ id: 'natal:sun', values: { point: 'sun', longitude: 10 } }],
    });
  });
});
