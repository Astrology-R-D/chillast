import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import locale from '../../../../locale/zh.json';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { DirtyNavigationProvider } from '../../shell/DirtyNavigationProvider';
import { SettingsPage } from './SettingsPage';

const providers = [
  { key: 'deepseek', label: 'DeepSeek', catalogId: 'deepseek', needsKey: true, modelCount: 2 },
  { key: 'ollama', label: 'Ollama (本地)', catalogId: null, needsKey: false, modelCount: 0 },
];
const models = [
  { id: 'deepseek-v4-flash', name: 'V4 Flash', limitContext: 1000000, limitOutput: 384000, costInput: 0.15, costOutput: 0.6, releaseDate: '2026-09-10' },
];
const status = { configured: true, provider: 'deepseek', model: 'deepseek-v4-flash', baseUrl: '', temperature: 0.7, maxTokens: 4096, knowledgeDocCount: 3 };
const tools = [{ id: 'kb', category: 'knowledge', enabled: true, ready: true, tools: [{ name: 'search_knowledge', description: '检索知识库' }] }];
const mcp = { servers: { demo: { enabled: false, transport: 'http', url: 'https://mcp.example/sse' } }, toolCount: 0, connected: false };
const knowledge = [
  { id: 'b1', name: 'builtin.md', source: 'builtin', importedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u1', name: 'user.md', source: 'user', importedAt: '2026-02-01T00:00:00.000Z' },
];
const sessions = [{ id: 's1', title: '星盘解读', messages: [{ role: 'user', content: '解读' }], createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }];

function installApi(overrides: Record<string, unknown> = {}) {
  let current = { id: 'config-1', name: '当前配置', settings: { ...status }, hasApiKey: true, createdAt: '', updatedAt: '' };
  const ai = {
    status: vi.fn().mockResolvedValue({ ok: true, data: status }),
    configure: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
    configurations: {
      list: vi.fn(async () => ({ ok: true, data: { activeId: current.id, configurations: [current] } })),
      save: vi.fn(async (input) => { current = { ...current, id: input.id || 'new-config', name: input.name, settings: input.settings, hasApiKey: input.settings.provider === 'deepseek' }; return { ok: true, data: current }; }),
      activate: vi.fn(), remove: vi.fn(), test: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
    },
    testWithSettings: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
    catalog: {
      providers: vi.fn().mockResolvedValue({ ok: true, data: providers }),
      models: vi.fn().mockResolvedValue({ ok: true, data: models }),
    },
    tools: { describe: vi.fn().mockResolvedValue({ ok: true, data: tools }), setProviderEnabled: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }) },
    mcp: { list: vi.fn().mockResolvedValue({ ok: true, data: mcp }), save: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }) },
    knowledge: { list: vi.fn().mockResolvedValue({ ok: true, data: knowledge }), import: vi.fn().mockResolvedValue({ ok: true, data: { count: 1 } }), remove: vi.fn().mockResolvedValue({ ok: true, data: true }) },
    sessions: { list: vi.fn().mockResolvedValue({ ok: true, data: sessions }), rename: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }), generateTitle: vi.fn().mockResolvedValue({ ok: true, data: { title: '新标题' } }), delete: vi.fn().mockResolvedValue({ ok: true, data: true }) },
    onStatusChanged: vi.fn(() => () => {}),
    ...overrides,
  };
  const api = {
    ai,
    // DirtyNavigationProvider subscribes via apiClient.onCloseRequested on mount.
    app: { onCloseRequested: vi.fn(() => () => {}), decideClose: vi.fn().mockResolvedValue({ ok: true, data: true }) },
  };
  vi.stubGlobal('mystApi', api);
  return api;
}

function setup() {
  const api = installApi();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onNavigate = vi.fn();
  const view = render(
    <QueryClientProvider client={client}><I18nProvider dictionary={locale}><DirtyNavigationProvider>
      <SettingsPage onNavigate={onNavigate} />
    </DirtyNavigationProvider></I18nProvider></QueryClientProvider>,
  );
  return { ...view, api, client, onNavigate };
}

test('renders all four sections with catalog-driven data', async () => {
  setup();
  expect(await screen.findByRole('heading', { name: locale.settings.aiConfig })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.settings.toolsTitle })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.settings.knowledge })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.settings.sessions })).toBeInTheDocument();
  expect(await screen.findByRole('option', { name: /V4 Flash · 1000000 ctx/ })).toBeInTheDocument();
  expect(await screen.findByText('user.md')).toBeInTheDocument();
  expect(await screen.findByText('星盘解读')).toBeInTheDocument();
  expect(await screen.findByText(locale.settings.maxTokensLimit.replace('{{count}}', '393216'))).toBeInTheDocument();
});

test('saving posts the draft with the model-aware maxTokens value', async () => {
  const { api } = setup();
  await screen.findByRole('heading', { name: locale.settings.aiConfig });
  await userEvent.click(await screen.findByRole('button', { name: locale.settings.save }));
  await waitFor(() => expect(api.ai.configurations.save).toHaveBeenCalled());
  const draft = (api.ai.configurations.save as ReturnType<typeof vi.fn>).mock.calls[0][0].settings;
  expect(draft.provider).toBe('deepseek');
  expect(draft.model).toBe('deepseek-v4-flash');
  expect(draft.maxTokens).toBe(4096); // 已存值原样生效（用户偏好优先）
  expect(await screen.findByText(locale.settings.saved)).toBeInTheDocument();
});

test('zero Max Tokens is saved and auto mode accepts custom context parameters', async () => {
  const { api } = setup();
  await screen.findByRole('option', { name: /V4 Flash · 1000000 ctx/ });
  const number = await screen.findByRole('spinbutton', { name: locale.settings.maxTokens });
  fireEvent.change(number, { target: { value: '0' } });
  fireEvent.blur(number);
  await userEvent.click(screen.getByRole('button', { name: locale.settings.save }));
  await waitFor(() => expect(api.ai.configurations.save).toHaveBeenCalled());
  expect(api.ai.configurations.save.mock.calls[0][0].settings).toMatchObject({ maxTokens: 0, maxTokensMode: 'custom' });
  await userEvent.selectOptions(screen.getByLabelText(locale.settings.tokenMode), 'context');
  fireEvent.change(screen.getByLabelText(locale.settings.contextWindow), { target: { value: '20000' } });
  fireEvent.change(screen.getByLabelText(locale.settings.outputLimit), { target: { value: '10000' } });
  await userEvent.click(screen.getByRole('button', { name: locale.settings.save }));
  await waitFor(() => expect(api.ai.configurations.save).toHaveBeenCalledTimes(2));
  expect(api.ai.configurations.save.mock.calls[1][0].settings).toMatchObject({ maxTokens: 0, maxTokensMode: 'context', contextWindow: 20000, maxOutputTokens: 10000 });
});

test('switching provider refetches models and re-clamps maxTokens to the next limit', async () => {
  const { api } = setup();
  await screen.findByRole('heading', { name: locale.settings.aiConfig });
  const catalog = api.ai.catalog as { models: ReturnType<typeof vi.fn> };
  catalog.models.mockResolvedValue({
    ok: true,
    data: [{ id: 'qwen3.7-max', name: 'Qwen3.7 Max', limitContext: 1000000, limitOutput: 65536, costInput: 2.5, costOutput: 7.5, releaseDate: '2026-05-21' }],
  });
  await screen.findByRole('option', { name: 'Ollama (本地)' }); // providers list committed
  await userEvent.selectOptions(screen.getByLabelText(locale.settings.provider), 'ollama');
  await waitFor(() => expect(catalog.models).toHaveBeenCalledWith('ollama'));
  expect(await screen.findByText(locale.settings.maxTokensLimit.replace('{{count}}', '65536'))).toBeInTheDocument();
});

test('switching provider preserves the stored maxTokens, clamped to the new limit', async () => {
  const { api } = setup();
  await screen.findByRole('heading', { name: locale.settings.aiConfig });
  // 已存 4096（status.maxTokens）；切 provider 后保留 4096，而非采用新模型完整上限
  await screen.findByRole('option', { name: 'Ollama (本地)' }); // providers list committed（镜像上一条 test 的等待方式）
  await userEvent.selectOptions(await screen.findByLabelText(locale.settings.provider), 'ollama');
  await waitFor(() => expect(api.ai.catalog.models).toHaveBeenCalledWith('ollama'));
  const save = await screen.findByRole('button', { name: locale.settings.save });
  await waitFor(() => expect(save).toBeEnabled()); // 目录到货 auto-select 首个模型后 save 才可用
  await userEvent.click(save);
  await waitFor(() => expect(api.ai.configurations.save).toHaveBeenCalled());
  const draft = (api.ai.configurations.save as ReturnType<typeof vi.fn>).mock.calls[0][0].settings;
  expect(draft.maxTokens).toBe(4096); // 用户偏好跨 provider 保留（Math.min 已按新上限 clamp）
});
