import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';
import { PanelLayout, PANEL_STORAGE_ENTRY_KEY, PANEL_STORAGE_KEY } from './PanelLayout';

const labels = {
  openAi: '打开 AI', closeAi: '关闭 AI', resizeNavigation: '调整导航', resizeAi: '调整 AI',
  navigationRegion: '导航区', workspaceRegion: '工作区', aiRegion: 'AI 区',
};

function renderLayout(signal: number | undefined, narrow = false) {
  const media = createMatchMediaController(narrow);
  vi.stubGlobal('matchMedia', media.matchMedia);
  return render(<PanelLayout navigation={<nav />} ai={<div>AI 内容</div>} labels={labels} aiOpenSignal={signal}>
    <main />
  </PanelLayout>);
}

test('a desktop signal bump expands a collapsed ai panel', () => {
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({
    [PANEL_STORAGE_ENTRY_KEY]: {
      layout: [16, 84, 0],
      expandToSizes: { 'shell-ai-panel': 27, 'shell-main-panel': 57, 'shell-navigation-panel': 16 },
    },
  }));
  const { rerender } = renderLayout(0);
  const aside = screen.getByRole('complementary', { hidden: true });
  expect(aside).toHaveAttribute('hidden');
  rerender(<PanelLayout navigation={<nav />} ai={<div>AI 内容</div>} labels={labels} aiOpenSignal={1}><main /></PanelLayout>);
  expect(screen.getByRole('complementary', { name: 'AI 区' })).not.toHaveAttribute('hidden');
  localStorage.clear();
});

test('a narrow signal bump opens the ai overlay dialog', () => {
  const { rerender } = renderLayout(0, true);
  expect(screen.queryByRole('dialog', { name: 'AI 区' })).toBeNull();
  rerender(<PanelLayout navigation={<nav />} ai={<div>AI 内容</div>} labels={labels} aiOpenSignal={1}><main /></PanelLayout>);
  expect(screen.getByRole('dialog', { name: 'AI 区' })).toBeInTheDocument();
  localStorage.clear();
});
