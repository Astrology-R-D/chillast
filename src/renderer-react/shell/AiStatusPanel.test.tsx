import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { AiStatus, IpcResult } from '../api/contracts';
import { I18nProvider } from '../i18n/I18nProvider';
import { AiStatusPanel } from './AiStatusPanel';

const dictionary = {
  ai: { title: 'AI 占星顾问' },
  settings: { provider: '供应商', model: '模型' },
  shell: {
    loading: '正在读取状态…', aiConfigured: 'AI 已配置', aiNotConfigured: 'AI 未配置', retry: '重试',
    knowledgeCount: '知识库：{{count}} 篇文档',
  },
};
const configured: AiStatus = {
  configured: true, provider: 'OpenAI', model: 'gpt-test', baseUrl: '', knowledgeDocCount: 7,
};
let statusChanged: ((status: AiStatus) => void) | undefined;
let cleanup: ReturnType<typeof vi.fn>;
let getStatus: ReturnType<typeof vi.fn>;
let subscribe: ReturnType<typeof vi.fn>;

function renderPanel() {
  return render(<I18nProvider dictionary={dictionary}><AiStatusPanel /></I18nProvider>);
}

beforeEach(() => {
  cleanup = vi.fn();
  getStatus = vi.fn();
  subscribe = vi.fn((listener: (status: AiStatus) => void) => {
    statusChanged = listener;
    return cleanup;
  });
  vi.stubGlobal('mystApi', {
    getConfig: vi.fn(), getLocale: vi.fn(),
    ai: { status: getStatus, onStatusChanged: subscribe, initStatus: vi.fn(), onInitProgress: vi.fn() },
  });
});

test('loads status, uses configured wording, and follows status events', async () => {
  getStatus.mockResolvedValue({ ok: true, data: configured } satisfies IpcResult<AiStatus>);
  renderPanel();

  expect(screen.getByText('正在读取状态…')).toBeInTheDocument();
  expect(await screen.findByText('AI 已配置')).toBeInTheDocument();
  expect(screen.queryByText(/连接/)).not.toBeInTheDocument();
  expect(screen.getByText('OpenAI')).toBeInTheDocument();
  expect(screen.getByText('gpt-test')).toBeInTheDocument();
  expect(screen.getByText('知识库：7 篇文档')).toBeInTheDocument();
  expect(subscribe).toHaveBeenCalledTimes(1);

  act(() => statusChanged?.({ ...configured, configured: false, knowledgeDocCount: 2 }));
  expect(screen.getByText('AI 未配置')).toBeInTheDocument();
  expect(screen.getByText('知识库：2 篇文档')).toBeInTheDocument();
});

test('shows an inline initial error and retries without adding another listener', async () => {
  const user = userEvent.setup();
  getStatus
    .mockResolvedValueOnce({ ok: false, error: '读取失败' } satisfies IpcResult<AiStatus>)
    .mockResolvedValueOnce({ ok: true, data: configured } satisfies IpcResult<AiStatus>);
  renderPanel();

  expect(await screen.findByRole('alert')).toHaveTextContent('读取失败');
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('AI 已配置')).toBeInTheDocument();
  expect(getStatus).toHaveBeenCalledTimes(2);
  expect(subscribe).toHaveBeenCalledTimes(1);
});

test('cleans up the application-lifetime listener and ignores late initial status', async () => {
  let resolveStatus!: (result: IpcResult<AiStatus>) => void;
  getStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
  const { unmount } = renderPanel();
  expect(subscribe).toHaveBeenCalledTimes(1);

  unmount();
  expect(cleanup).toHaveBeenCalledTimes(1);
  await act(async () => resolveStatus({ ok: true, data: configured }));
  act(() => statusChanged?.(configured));
  expect(document.body).not.toHaveTextContent('gpt-test');
});

test('does not let a delayed initial response overwrite a newer status event', async () => {
  let resolveStatus!: (result: IpcResult<AiStatus>) => void;
  getStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
  renderPanel();

  act(() => statusChanged?.({ ...configured, model: 'event-model', knowledgeDocCount: 9 }));
  expect(screen.getByText('event-model')).toBeInTheDocument();
  await act(async () => resolveStatus({ ok: true, data: configured }));

  expect(screen.getByText('event-model')).toBeInTheDocument();
  expect(screen.queryByText('gpt-test')).not.toBeInTheDocument();
});

test('renders visible fallbacks for empty or missing unconfigured metadata', async () => {
  getStatus.mockResolvedValue({
    ok: true,
    data: { ...configured, configured: false, provider: '', model: undefined as unknown as string },
  } satisfies IpcResult<AiStatus>);
  renderPanel();

  expect(await screen.findByText('AI 未配置')).toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(2);
});
