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
    }, { profiles: [{ id: 'p1', nameZh: 'Primary', nameEn: '' }] as never });
    expect(context).toMatchObject({
      kind: 'western-chart', chartType: 'natal', resultId: 'result-a',
      draftIsStale: true,
      draftSummary: { label: 'uncalculated', type: 'natal', houseSystem: 'placidus', zodiac: 'sidereal' },
      route: 'personal', activeProfile: { id: 'p1', displayName: 'Primary' },
      successfulFilters: { type: 'natal', primary: { id: 'p1', displayName: 'Primary' }, settings: { zodiac: 'tropical' } },
    });
    expect(context?.lastChartData).toBe(resultA);
    expect(context).not.toHaveProperty('result');
    expect(JSON.stringify(context)).not.toMatch(/notes|tags|createdAt|updatedAt|birthData/);
  });

  it('returns null before success, clears stale summary on revert, and changes focus independently', () => {
    const store = createChartWorkspaceStore(storage());
    store.getState().initializeRoute('personal', draft);
    const state = () => ({ routeState: store.getState().routes.personal!, focusedIdentity: store.getState().focusedIdentity, bulkSelection: store.getState().bulkSelection });
    expect(buildWesternChartAiContext(state(), { profiles: [{ id: 'p1', nameZh: 'Primary' }] as never })).toBeNull();
    const sequence = store.getState().submit(snapshot)!;
    store.getState().acceptSuccess('personal', sequence, resultA, snapshot);
    store.getState().editDraft('personal', { zodiac: 'sidereal' });
    store.getState().editDraft('personal', draft);
    expect(buildWesternChartAiContext(state())).toMatchObject({ draftIsStale: false, draftSummary: null, focusedIdentity: null });
    store.getState().setFocus('natal:sun');
    expect(buildWesternChartAiContext(state())).toMatchObject({ resultId: 'result-a', focusedIdentity: 'natal:sun' });
  });

  it('omits selected rows by default and includes only requested visible selected machine rows', () => {
    const store = createChartWorkspaceStore(storage());
    store.getState().initializeRoute('personal', draft);
    const sequence = store.getState().submit(snapshot)!;
    store.getState().acceptSuccess('personal', sequence, resultA, snapshot);
    store.getState().setBulkSelection(['natal:sun', 'hidden', 'unselected']);
    const state = { routeState: store.getState().routes.personal!, focusedIdentity: null, bulkSelection: store.getState().bulkSelection };
    expect(buildWesternChartAiContext(state)).not.toHaveProperty('selectedRows');
    expect(buildWesternChartAiContext(state, { includeSelectedRows: false, visibleRows: [] })).not.toHaveProperty('selectedRows');
    const context = buildWesternChartAiContext(state, { includeSelectedRows: true, visibleRows: [
      { id: 'natal:sun', chartIdentity: 'natal:sun', values: { point: 'sun', longitude: 10, retrograde: false }, metadata: { private: true } },
      { id: 'visible-unselected', chartIdentity: null, values: { point: 'moon' } },
    ] });
    expect(context?.selectedRows).toEqual([{ id: 'natal:sun', values: { point: 'sun', longitude: 10, retrograde: false } }]);
    expect(JSON.stringify(context?.selectedRows)).not.toMatch(/metadata|private|chartIdentity/);
  });

  it('bounds selected rows and machine values', () => {
    const store = createChartWorkspaceStore(storage());
    store.getState().initializeRoute('personal', draft);
    const sequence = store.getState().submit(snapshot)!;
    store.getState().acceptSuccess('personal', sequence, resultA, snapshot);
    const visibleRows = Array.from({ length: 105 }, (_, index) => ({
      id: `row-${index}`, chartIdentity: null, values: {
        finite: index, text: 'value', invalidNumber: Number.POSITIVE_INFINITY,
        oversized: 'x'.repeat(1025), function: (() => null) as never,
      }, metadata: { private: true },
    }));
    const bulkSelection = visibleRows.map(({ id }) => id);
    const context = buildWesternChartAiContext({ routeState: store.getState().routes.personal!, focusedIdentity: null, bulkSelection }, {
      includeSelectedRows: true, visibleRows,
    });
    expect(context?.selectedRows).toHaveLength(100);
    expect(context?.selectedRows?.[0]).toEqual({ id: 'row-0', values: { finite: 0, text: 'value' } });
    const largeRows = Array.from({ length: 100 }, (_, index) => ({ id: `large-${index}`, chartIdentity: null, values: { payload: 'y'.repeat(1024) } }));
    const bounded = buildWesternChartAiContext({
      routeState: store.getState().routes.personal!, focusedIdentity: null, bulkSelection: largeRows.map(({ id }) => id),
    }, { includeSelectedRows: true, visibleRows: largeRows });
    expect(new TextEncoder().encode(JSON.stringify(bounded?.selectedRows)).byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(bounded?.selectedRows?.length).toBeLessThan(100);
  });
});
