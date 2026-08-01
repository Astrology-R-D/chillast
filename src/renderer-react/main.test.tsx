import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

test('loads locale and renders the localized application shell', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  const dictionary = {
    app: { title: 'CHILLAST' }, ai: { title: 'AI 占星顾问' },
    nav: {
      profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析',
      solarTerms: '节气年历', settings: '设置', groupProfiles: '档案', groupCharts: '星盘',
      groupChinese: '命理', groupTools: '工具',
    },
    profiles: { title: '档案管理' }, chart: { personalTitle: '个人星盘', relationshipTitle: '合盘分析' },
    chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' },
    settings: { title: 'AI 设置', provider: '供应商', model: '模型' },
    shell: { loading: '加载', placeholder: '{{title}}待迁移', theme: '主题', density: '密度', aiConfigured: '已配置', aiNotConfigured: '未配置', retry: '重试', knowledgeCount: '{{count}} 篇' },
    appearance: { system: '系统', light: '浅色', dark: '深色', compact: '紧凑', comfortable: '舒适' },
  };
  const getLocale = vi.fn().mockResolvedValue({ ok: true, data: dictionary });
  vi.stubGlobal('mystApi', {
    getLocale,
    getConfig: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    ai: {
      status: vi.fn().mockResolvedValue({ ok: true, data: { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 } }),
      onStatusChanged: vi.fn(() => vi.fn()), initStatus: vi.fn(), onInitProgress: vi.fn(),
    },
  });

  await import('./main');

  expect(await screen.findByRole('heading', { level: 1, name: '档案管理' })).toBeInTheDocument();
  expect(getLocale).toHaveBeenCalledTimes(1);
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system');
  expect(document.documentElement).toHaveAttribute('data-density', 'compact');
});
