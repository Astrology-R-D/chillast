import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { apiClient } from '../../api/client';
import { ChatMode } from './ChatMode';

vi.mock('../../api/client', () => ({
  apiClient: {
    listAiSessions: vi.fn(),
    createAiSession: vi.fn(),
    forkAiSession: vi.fn(),
    replaceAiSessionFrom: vi.fn(),
  },
}));

const dictionary = {
  ai: {
    modeChat: '对话',
    copy: '复制', quote: '引用', editResend: '编辑重发', resend: '重发', cancelEdit: '取消',
    fork: '从此处分支', regenerate: '重新生成', editMessage: '编辑消息',
    backToLatest: '↓ 回到最新', truncated: '⚠️ 输出因达到 Token 上限被截断',
    retrySend: '重试', streamError: '请求失败',
    inputPlaceholder: '输入问题…', send: '发送', stop: '停止', attach: '添加附件',
    attachmentTooLarge: '附件超过 200KB 上限', attachmentReadFailed: '附件读取失败',
    removeAttachment: '移除附件', inputBox: '消息输入', messagesRegion: '对话消息',
    noMessages: '会话暂无消息', toolRunning: '运行中…', toolDone: '完成',
  },
};

const sessions = [
  { id: 's1', title: '会话一', messages: [
    { role: 'user', content: '问题一' },
    { role: 'ai', content: '回答一' },
    { role: 'user', content: '问题二' },
    { role: 'ai', content: '回答二' },
  ], pinned: false, mode: 'chat', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

type StreamHooks = {
  emitToken(event: { sessionId?: string; type: string; data: unknown }): void;
  emitDone(): void;
  emitError(message: string): void;
};

function installStreamApi(): StreamHooks {
  const hooks: { token: Array<(e: never) => void>; done: Array<() => void>; error: Array<(e: { message?: string }) => void> } = {
    token: [], done: [], error: [],
  };
  vi.stubGlobal('mystApi', {
    ai: {
      chat: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true }),
      removeAllListeners: vi.fn(),
      onToken: (cb: (e: never) => void) => hooks.token.push(cb),
      onDone: (cb: () => void) => hooks.done.push(cb),
      onError: (cb: (e: { message?: string }) => void) => hooks.error.push(cb),
    },
  });
  return {
    emitToken: (event) => { for (const cb of hooks.token) cb(event as never); },
    emitDone: () => { for (const cb of hooks.done) cb(); },
    emitError: (message) => { for (const cb of hooks.error) cb({ message }); },
  };
}

function renderMode() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <I18nProvider dictionary={dictionary}><ChatMode /></I18nProvider>
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiStreamStoreForTests();
  aiStreamStore.getState().setActiveSessionId('s1');
  vi.mocked(apiClient.listAiSessions).mockResolvedValue(sessions as never);
  vi.mocked(apiClient.createAiSession).mockResolvedValue(sessions[0] as never);
});

test('renders session history with regenerate on the last assistant message', async () => {
  installStreamApi();
  renderMode();
  expect(await screen.findByText('问题一')).toBeInTheDocument();
  expect(screen.getByText('回答一')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument();
});

test('send streams tokens, tool calls, truncation, then done refreshes the session list', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  renderMode();
  await screen.findByText('问题一');
  await user.type(screen.getByRole('textbox', { name: '消息输入' }), '火星落宫怎么看{Enter}');
  expect(await screen.findByText('火星落宫怎么看')).toBeInTheDocument();
  act(() => {
    stream.emitToken({ sessionId: 's1', type: 'token', data: '正在' });
    stream.emitToken({ sessionId: 's1', type: 'token', data: '推理' });
    stream.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'calling', argsDigest: 'q', resultExcerpt: '', requiresConfirmation: false } });
    stream.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'done', argsDigest: '', resultExcerpt: '《占星书》', requiresConfirmation: false } });
    stream.emitToken({ sessionId: 's1', type: 'truncated', data: { reason: 'length' } });
  });
  expect(screen.getByText('正在推理')).toBeInTheDocument();
  expect(screen.getByText(/Token 上限被截断/)).toBeInTheDocument();
  act(() => stream.emitDone());
  await waitFor(() => expect(apiClient.listAiSessions).toHaveBeenCalledTimes(2));
});

test('regenerate rewrites the last user message in place and resends with resend flag', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.replaceAiSessionFrom).mockResolvedValue({ ...sessions[0], messages: sessions[0].messages.slice(0, 3) } as never);
  renderMode();
  await screen.findByText('回答二');
  await user.click(screen.getByRole('button', { name: '重新生成' }));
  await waitFor(() => expect(apiClient.replaceAiSessionFrom).toHaveBeenCalledWith('s1', 2, { role: 'user', content: '问题二' }));
  await waitFor(() => expect(window.mystApi.ai.chat).toHaveBeenCalledWith(
    [{ role: 'user', content: '问题二' }],
    { sessionId: 's1', resend: true },
  ));
});

test('edit-resend on a non-last user message forks first, then rewrites in the fork', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.forkAiSession).mockResolvedValue({
    ...sessions[0], id: 'fork-1', forkedFrom: { sessionId: 's1', messageIndex: 0 },
    messages: [{ role: 'user', content: '问题一' }],
  } as never);
  vi.mocked(apiClient.replaceAiSessionFrom).mockResolvedValue(null as never);
  renderMode();
  await screen.findByText('问题一');
  await user.click(screen.getAllByRole('button', { name: '编辑重发' })[0]);
  const editor = screen.getByRole('textbox', { name: '编辑消息' });
  await user.clear(editor);
  await user.type(editor, '改写后的问题');
  await user.click(screen.getByRole('button', { name: '重发' }));
  await waitFor(() => expect(apiClient.forkAiSession).toHaveBeenCalledWith('s1', 0));
  await waitFor(() => expect(apiClient.replaceAiSessionFrom).toHaveBeenCalledWith('fork-1', 0, { role: 'user', content: '改写后的问题' }));
  expect(aiStreamStore.getState().activeSessionId).toBe('fork-1');
  expect(window.mystApi.ai.chat).toHaveBeenCalledWith(
    [{ role: 'user', content: '改写后的问题' }],
    { sessionId: 'fork-1', resend: true },
  );
});

test('fork action derives a linked session and switches to it', async () => {
  installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.forkAiSession).mockResolvedValue({
    ...sessions[0], id: 'fork-2', forkedFrom: { sessionId: 's1', messageIndex: 1 },
    messages: sessions[0].messages.slice(0, 2),
  } as never);
  renderMode();
  await screen.findByText('问题一');
  await user.click(screen.getAllByRole('button', { name: '从此处分支' })[0]);
  await waitFor(() => expect(apiClient.forkAiSession).toHaveBeenCalledWith('s1', 0));
  expect(aiStreamStore.getState().activeSessionId).toBe('fork-2');
});

test('quote inserts the quoted text into the composer', async () => {
  installStreamApi();
  const user = userEvent.setup();
  renderMode();
  await screen.findByText('问题一');
  await user.click(screen.getAllByRole('button', { name: '引用' })[0]);
  const input = screen.getByRole('textbox', { name: '消息输入' }) as HTMLTextAreaElement;
  expect(input.value).toContain('> 问题一');
});

test('stream error offers retry which regenerates', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.replaceAiSessionFrom).mockResolvedValue(null as never);
  renderMode();
  await screen.findByText('问题一');
  await user.type(screen.getByRole('textbox', { name: '消息输入' }), '会失败的问题{Enter}');
  // 预置「错误后已持久化」的会话视图：主进程在请求开始时已 append 用户消息，
  // 错误收尾的 streamFinishSignal 会 invalidate → refetch 拿到这份新数据。
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([
    { ...sessions[0], messages: [...sessions[0].messages, { role: 'user', content: '会失败的问题' }] },
  ] as never);
  act(() => stream.emitError('网关超时'));
  expect(await screen.findByText(/网关超时/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(apiClient.replaceAiSessionFrom).toHaveBeenCalledWith('s1', 4, { role: 'user', content: '会失败的问题' }));
  await waitFor(() => expect(window.mystApi.ai.chat).toHaveBeenCalledWith(
    [{ role: 'user', content: '会失败的问题' }],
    { sessionId: 's1', resend: true },
  ));
});
