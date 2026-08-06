import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deactivateChartAiContextOwner,
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
    deactivateChartAiContextOwner(ownerA, send as never, vi.fn());
    publishLatestChartAiContext(ownerB, { resultId: 'B' } as never, send as never, vi.fn());
    deactivateChartAiContextOwner(ownerA, send as never, vi.fn());
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

  it('isolates a failed clear and permits retry and the next chart publication', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('clear failed'))
      .mockResolvedValue(undefined);
    const ownerA = Symbol('route-a'); const ownerB = Symbol('route-b');
    const statusA = vi.fn(); const statusB = vi.fn();
    publishLatestChartAiContext(ownerA, { resultId: 'A' } as never, send, statusA);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    deactivateChartAiContextOwner(ownerA, send, statusA);
    await vi.waitFor(() => expect(statusA).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'clear failed' })));
    deactivateChartAiContextOwner(ownerA, send, statusA);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    publishLatestChartAiContext(ownerB, { resultId: 'B' } as never, send, statusB);
    await vi.waitFor(() => expect(send.mock.calls.map(([context]) => context?.resultId ?? null)).toEqual(['A', null, null, 'B']));
    expect(statusB).toHaveBeenLastCalledWith(null);
  });
});
