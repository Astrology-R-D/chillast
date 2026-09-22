import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import {
  invalidateLatestChartAiContext, publishLatestChartAiContext,
  resetChartAiContextPublisherForTests, subscribeChartAiContext,
} from '../charts/context/chartAiContextPublisher';
import { ContextStrip } from './ContextStrip';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({ apiClient: { setAiChartContext: vi.fn().mockResolvedValue(null) } }));

const dictionary = {
  ai: { contextStrip: 'AI 上下文', removeContext: '清除上下文' },
};

beforeEach(() => { resetChartAiContextPublisherForTests(); });

test('hidden without context; shows a summary and clears on demand', async () => {
  const user = userEvent.setup();
  const send = vi.fn().mockResolvedValue(null);
  const { rerender } = render(<I18nProvider dictionary={dictionary}><ContextStrip /></I18nProvider>);
  expect(screen.queryByText('AI 上下文')).not.toBeInTheDocument();

  publishLatestChartAiContext(Symbol('t'), {
    kind: 'western-chart', route: 'personal', resultId: 'r1', chartType: 'natal',
    activeProfile: { id: 'p1', displayName: '小紫' },
    successfulFilters: { type: 'natal', primary: { id: 'p1', displayName: '小紫' }, secondary: null, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
    draftSummary: { label: 'uncalculated', type: 'natal', houseSystem: 'placidus', zodiac: 'tropical', targetLocal: '2026-09-22T12:00' },
    focusedIdentity: 'natal:sun',
  } as never, send, () => {});
  rerender(<I18nProvider dictionary={dictionary}><ContextStrip /></I18nProvider>);
  expect(screen.getByText(/小紫/)).toBeInTheDocument();
  // 精确匹配盘型芯片（正则 /natal/ 会同时命中焦点芯片 natal:sun）
  expect(screen.getByText('natal')).toBeInTheDocument();
  expect(screen.getByText(/2026-09-22T12:00/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '清除上下文' }));
  expect(apiClient.setAiChartContext).toHaveBeenCalledWith(null);
  expect(screen.queryByText(/小紫/)).not.toBeInTheDocument();
});

test('publisher notifications refresh the strip', () => {
  publishLatestChartAiContext(Symbol('t'), { kind: 'western-chart', resultId: 'r2', activeProfile: null } as never,
    vi.fn().mockResolvedValue(null), () => {});
  render(<I18nProvider dictionary={dictionary}><ContextStrip /></I18nProvider>);
  expect(screen.getByText('AI 上下文')).toBeInTheDocument();
  // 渲染后的发布经订阅驱动 setState，需 act 保证 flush（repo 惯例：渲染后的外部 store 更新包 act）。
  act(() => {
    publishLatestChartAiContext(Symbol('t2'), { kind: 'western-chart', resultId: 'r3', activeProfile: { id: 'p', displayName: '后来' } } as never,
      vi.fn().mockResolvedValue(null), () => {});
  });
  expect(screen.getByText(/后来/)).toBeInTheDocument();
});
