import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App, withTimeout } from './App';
import { AppProviders } from './AppProviders';

const dictionary = {
  app: { title: 'CHILLAST', bootText: '正在校准星图…', bootError: '应用启动失败：{{message}}' }, ai: { title: 'AI 占星顾问' },
  nav: {
    profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析',
    solarTerms: '节气年历', settings: '设置', groupProfiles: '档案', groupCharts: '星盘',
    groupChinese: '命理', groupTools: '工具',
  },
  profiles: { title: '档案管理' }, chart: { personalTitle: '个人星盘', relationshipTitle: '合盘分析' },
  chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' },
  settings: { title: 'AI 设置', provider: '供应商', model: '模型' },
  shell: {
    loading: '正在读取状态…', placeholder: '{{title}}将在后续迁移阶段启用', theme: '主题', density: '密度',
    aiConfigured: 'AI 已配置', aiNotConfigured: 'AI 未配置', retry: '重试', knowledgeCount: '知识库：{{count}} 篇文档',
    openAi: '打开 AI 助手', closeAi: '关闭 AI 助手', resizeNavigation: '调整导航栏宽度', resizeAi: '调整 AI 栏宽度',
    navigationRegion: '主导航', workspaceRegion: '工作区', aiRegion: 'AI 助手',
  },
  appearance: { system: '跟随系统', light: '亮色', dark: '深色', compact: '紧凑', comfortable: '均衡' },
};

const status = { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 };
const startupLabels = {
  loading: '正在载入 CHILLAST…',
  error: 'CHILLAST 无法启动：{{message}}',
  retry: '再次尝试',
};
const startupDictionary = {
  ...dictionary,
  app: { ...dictionary.app, bootText: startupLabels.loading, bootError: startupLabels.error },
  shell: { ...dictionary.shell, retry: startupLabels.retry },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installApi({
  config = vi.fn().mockResolvedValue({ ok: true, data: {} }),
  locale = vi.fn().mockResolvedValue({ ok: true, data: dictionary }),
} = {}) {
  window.mystApi = {
    getConfig: config,
    getLocale: locale,
    getReferenceData: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    getChartTypes: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    computeChart: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    profiles: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      get: vi.fn().mockResolvedValue({ ok: true, data: null }),
      save: vi.fn().mockRejectedValue(new Error('unused')),
      remove: vi.fn().mockResolvedValue({ ok: true, data: false }),
    },
    searchCities: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    chinese: { searchCities: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    locations: {
      resolve: vi.fn().mockResolvedValue({
        ok: true,
        data: { timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' },
      }),
    },
    app: {
      onCloseRequested: vi.fn(() => () => {}),
      decideClose: vi.fn().mockResolvedValue({ ok: true, data: false }),
    },
    ai: {
      setContext: vi.fn(async () => ({ ok: true as const, data: null })),
      status: vi.fn().mockResolvedValue({ ok: true, data: status }),
      initStatus: vi.fn().mockResolvedValue({ ok: true, data: null }),
      onStatusChanged: vi.fn(() => () => {}),
      onInitProgress: vi.fn(() => () => {}),
    },
  };
  return { config, locale };
}

function renderApp() {
  return render(<AppProviders><App /></AppProviders>);
}

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  installApi();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('shows stable startup loading while config and locale load concurrently', () => {
  const config = deferred<never>();
  const locale = deferred<never>();
  const calls = installApi({
    config: vi.fn(() => config.promise),
    locale: vi.fn(() => locale.promise),
  });

  renderApp();

  expect(screen.getByRole('status')).toHaveTextContent(dictionary.app.bootText);
  expect(calls.config).toHaveBeenCalledTimes(1);
  expect(calls.locale).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
});

test('uses locale startup text as soon as the dictionary is available', async () => {
  const config = deferred<never>();
  installApi({
    config: vi.fn(() => config.promise),
    locale: vi.fn().mockResolvedValue({ ok: true, data: startupDictionary }),
  });

  renderApp();

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(startupLabels.loading));
});

test('renders the localized shell only after both startup requests succeed', async () => {
  const config = deferred<{ ok: true; data: {} }>();
  const locale = deferred<{ ok: true; data: typeof dictionary }>();
  installApi({ config: vi.fn(() => config.promise), locale: vi.fn(() => locale.promise) });
  renderApp();

  config.resolve({ ok: true, data: {} });
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  locale.resolve({ ok: true, data: dictionary });

  expect(await screen.findByRole('heading', { level: 1, name: '档案管理' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /档案管理|个人星盘|合盘分析|命理分析|节气年历|设置/ })).toHaveLength(6);
});

test('applies runtime config as soon as config succeeds', async () => {
  const locale = deferred<never>();
  installApi({
    config: vi.fn().mockResolvedValue({ ok: true, data: { layout: { sidebarWidth: 272 } } }),
    locale: vi.fn(() => locale.promise),
  });
  renderApp();

  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('272px'));
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
});

test.each([
  ['config', '配置读取失败'],
  ['locale', '语言读取失败'],
] as const)('shows the actual %s startup failure and retry control', async (failedRequest, message) => {
  installApi({
    config: vi.fn().mockResolvedValue(failedRequest === 'config' ? { ok: false, error: message } : { ok: true, data: {} }),
    locale: vi.fn().mockResolvedValue(failedRequest === 'locale' ? { ok: false, error: message } : { ok: true, data: dictionary }),
  });
  renderApp();

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
});

test('updates an existing startup error when locale arrives later', async () => {
  const locale = deferred<{ ok: true; data: typeof startupDictionary }>();
  installApi({
    config: vi.fn().mockResolvedValue({ ok: false, error: '配置读取失败' }),
    locale: vi.fn(() => locale.promise),
  });
  renderApp();

  expect(await screen.findByRole('alert')).toHaveTextContent('配置读取失败');
  locale.resolve({ ok: true, data: startupDictionary });

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
    startupLabels.error.replace('{{message}}', '配置读取失败'),
  ));
  expect(screen.getByRole('button', { name: startupLabels.retry })).toBeInTheDocument();
});

test('retry refetches both startup resources and renders after recovery', async () => {
  const config = vi.fn()
    .mockResolvedValueOnce({ ok: false, error: '暂时失败' })
    .mockResolvedValue({ ok: true, data: {} });
  const locale = vi.fn().mockResolvedValue({ ok: true, data: dictionary });
  installApi({ config, locale });
  const user = userEvent.setup();
  renderApp();

  await user.click(await screen.findByRole('button', { name: '重试' }));

  expect(await screen.findByRole('heading', { level: 1, name: '档案管理' })).toBeInTheDocument();
  expect(config).toHaveBeenCalledTimes(2);
  expect(locale).toHaveBeenCalledTimes(2);
});

test('retry starts fresh requests when one prior request is still pending and ignores its late result', async () => {
  const oldConfig = deferred<{ ok: true; data: { layout: { sidebarWidth: number } } }>();
  const config = vi.fn()
    .mockImplementationOnce(() => oldConfig.promise)
    .mockResolvedValueOnce({ ok: true, data: { layout: { sidebarWidth: 300 } } });
  const locale = vi.fn()
    .mockResolvedValueOnce({ ok: false, error: '语言读取失败' })
    .mockResolvedValueOnce({ ok: true, data: dictionary });
  installApi({ config, locale });
  const user = userEvent.setup();
  renderApp();

  await user.click(await screen.findByRole('button', { name: '重试' }));

  expect(await screen.findByRole('heading', { level: 1, name: '档案管理' })).toBeInTheDocument();
  expect(config).toHaveBeenCalledTimes(2);
  expect(locale).toHaveBeenCalledTimes(2);
  expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('300px');

  oldConfig.resolve({ ok: true, data: { layout: { sidebarWidth: 900 } } });
  await act(async () => Promise.resolve());
  expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('300px');
});

test.each(['config', 'locale'])('withTimeout identifies a timed out %s request', async (resource) => {
  vi.useFakeTimers();
  const pending = deferred<never>();
  const result = expect(withTimeout(pending.promise, resource, 100)).rejects.toThrow(
    new RegExp(`${resource}.*超时`),
  );

  await vi.advanceTimersByTimeAsync(100);

  await result;
  vi.useRealTimers();
});

test('each AppProviders mount owns a fresh QueryClient cache', async () => {
  const calls = installApi();
  const first = renderApp();
  expect(await screen.findByRole('heading', { level: 1, name: '档案管理' })).toBeInTheDocument();
  first.unmount();

  renderApp();
  expect(await screen.findByRole('heading', { level: 1, name: '档案管理' })).toBeInTheDocument();
  expect(calls.config).toHaveBeenCalledTimes(2);
  expect(calls.locale).toHaveBeenCalledTimes(2);
});

test.each([
  ['config', { ok: true }],
  ['locale', { data: dictionary }],
] as const)('reports malformed %s IPC envelopes', async (request, envelope) => {
  installApi({
    config: vi.fn().mockResolvedValue(request === 'config' ? envelope : { ok: true, data: {} }),
    locale: vi.fn().mockResolvedValue(request === 'locale' ? envelope : { ok: true, data: dictionary }),
  });
  renderApp();

  expect(await screen.findByRole('alert')).toHaveTextContent('未知错误');
});
