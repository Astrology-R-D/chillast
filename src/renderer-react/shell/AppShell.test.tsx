import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
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
  profiles: { title: '档案管理' },
  chart: { personalTitle: '个人星盘', relationshipTitle: '合盘分析' },
  chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' },
  settings: { title: 'AI 设置', provider: '供应商', model: '模型' },
  shell: {
    loading: '正在加载…', placeholder: '{{title}}将在后续迁移中提供。', theme: '主题', density: '密度',
    aiConfigured: '已配置', aiNotConfigured: '未配置', retry: '重试', knowledgeCount: '知识库：{{count}} 篇文档',
  },
  appearance: { system: '跟随系统', light: '浅色', dark: '深色', compact: '紧凑', comfortable: '舒适' },
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
  });
});

afterEach(() => stopSync?.());

test('navigates localized placeholders and keeps route state across shell breakpoints', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(<I18nProvider dictionary={dictionary}><AppShell /></I18nProvider>);

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('档案管理');
  await user.click(screen.getByRole('button', { name: '个人星盘' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  expect(screen.getByText('个人星盘将在后续迁移中提供。')).toBeInTheDocument();

  act(() => media.setMatches(true));
  act(() => media.setMatches(false));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('个人星盘');
  expect(screen.getByRole('button', { name: '个人星盘' })).toHaveAttribute('aria-current', 'page');
});

test('persists theme and density selectors and updates the document', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  stopSync = startPreferenceSync(preferencesStore, media.matchMedia('(prefers-color-scheme: dark)'));
  const user = userEvent.setup();
  render(<I18nProvider dictionary={dictionary}><AppShell /></I18nProvider>);

  await user.selectOptions(screen.getByRole('combobox', { name: '主题' }), 'dark');
  await user.selectOptions(screen.getByRole('combobox', { name: '密度' }), 'comfortable');
  expect(localStorage.getItem('chillast.theme')).toBe('dark');
  expect(localStorage.getItem('chillast.density')).toBe('comfortable');
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(document.documentElement).toHaveAttribute('data-density', 'comfortable');
});
