import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { apiClient } from '../../api/client';
import { SessionRail } from './SessionRail';

vi.mock('../../api/client', () => ({
  apiClient: {
    listAiSessions: vi.fn(),
    createAiSession: vi.fn(),
    deleteAiSession: vi.fn(),
    renameAiSession: vi.fn(),
    setAiSessionPinned: vi.fn(),
    forkAiSession: vi.fn(),
  },
}));

const dictionary = {
  ai: {
    history: '对话历史', newChat: '新对话', noSessions: '暂无对话', deleteSession: '删除',
    deleteConfirm: '确认删除？', sessionDeleted: '已删除', searchSessions: '搜索对话…',
    pin: '置顶', unpin: '取消置顶', rename: '重命名', renameSession: '重命名会话',
    forked: '分支', emptySession: '（新对话）',
  },
};

const sessions = [
  { id: 's1', title: '置顶会话', messages: [], pinned: true, mode: 'chat', createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' },
  { id: 's2', title: null, messages: [{ role: 'user', content: '第一条消息很长很长很长很长' }], pinned: false, mode: 'chat', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z' },
  { id: 's3', title: '↩ 分支自 会话一', messages: [], pinned: false, forkedFrom: { sessionId: 's0', messageIndex: 1 }, mode: 'chat', createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z' },
];

function renderRail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <I18nProvider dictionary={dictionary}><SessionRail /></I18nProvider>
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiStreamStoreForTests();
  vi.mocked(apiClient.listAiSessions).mockResolvedValue(sessions as never);
});

test('lists sessions in order with pin markers, fallback labels, and fork indicator', async () => {
  renderRail();
  expect(await screen.findByText('置顶会话')).toBeInTheDocument();
  expect(screen.getByText(/第一条消息很长/)).toBeInTheDocument();
  expect(screen.getByText(/分支自/)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

test('search filters locally by title and first user message', async () => {
  const user = userEvent.setup();
  renderRail();
  await screen.findByText('置顶会话');
  await user.type(screen.getByRole('searchbox'), '第一条');
  expect(screen.queryByText('置顶会话')).not.toBeInTheDocument();
  expect(screen.getByText(/第一条消息很长/)).toBeInTheDocument();
});

test('pin toggle, rename inline, delete with two-step confirm, and new chat call the api layer', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.setAiSessionPinned).mockResolvedValue(sessions[0] as never);
  vi.mocked(apiClient.renameAiSession).mockResolvedValue(undefined as never);
  vi.mocked(apiClient.deleteAiSession).mockResolvedValue(true);
  vi.mocked(apiClient.createAiSession).mockResolvedValue({ id: 's9', title: null, messages: [], mode: 'chat', pinned: false } as never);
  renderRail();
  await screen.findByText('置顶会话');

  await user.click(screen.getAllByRole('button', { name: '取消置顶' })[0]);
  expect(apiClient.setAiSessionPinned).toHaveBeenCalledWith('s1', false);

  await user.click(screen.getAllByRole('button', { name: '重命名' })[0]);
  const renameInput = screen.getByRole('textbox', { name: '重命名会话' });
  await user.clear(renameInput);
  await user.type(renameInput, '新名字{Enter}');
  expect(apiClient.renameAiSession).toHaveBeenCalledWith('s1', '新名字');

  await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
  await user.click(screen.getByRole('button', { name: '确认删除？' }));
  expect(apiClient.deleteAiSession).toHaveBeenCalledWith('s1');

  await user.click(screen.getByRole('button', { name: '新对话' }));
  expect(apiClient.createAiSession).toHaveBeenCalledTimes(1);
});

test('deleting the active session reselects the next remaining session', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.deleteAiSession).mockResolvedValue(true);
  aiStreamStore.getState().setActiveSessionId('s1');
  renderRail();
  await screen.findByText('置顶会话');
  await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
  await user.click(screen.getByRole('button', { name: '确认删除？' }));
  await waitFor(() => expect(aiStreamStore.getState().activeSessionId).toBe('s2'));
});

test('deleting the last remaining active session creates a fresh one', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.deleteAiSession).mockResolvedValue(true);
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([sessions[1]] as never);
  vi.mocked(apiClient.createAiSession).mockResolvedValue({ id: 'fresh', title: null, messages: [], mode: 'chat', pinned: false } as never);
  aiStreamStore.getState().setActiveSessionId('s2');
  renderRail();
  await screen.findByText(/第一条消息很长/);
  await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
  await user.click(screen.getByRole('button', { name: '确认删除？' }));
  await waitFor(() => expect(apiClient.createAiSession).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(aiStreamStore.getState().activeSessionId).toBe('fresh'));
});
