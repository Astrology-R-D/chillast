import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateChartAiContextOwner,
  publishLatestChartAiContext,
  resetChartAiContextPublisherForTests,
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

  it('continues after failure without sending the queued context of an unmounted route owner', async () => {
    const a = deferred();
    const send = vi.fn((context: { resultId: string } | null) => context?.resultId === 'A' ? a.promise : Promise.resolve());
    const statusB = vi.fn(); const statusC = vi.fn();
    const ownerA = Symbol('route-a'); const ownerB = Symbol('route-b'); const ownerC = Symbol('route-c');
    publishLatestChartAiContext(ownerA, { resultId: 'A' } as never, send as never, vi.fn());
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    publishLatestChartAiContext(ownerB, { resultId: 'B' } as never, send as never, statusB);
    invalidateChartAiContextOwner(ownerB);
    a.reject(new Error('A failed'));
    await a.promise.catch(() => undefined);
    publishLatestChartAiContext(ownerC, { resultId: 'C' } as never, send as never, statusC);
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId)).toEqual(['A', 'C']));
    expect(statusB).not.toHaveBeenCalled();
    expect(statusC).toHaveBeenCalledWith(null);
  });
});
