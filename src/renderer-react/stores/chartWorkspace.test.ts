import { describe, expect, test } from 'vitest';
import type { NormalizedChartResult } from '../features/charts/contracts';
import type { ChartDraft, SubmittedChartSnapshot } from '../features/charts/workbench/chartDraft';
import { defaultWesternWorkspace } from './chartWorkspacePersistence';
import { createChartWorkspaceStore } from './chartWorkspace';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value),
  };
}

const draftA = {
  route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
  targetLocal: '2026-08-02T12:34', returnYear: 2026, relocationPlace: null,
  houseSystem: 'placidus', zodiac: 'tropical', enabledAspects: ['conjunction'], orbOverrides: {},
} satisfies ChartDraft;
const snapshotA = {
  route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
  request: { type: 'natal', primary: { id: 'p1' }, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: ['conjunction'], orbOverrides: {} } }, options: {} },
} as SubmittedChartSnapshot;
const resultA = { resultId: 'a', identities: ['ring:a'] } as unknown as NormalizedChartResult;
const resultB = { resultId: 'b', identities: ['ring:b'] } as unknown as NormalizedChartResult;

function readyStore() {
  const store = createChartWorkspaceStore(storage());
  store.getState().initializeRoute('personal', draftA);
  return store;
}

describe('chart workspace request state', () => {
  test('marks accepted success stale against edits and clears stale on revert', () => {
    const store = readyStore();
    const sequence = store.getState().submit(snapshotA)!;
    expect(sequence).toBe(1);
    store.getState().editDraft('personal', { zodiac: 'sidereal' });
    expect(store.getState().routes.personal!.isStale).toBe(false);
    store.getState().acceptSuccess('personal', sequence, resultA, snapshotA);
    expect(store.getState().routes.personal).toMatchObject({ isStale: true, lastSuccessfulResult: resultA });
    store.getState().editDraft('personal', draftA);
    expect(store.getState().routes.personal!.isStale).toBe(false);
  });

  test('allows only the latest active sequence to settle', () => {
    const store = readyStore();
    const a = store.getState().submit(snapshotA)!;
    store.getState().editDraft('personal', { zodiac: 'sidereal' });
    const bSnapshot = { ...snapshotA, request: { ...snapshotA.request, settings: { ...snapshotA.request.settings, zodiac: 'sidereal' as const } } };
    const b = store.getState().submit(bSnapshot)!;
    store.getState().acceptSuccess('personal', a, resultA, snapshotA);
    expect(store.getState().routes.personal!.lastSuccessfulResult).toBeNull();
    store.getState().acceptSuccess('personal', b, resultB, bSnapshot);
    expect(store.getState().routes.personal!.lastSuccessfulResult).toBe(resultB);
  });

  test('cancellation invalidates all late settlements without decrementing sequence', () => {
    const store = readyStore();
    const a = store.getState().submit(snapshotA)!;
    store.getState().editDraft('personal', { zodiac: 'sidereal' });
    const b = store.getState().submit({ ...snapshotA, request: { ...snapshotA.request, settings: { ...snapshotA.request.settings, zodiac: 'sidereal' } } })!;
    store.getState().cancel('personal');
    store.getState().acceptSuccess('personal', a, resultA, snapshotA);
    store.getState().acceptSuccess('personal', b, resultB, snapshotA);
    expect(store.getState().routes.personal).toMatchObject({
      requestStatus: 'cancelled', latestIssuedSequence: 2, activeSequence: null, lastSuccessfulResult: null,
    });
  });

  test('failure and cancellation retain successful result and interaction state', () => {
    const store = readyStore();
    let sequence = store.getState().submit(snapshotA)!;
    store.getState().acceptSuccess('personal', sequence, resultA, snapshotA);
    store.getState().setFocus('ring:a');
    store.getState().setTransform({ scale: 2, x: 3, y: 4 });
    store.getState().setActiveTab('aspects');
    store.getState().setBulkSelection(['ring:a']);
    store.getState().setAiContextSource('selection');
    sequence = store.getState().submit(snapshotA)!;
    store.getState().acceptFailure('personal', sequence, 'domain', 'bad');
    expect(store.getState()).toMatchObject({
      focusedIdentity: 'ring:a', transform: { scale: 2, x: 3, y: 4 }, activeTab: 'aspects', aiContextSource: 'selection',
    });
    expect(store.getState().routes.personal!.lastSuccessfulResult).toBe(resultA);
    expect(store.getState().bulkSelection).toEqual(['ring:a']);
  });

  test('blocks only an equivalent unresolved snapshot and permits settled retry', () => {
    const store = readyStore();
    const first = store.getState().submit(snapshotA)!;
    expect(store.getState().submit(snapshotA)).toBeNull();
    store.getState().acceptFailure('personal', first, 'ipc', 'failed');
    expect(store.getState().submit(snapshotA)).toBe(2);
  });

  test('records successful recents only, caps them, and clear does not edit draft', () => {
    const store = readyStore();
    const failed = store.getState().submit(snapshotA)!;
    store.getState().acceptFailure('personal', failed, 'ipc', 'failed');
    expect(store.getState().workspace.recents.primaryProfileIds).toEqual([]);
    for (let index = 0; index < 10; index += 1) {
      const snapshot = { ...snapshotA, primaryProfileId: `p${index}`, request: { ...snapshotA.request, primary: { ...snapshotA.request.primary, id: `p${index}` } } };
      const sequence = store.getState().submit(snapshot)!;
      store.getState().acceptSuccess('personal', sequence, resultA, snapshot);
    }
    expect(store.getState().workspace.recents.primaryProfileIds).toHaveLength(8);
    const before = store.getState().routes.personal!.draft;
    store.getState().clearRecents();
    expect(store.getState().workspace.recents).toEqual(defaultWesternWorkspace().recents);
    expect(store.getState().routes.personal!.draft).toBe(before);
  });
});
