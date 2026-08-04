import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { AppProviders } from '../AppProviders';
import { preferencesStore, startPreferenceSync } from '../preferences/preferences';
import { createMatchMediaController } from '../test/matchMedia';
import { AppShell, ChartWorkbenchRoute, createChartWorkbenchLoader, preloadChartWorkbench } from './AppShell';
import locale from '../../../locale/zh.json';
import type { Profile } from '../api/contracts';
import { apiClient } from '../api/client';
import type { ChartReferenceData } from '../features/charts/contracts';
import { DEFAULT_ASPECTS } from '../features/charts/workbench/chartDraft';

const dictionary = {
  ...locale,
  app: { title: 'CHILLAST' }, ai: { title: 'AI 占星顾问' },
  nav: {
    profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析',
    solarTerms: '节气年历', settings: '设置', groupProfiles: '档案', groupCharts: '星盘',
    groupChinese: '命理', groupTools: '工具',
  },
  profiles: { ...locale.profiles, title: '档案管理', directory: '测试档案目录' },
  chart: { ...locale.chart, personalTitle: '个人星盘', relationshipTitle: '合盘分析' },
  chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' },
  settings: { title: 'AI 设置', provider: '供应商', model: '模型' },
  shell: {
    ...locale.shell,
    loading: '正在读取状态…', placeholder: '{{title}}将在后续迁移阶段启用', theme: '主题', density: '密度',
    aiConfigured: 'AI 已配置', aiNotConfigured: 'AI 未配置', retry: '重试', knowledgeCount: '知识库：{{count}} 篇文档',
    openAi: '本地化打开助手', closeAi: '本地化关闭助手',
    resizeNavigation: '本地化调整导航', resizeAi: '本地化调整 AI',
    navigationRegion: '本地化导航区域', workspaceRegion: '本地化工作区域', aiRegion: '本地化 AI 区域',
  },
  appearance: { system: '跟随系统', light: '亮色', dark: '深色', compact: '紧凑', comfortable: '均衡' },
  dirty: { title: '保存更改？', description: '存在未保存更改', save: '保存并继续', discard: '放弃更改', cancel: '取消', saving: '保存中', saveFailed: '保存失败' },
};
const profile: Profile = {
  id: 'shell-p1', nameZh: '烟测档案', nameEn: 'Smoke Profile', gender: 'other',
  birthData: { year: 1990, month: 1, day: 2, hour: 3, minute: 4, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  notes: '原备注', tags: ['Smoke'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
let stopSync: (() => void) | undefined;

beforeAll(async () => {
  await preloadChartWorkbench();
});

beforeEach(() => {
  localStorage.clear();
  preferencesStore.getState().setTheme('system');
  preferencesStore.getState().setDensity('compact');
  vi.stubGlobal('mystApi', {
    getConfig: vi.fn(), getLocale: vi.fn(),
    ai: {
      status: vi.fn().mockResolvedValue({ ok: true, data: { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 } }),
      onStatusChanged: vi.fn(() => vi.fn()), initStatus: vi.fn(), onInitProgress: vi.fn(),
    },
    profiles: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }), save: vi.fn(), remove: vi.fn() },
    app: { onCloseRequested: vi.fn(() => () => {}), decideClose: vi.fn().mockResolvedValue({ ok: true, data: true }) },
  });
  vi.spyOn(apiClient, 'getChartCatalog').mockResolvedValue([]);
  vi.spyOn(apiClient, 'getChartReference').mockResolvedValue({
    aspects: Object.fromEntries(DEFAULT_ASPECTS.map((key) => [key, { nameEn: key, nameZh: key, angle: 0, defaultOrb: 5, level: 'major', glyph: '*' }])),
    houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: '普拉西德' }],
    chartTypes: [], signs: [], points: {}, elements: {}, modalities: {},
  } as unknown as ChartReferenceData);
});

function renderShell() {
  return render(<AppProviders><I18nProvider dictionary={dictionary}><AppShell /></I18nProvider></AppProviders>);
}

function seedEditableProfile() {
  let current = profile;
  const api = window.mystApi;
  vi.mocked(api.profiles.list).mockImplementation(async () => ({ ok: true, data: [current] }));
  vi.mocked(api.profiles.save).mockImplementation(async (input) => {
    current = { ...profile, ...input, updatedAt: '2026-01-02T00:00:00.000Z' } as Profile;
    return { ok: true, data: current };
  });
  Object.assign(api, { locations: { resolve: vi.fn().mockResolvedValue({ ok: true, data: { timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '1990-01-01T00:00:00.000Z' } }) } });
  return api.profiles.save;
}

function expectNoReactActWarnings() {
  const warnings: string[] = [];
  const originalError = console.error;
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (/suspended inside an `act` scope|not wrapped in act/i.test(message)) warnings.push(message);
    originalError(...args);
  });
  return () => {
    errorSpy.mockRestore();
    expect(warnings).toEqual([]);
  };
}

afterEach(() => {
  stopSync?.();
  vi.restoreAllMocks();
});

test('navigates localized placeholders and keeps route state across shell breakpoints', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  renderShell();

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('档案管理');
  expect(await screen.findByRole('complementary', { name: '测试档案目录' })).toBeInTheDocument();
  expect(screen.getAllByRole('main')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: '个人星盘' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  expect(await screen.findByRole('group', { name: '星盘筛选' })).toBeInTheDocument();
  expect(screen.getByRole('main').querySelector('.workspace')).toHaveClass('workspace--chart');

  act(() => media.setMatches(true));
  act(() => media.setMatches(false));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  expect(screen.getByRole('button', { name: '个人星盘' })).toHaveAttribute('aria-current', 'page');
});

test('recovers a rejected chart chunk through route-local retry', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const user = userEvent.setup();
  const Page = ({ route }: { route: string }) => <div role="group" aria-label={`loaded-${route}`} />;
  const importer = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue({ ChartWorkbenchPage: Page });
  const loader = createChartWorkbenchLoader(importer);
  render(<I18nProvider dictionary={dictionary}><ChartWorkbenchRoute route="personal" loader={loader} /></I18nProvider>);

  expect(await screen.findByRole('alert')).toHaveTextContent('chunk failed');
  await user.click(screen.getByRole('button', { name: locale.chart.workbench.retry }));
  expect(await screen.findByRole('group', { name: 'loaded-personal' })).toBeInTheDocument();
  expect(importer).toHaveBeenCalledTimes(2);
  errorSpy.mockRestore();
});

test('recovers a rejected chart chunk by navigating to another chart route', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const Page = ({ route }: { route: string }) => <div role="group" aria-label={`loaded-${route}`} />;
  const importer = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue({ ChartWorkbenchPage: Page });
  const loader = createChartWorkbenchLoader(importer);
  const view = render(<I18nProvider dictionary={dictionary}><ChartWorkbenchRoute route="personal" loader={loader} /></I18nProvider>);
  await screen.findByRole('alert');

  view.rerender(<I18nProvider dictionary={dictionary}><ChartWorkbenchRoute route="relationship" loader={loader} /></I18nProvider>);
  expect(await screen.findByRole('group', { name: 'loaded-relationship' })).toBeInTheDocument();
  expect(importer).toHaveBeenCalledTimes(2);
});

test('passes locale-provided accessibility labels through the application shell', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  renderShell();

  expect(screen.getByRole('navigation', { name: '本地化导航区域' })).toBeInTheDocument();
  expect(screen.getByRole('main', { name: '本地化工作区域' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: '本地化 AI 区域' })).toBeInTheDocument();
  expect(screen.getByRole('separator', { name: '本地化调整导航' })).toBeInTheDocument();
  expect(screen.getByRole('separator', { name: '本地化调整 AI' })).toBeInTheDocument();

  act(() => media.setMatches(true));
  await user.click(screen.getByRole('button', { name: '本地化打开助手' }));
  expect(screen.getByRole('button', { name: '本地化关闭助手' })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '本地化 AI 区域' })).toBeInTheDocument();
});

test('persists theme and density selectors and updates the document', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  stopSync = startPreferenceSync(preferencesStore, media.matchMedia('(prefers-color-scheme: dark)'));
  const user = userEvent.setup();
  renderShell();

  await user.selectOptions(screen.getByRole('combobox', { name: '主题' }), 'dark');
  await user.selectOptions(screen.getByRole('combobox', { name: '密度' }), 'comfortable');
  expect(localStorage.getItem('chillast.theme')).toBe('dark');
  expect(localStorage.getItem('chillast.density')).toBe('comfortable');
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(document.documentElement).toHaveAttribute('data-density', 'comfortable');
});

test('dirty shell navigation cancels in place and discards before navigating', async () => {
  const assertNoActWarnings = expectNoReactActWarnings();
  seedEditableProfile();
  vi.stubGlobal('matchMedia', createMatchMediaController(false).matchMedia);
  const user = userEvent.setup();
  renderShell();
  await screen.findByRole('heading', { name: '烟测档案' });
  await user.click(screen.getByRole('button', { name: '编辑档案' }));
  await user.type(screen.getByRole('textbox', { name: '备注' }), '未保存');
  await act(async () => { await user.click(screen.getByRole('button', { name: '个人星盘' })); });
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: locale.dirty.cancel }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('档案管理');
  expect(screen.getByRole('form', { name: '编辑档案' })).toBeInTheDocument();
  await act(async () => { await user.click(screen.getByRole('button', { name: '个人星盘' })); });
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: locale.dirty.discard }));
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  assertNoActWarnings();
}, 10_000);

test('dirty shell navigation saves the backend update before continuing', async () => {
  const assertNoActWarnings = expectNoReactActWarnings();
  const save = seedEditableProfile();
  vi.stubGlobal('matchMedia', createMatchMediaController(false).matchMedia);
  const user = userEvent.setup();
  renderShell();
  await screen.findByRole('heading', { name: '烟测档案' });
  await user.click(screen.getByRole('button', { name: '编辑档案' }));
  const notes = screen.getByRole('textbox', { name: '备注' });
  await user.clear(notes); await user.type(notes, '已保存后导航');
  await act(async () => { await user.click(screen.getByRole('button', { name: '个人星盘' })); });
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: locale.dirty.save }));
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ notes: '已保存后导航' })));
  assertNoActWarnings();
}, 10_000);
