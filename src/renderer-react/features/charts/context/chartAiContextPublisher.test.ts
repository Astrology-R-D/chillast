import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
  deactivateChartAiContextOwner,
  invalidateLatestChartAiContext,
  latestChartAiContext,
  publishLatestChartAiContext,
  resetChartAiContextPublisherForTests,
  retryLatestChartAiContext,
  subscribeChartAiContext,
} from './chartAiContextPublisher';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('application-wide chart AI publisher', () => {
  beforeEach(() => resetChartAiContextPublisherForTests());

  it('orders deferred publications across owners and reports only the latest completion', async () => {
    const a = deferred();
    const send = vi.fn((context: { resultId: string } | null) => context?.resultId === 'A' ? a.promise : Promise.resolve());
    const statusA = vi.fn(); const statusB = vi.fn();
    publishLatestChartAiContext(Symbol('route-a'), { resultId: 'A' } as never, send as never, statusA);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    publishLatestChartAiContext(Symbol('route-b'), { resultId: 'B' } as never, send as never, statusB);
    expect(send).toHaveBeenCalledTimes(1);
    a.resolve();
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId)).toEqual(['A', 'B']));
    expect(statusA).not.toHaveBeenCalled();
    expect(statusB).toHaveBeenCalledWith(null);
  });

  it('clears the current chart owner when navigating to a non-chart route', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const status = vi.fn();
    const owner = Symbol('route-a');
    publishLatestChartAiContext(owner, { resultId: 'A' } as never, send, status);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    deactivateChartAiContextOwner(owner, send, status);
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId ?? null)).toEqual(['A', null]));
    expect(status).toHaveBeenLastCalledWith(null);
  });

  it('does not transiently clear or finally overwrite a newly active chart owner', async () => {
    const a = deferred();
    const send = vi.fn((context: { resultId: string } | null) => context?.resultId === 'A' ? a.promise : Promise.resolve());
    const ownerA = Symbol('route-a'); const ownerB = Symbol('route-b');
    publishLatestChartAiContext(ownerA, { resultId: 'A' } as never, send as never, vi.fn());
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(deactivateChartAiContextOwner(ownerA, send as never, vi.fn())).toBe(true);
    publishLatestChartAiContext(ownerB, { resultId: 'B' } as never, send as never, vi.fn());
    expect(deactivateChartAiContextOwner(ownerA, send as never, vi.fn())).toBe(false);
    a.resolve();
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId ?? null)).toEqual(['A', 'B']));
  });

  it('orders a clear after an already-started delayed publication', async () => {
    const a = deferred();
    const send = vi.fn((context: { resultId: string } | null) => context ? a.promise : Promise.resolve());
    const owner = Symbol('route-a');
    publishLatestChartAiContext(owner, { resultId: 'A' } as never, send as never, vi.fn());
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    deactivateChartAiContextOwner(owner, send as never, vi.fn());
    a.resolve();
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId ?? null)).toEqual(['A', null]));
  });

  it('automatically retries one failed clear and permits the next chart publication', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('clear failed'))
      .mockResolvedValue(undefined);
    const ownerA = Symbol('route-a'); const ownerB = Symbol('route-b');
    const statusA = vi.fn(); const statusB = vi.fn();
    publishLatestChartAiContext(ownerA, { resultId: 'A' } as never, send, statusA);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    deactivateChartAiContextOwner(ownerA, send, statusA);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(statusA).toHaveBeenLastCalledWith(null);
    publishLatestChartAiContext(ownerB, { resultId: 'B' } as never, send, statusB);
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId ?? null)).toEqual(['A', null, null, 'B']));
    expect(statusB).toHaveBeenLastCalledWith(null);
  });

  it('retries the exact latest failed active publication on command', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('sync failed')).mockResolvedValue(undefined);
    const status = vi.fn();
    const context = { resultId: 'latest' } as never;
    publishLatestChartAiContext(Symbol('route'), context, send, status);
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'sync failed' })));
    expect(retryLatestChartAiContext()).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toBe(context);
    expect(status).toHaveBeenLastCalledWith(null);
  });

  it('cannot retry an inactive stale owner over a newer owner', async () => {
    const a = deferred();
    const send = vi.fn((context: { resultId: string } | null) => context?.resultId === 'A' ? a.promise : Promise.resolve());
    const ownerA = Symbol('a');
    publishLatestChartAiContext(ownerA, { resultId: 'A' } as never, send as never, vi.fn());
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    publishLatestChartAiContext(Symbol('b'), { resultId: 'B' } as never, send as never, vi.fn());
    expect(retryLatestChartAiContext()).toBe(true);
    a.resolve();
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId)).toEqual(['A', 'B']));
  });
});

test('latestChartAiContext exposes the newest intent and notifies subscribers', async () => {
  resetChartAiContextPublisherForTests();
  const context = { kind: 'western-chart', resultId: 'r9' } as never;
  const notified: number[] = [];
  expect(latestChartAiContext()).toBeNull();
  const unsubscribe = subscribeChartAiContext(() => notified.push(1));
  const send = vi.fn().mockResolvedValue(null);
  publishLatestChartAiContext(Symbol('t'), context, send, () => {});
  expect(latestChartAiContext()).toEqual(context);
  expect(notified).toHaveLength(1);
  unsubscribe();
  invalidateLatestChartAiContext();
  expect(latestChartAiContext()).toBeNull();
  expect(notified).toHaveLength(1);
});
