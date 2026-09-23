import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { resetAiStreamStoreForTests, aiStreamStore } from '../../stores/aiStreamStore';
import { chartWorkspaceStore } from '../../stores/chartWorkspace';
import { publishLatestChartAiContext, resetChartAiContextPublisherForTests } from '../charts/context/chartAiContextPublisher';
import { apiClient } from '../../api/client';
import { AiWorkspace } from './AiWorkspace';

vi.mock('../../api/client', () => ({
  apiClient: {
    getAiStatus: vi.fn(),
    listAiSessions: vi.fn(),
    createAiSession: vi.fn(),
    setAiChartContext: vi.fn().mockResolvedValue(null),
  },
}));

const dictionary = {
  ai: {
    title: 'AI 占星顾问', modeChat: '对话', modeReport: '报告', modeResearch: '研究',
    notConfigured: 'AI 未配置，请前往', goToSettings: '设置页面', toConfigure: '进行配置',
    reportPlaceholder: '报告模式将在后续迁移阶段启用', researchPlaceholder: '研究模式将在后续迁移阶段启用',
    history: '对话历史', newChat: '新对话', noSessions: '暂无对话', deleteSession: '删除',
    deleteConfirm: '确认删除？', searchSessions: '搜索对话…', pin: '置顶', unpin: '取消置顶',
    rename: '重命名', renameSession: '重命名会话', emptySession: '（新对话）',
    inputPlaceholder: '输入问题…', send: '发送', stop: '停止', attach: '添加附件', inputBox: '消息输入',
    messagesRegion: '对话消息', noMessages: '会话暂无消息',
  },
  shell: { retryAiSync: '重试 AI 同步', aiContextSyncFailed: 'AI 上下文同步失败，当前上下文可能已过期：{{message}}', loading: '正在读取状态…' },
};

const configured = { configured: true, provider: 'OpenAI', model: 'gpt-test', baseUrl: '', knowledgeDocCount: 3 };

function renderWorkspace(onNavigate?: (route: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <I18nProvider dictionary={dictionary}><AiWorkspace onNavigate={onNavigate} /></I18nProvider>
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiStreamStoreForTests();
  resetChartAiContextPublisherForTests();
  vi.mocked(apiClient.getAiStatus).mockResolvedValue(configured as never);
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([
    { id: 's1', title: '已有会话', messages: [], pinned: false, mode: 'chat' },
  ] as never);
  vi.stubGlobal('mystApi', {
    ai: { onStatusChanged: vi.fn(() => vi.fn()), onSessionsChanged: vi.fn(() => vi.fn()) },
  });
});

test('initializes the active session from the list and renders chat mode with mode tabs', async () => {
  renderWorkspace();
  expect(await screen.findByRole('tab', { name: '对话' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '报告' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '研究' })).toBeInTheDocument();
  await waitFor(() => expect(aiStreamStore.getState().activeSessionId).toBe('s1'));
  expect(screen.getByRole('complementary', { name: '对话历史' })).toBeInTheDocument();
});

test('creates a session when the list is empty', async () => {
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([]);
  vi.mocked(apiClient.createAiSession).mockResolvedValue({ id: 'fresh', title: null, messages: [], pinned: false, mode: 'chat' } as never);
  renderWorkspace();
  await waitFor(() => expect(aiStreamStore.getState().activeSessionId).toBe('fresh'));
});

test('unconfigured status shows the settings guide and navigates on click', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.getAiStatus).mockResolvedValue({ ...configured, configured: false } as never);
  const onNavigate = vi.fn();
  renderWorkspace(onNavigate);
  expect(await screen.findByText(/AI 未配置/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /设置页面/ }));
  expect(onNavigate).toHaveBeenCalledWith('settings');
});

test('chart context sync failure keeps the retry alert in the workspace', async () => {
  const user = userEvent.setup();
  chartWorkspaceStore.getState().setAiContextSync('error', 'clear offline');
  // 先放一个可重试的意图（null 上下文），点重试 → publisher 重发 null → setAiChartContext(null)。
  publishLatestChartAiContext(Symbol('smoke-owner'), null, apiClient.setAiChartContext as never, () => {});
  renderWorkspace();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/clear offline/);
  chartWorkspaceStore.getState().setAiContextSync('synced');
  await user.click(within(alert).getByRole('button', { name: '重试 AI 同步' }));
  await waitFor(() => expect(apiClient.setAiChartContext).toHaveBeenCalledWith(null));
});

test('report and research tabs show placeholders and chat returns', async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await screen.findByRole('tab', { name: '报告' });
  await user.click(screen.getByRole('tab', { name: '报告' }));
  expect(screen.getByText('报告模式将在后续迁移阶段启用')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: '研究' }));
  expect(screen.getByText('研究模式将在后续迁移阶段启用')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: '对话' }));
  expect(screen.getByRole('textbox', { name: '消息输入' })).toBeInTheDocument();
});
