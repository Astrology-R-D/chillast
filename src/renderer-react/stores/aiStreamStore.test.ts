import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  aiStreamStore, resetAiStreamStoreForTests,
} from './aiStreamStore';

type TokenHandler = (event: { sessionId?: string; requestId?: string; type: string; data: unknown }) => void;
type FinishEvent = { sessionId?: string; requestId?: string; message?: string };

function installApiMock() {
  const handlers = { token: [] as TokenHandler[], done: [] as Array<(e?: FinishEvent) => void>, error: [] as Array<(e: FinishEvent) => void> };
  const chat = vi.fn().mockResolvedValue({ ok: true });
  const interpret = vi.fn().mockResolvedValue({ ok: true });
  const stop = vi.fn().mockResolvedValue({ ok: true });
  const removeAllListeners = vi.fn(() => {
    handlers.token.length = 0;
    handlers.done.length = 0;
    handlers.error.length = 0;
  });
  vi.stubGlobal('mystApi', {
    ai: {
      chat, interpret, stop, removeAllListeners,
      onToken: (cb: TokenHandler) => handlers.token.push(cb),
      onDone: (cb: (e?: FinishEvent) => void) => handlers.done.push(cb),
      onError: (cb: (e: FinishEvent) => void) => handlers.error.push(cb),
    },
  });
  return {
    chat, interpret, stop, removeAllListeners,
    emitToken: (event: { sessionId?: string; requestId?: string; type: string; data: unknown }) => { for (const cb of handlers.token) cb(event); },
    emitDone: (event?: FinishEvent) => { for (const cb of handlers.done) cb(event); },
    emitError: (message: string, event?: FinishEvent) => { for (const cb of handlers.error) cb({ message, ...event }); },
  };
}

beforeEach(() => {
  resetAiStreamStoreForTests();
  vi.useFakeTimers();
});
afterEach(() => { resetAiStreamStoreForTests(); vi.useRealTimers(); });

test('startChat registers fresh listeners, previews the user message, and accumulates token segments', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: '问个问题' });

  const state = aiStreamStore.getState();
  expect(state.active).toBe(true);
  expect(state.streamKind).toBe('chat');
  expect(state.localUserMessage?.content).toBe('问个问题');
  expect(api.removeAllListeners).toHaveBeenCalledTimes(1);
  expect(api.chat).toHaveBeenCalledWith([{ role: 'user', content: '问个问题' }], expect.objectContaining({ sessionId: 's1', resend: false }));

  api.emitToken({ sessionId: 's1', type: 'token', data: '你好' });
  api.emitToken({ sessionId: 's1', type: 'token', data: '，世界' });
  vi.advanceTimersByTime(75);
  let segments = aiStreamStore.getState().segments;
  expect(segments).toEqual([{ kind: 'text', content: '你好，世界' }]);

  api.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'calling', argsDigest: 'q', resultExcerpt: '', requiresConfirmation: false } });
  api.emitToken({ sessionId: 's1', type: 'token', data: '继续' });
  vi.advanceTimersByTime(75);
  segments = aiStreamStore.getState().segments;
  expect(segments).toHaveLength(3);
  expect(segments[1]).toMatchObject({ kind: 'tool' });
  expect(segments[2]).toEqual({ kind: 'text', content: '继续' });

  api.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'done', argsDigest: '', resultExcerpt: '《书》摘录', requiresConfirmation: false } });
  segments = aiStreamStore.getState().segments;
  expect(segments).toHaveLength(3);
  expect(segments[1]).toMatchObject({ kind: 'tool', event: { tool: 'search_knowledge', status: 'done', resultExcerpt: '《书》摘录' } });
  // done 事件的 argsDigest 为空串，不得覆盖 calling 段的参数摘要
  const mergedTool = segments[1];
  if (mergedTool.kind !== 'tool') throw new Error('expected the merged segment to be a tool segment');
  expect(mergedTool.event.argsDigest).toBe('q');

  api.emitToken({ sessionId: 's1', type: 'truncated', data: { reason: 'length' } });
  expect(aiStreamStore.getState().truncated).toBe(true);
});

test('startChat ignores tokens from a different chat session', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  api.emitToken({ sessionId: 'other', type: 'token', data: '别家的' });
  expect(aiStreamStore.getState().segments).toEqual([]);
});

test('a stopped request cannot append text or finish the next reply in the same session', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: '第一次' });
  const oldRequest = api.chat.mock.calls[0][1].requestId;
  aiStreamStore.getState().stopStream();
  aiStreamStore.getState().startChat({ role: 'user', content: '第二次' });
  const newRequest = api.chat.mock.calls[1][1].requestId;
  expect(newRequest).not.toBe(oldRequest);
  api.emitToken({ sessionId: 's1', requestId: oldRequest, type: 'token', data: '旧回复' });
  api.emitDone({ sessionId: 's1', requestId: oldRequest });
  api.emitError('旧请求失败', { sessionId: 's1', requestId: oldRequest });
  expect(aiStreamStore.getState().active).toBe(true);
  expect(aiStreamStore.getState().error).toBeNull();
  api.emitToken({ sessionId: 's1', requestId: newRequest, type: 'token', data: '新回复' });
  vi.advanceTimersByTime(75);
  expect(aiStreamStore.getState().segments).toEqual([{ kind: 'text', content: '新回复' }]);
});

test('startChat passes resend through and ai:done resets the stream and bumps the finish signal', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: '再次' }, { resend: true });
  expect(api.chat).toHaveBeenCalledWith([{ role: 'user', content: '再次' }], expect.objectContaining({ sessionId: 's1', resend: true }));

  const before = aiStreamStore.getState().streamFinishSignal;
  api.emitToken({ sessionId: 's1', type: 'token', data: '文本' });
  api.emitDone();
  const after = aiStreamStore.getState();
  expect(after.active).toBe(false);
  expect(after.streamKind).toBeNull();
  expect(after.segments).toEqual([]);
  expect(after.localUserMessage).toBeNull();
  expect(after.truncated).toBe(false);
  expect(after.streamFinishSignal).toBe(before + 1);
});

test('ai:error keeps the message, marks the stream inactive, and bumps the signal', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  api.emitError('网关超时');
  const state = aiStreamStore.getState();
  expect(state.active).toBe(false);
  expect(state.error).toBe('网关超时');
  expect(state.streamFinishSignal).toBeGreaterThan(0);
});

test('stopStream calls ai:stop and finishes locally; late done is ignored', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  api.emitToken({ sessionId: 's1', type: 'token', data: '部分' });
  aiStreamStore.getState().stopStream();
  expect(api.stop).toHaveBeenCalledWith('s1');
  expect(aiStreamStore.getState().active).toBe(false);
  const signal = aiStreamStore.getState().streamFinishSignal;
  api.emitDone();
  expect(aiStreamStore.getState().streamFinishSignal).toBe(signal);
});

test('startInterpret accepts sessionless token events and forces chat mode', () => {
  const api = installApiMock();
  aiStreamStore.getState().setMode('report');
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startInterpret({ chartData: { resultId: 'r1' }, chartType: 'natal' });
  expect(api.interpret).toHaveBeenCalledWith({ resultId: 'r1' }, expect.objectContaining({ chartType: 'natal', sessionId: 's1' }));
  expect(aiStreamStore.getState().mode).toBe('chat');
  expect(aiStreamStore.getState().localUserMessage).toBeNull();
  api.emitToken({ type: 'token', data: '解读' });
  vi.advanceTimersByTime(75);
  expect(aiStreamStore.getState().segments).toEqual([{ kind: 'text', content: '解读' }]);
});

test('startChat without an active session is a no-op', () => {
  const api = installApiMock();
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  expect(api.chat).not.toHaveBeenCalled();
  expect(aiStreamStore.getState().active).toBe(false);
});

test('workspace actions: mode, panel signal, scroll pause, active session', () => {
  installApiMock();
  aiStreamStore.getState().setMode('research');
  expect(aiStreamStore.getState().mode).toBe('research');
  aiStreamStore.getState().requestPanelOpen();
  aiStreamStore.getState().requestPanelOpen();
  expect(aiStreamStore.getState().panelOpenSignal).toBe(2);
  aiStreamStore.getState().setAutoScrollPaused(true);
  expect(aiStreamStore.getState().autoScrollPaused).toBe(true);
  aiStreamStore.getState().setActiveSessionId('s9');
  expect(aiStreamStore.getState().activeSessionId).toBe('s9');
});

test('batches rapid tokens, keeps tool order, and clears pending work on finish', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  for (let i = 0; i < 500; i++) api.emitToken({ sessionId: 's1', type: 'token', data: '字' });
  expect(aiStreamStore.getState().segments).toEqual([]);
  vi.advanceTimersByTime(75);
  expect(aiStreamStore.getState().segments).toEqual([{ kind: 'text', content: '字'.repeat(500) }]);
  api.emitToken({ sessionId: 's1', type: 'token', data: '调用前' });
  api.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search', status: 'calling' } });
  expect(aiStreamStore.getState().segments[0]).toEqual({ kind: 'text', content: '字'.repeat(500) + '调用前' });
  api.emitToken({ sessionId: 's1', type: 'token', data: '结束前' });
  api.emitDone();
  vi.advanceTimersByTime(200);
  expect(aiStreamStore.getState().segments).toEqual([]);
  expect(aiStreamStore.getState().active).toBe(false);
});
