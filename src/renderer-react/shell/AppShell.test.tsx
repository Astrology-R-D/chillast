import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { AppProviders } from '../AppProviders';
import { preferencesStore, startPreferenceSync } from '../preferences/preferences';
import { createMatchMediaController } from '../test/matchMedia';
import { AppShell } from './AppShell';

const dictionary = {
  app: { title: 'CHILLAST' }, ai: { title: 'AI 占星顾问' },
  nav: {
    profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析',
    solarTerms: '节气年历', settings: '设置', groupProfiles: '档案', groupCharts: '星盘',
    groupChinese: '命理', groupTools: '工具',
  },
  profiles: { title: '档案管理', directory: '测试档案目录', panelHeading: '档案库 ({{count}})', create: '新建档案', filters: '档案筛选', search: '搜索档案', recent: '最近使用', recentAll: '全部', recent7d: '7 天', recent30d: '30 天', sort: '排序方式', sortUpdated: '最近更新', sortName: '姓名', sortBirth: '出生', sortRecent: '最近使用', list: '档案列表', emptyLibrary: '档案库为空', noResults: '无结果', selectPrompt: '请选择' },
  chart: { personalTitle: '个人星盘', relationshipTitle: '合盘分析' },
  chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' },
  settings: { title: 'AI 设置', provider: '供应商', model: '模型' },
  shell: {
    loading: '正在读取状态…', placeholder: '{{title}}将在后续迁移阶段启用', theme: '主题', density: '密度',
    aiConfigured: 'AI 已配置', aiNotConfigured: 'AI 未配置', retry: '重试', knowledgeCount: '知识库：{{count}} 篇文档',
    openAi: '本地化打开助手', closeAi: '本地化关闭助手',
    resizeNavigation: '本地化调整导航', resizeAi: '本地化调整 AI',
    navigationRegion: '本地化导航区域', workspaceRegion: '本地化工作区域', aiRegion: '本地化 AI 区域',
  },
  appearance: { system: '跟随系统', light: '亮色', dark: '深色', compact: '紧凑', comfortable: '均衡' },
  dirty: { title: '保存更改？', description: '存在未保存更改', save: '保存并继续', discard: '放弃更改', cancel: '取消', saving: '保存中', saveFailed: '保存失败' },
};
let stopSync: (() => void) | undefined;

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
});

function renderShell() {
  return render(<AppProviders><I18nProvider dictionary={dictionary}><AppShell /></I18nProvider></AppProviders>);
}

afterEach(() => stopSync?.());

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
  expect(screen.getByText('个人星盘将在后续迁移阶段启用')).toBeInTheDocument();

  act(() => media.setMatches(true));
  act(() => media.setMatches(false));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  expect(screen.getByRole('button', { name: '个人星盘' })).toHaveAttribute('aria-current', 'page');
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
