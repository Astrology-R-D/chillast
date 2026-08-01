import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';
import { PanelLayout } from './PanelLayout';

const content = {
  navigation: <div>导航内容</div>,
  ai: <div>助手内容</div>,
  children: <div>工作内容</div>,
};

beforeEach(() => localStorage.clear());

test('renders navigation, main, AI, and two keyboard-accessible separators on desktop', async () => {
  const user = userEvent.setup();
  render(<PanelLayout {...content} />);

  expect(screen.getByRole('navigation', { name: '主导航' })).toHaveTextContent('导航内容');
  expect(screen.getByRole('main', { name: '工作区' })).toHaveTextContent('工作内容');
  expect(screen.getByRole('complementary', { name: 'AI 助手' })).toHaveTextContent('助手内容');

  const separators = screen.getAllByRole('separator');
  expect(separators).toHaveLength(2);
  expect(separators[0]).toHaveAttribute('aria-label', '调整导航栏宽度');
  expect(separators[1]).toHaveAttribute('aria-label', '调整 AI 助手宽度');
  separators[0].focus();
  await user.keyboard('{ArrowRight}');
  expect(separators[0]).toHaveFocus();
});

test('keeps AI absent on narrow screens until the opener is used', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(<PanelLayout {...content} />);

  expect(screen.queryByRole('complementary', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();

  const opener = screen.getByRole('button', { name: '打开 AI 助手' });
  await user.click(opener);

  const dialog = screen.getByRole('dialog', { name: 'AI 助手' });
  expect(dialog).toHaveTextContent('助手内容');
  expect(within(dialog).getByRole('button', { name: '关闭 AI 助手' })).toHaveFocus();
});

test('closes the narrow AI dialog with its button and restores focus', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(<PanelLayout {...content} />);
  const opener = screen.getByRole('button', { name: '打开 AI 助手' });

  await user.click(opener);
  await user.click(screen.getByRole('button', { name: '关闭 AI 助手' }));

  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test('closes the narrow AI dialog with Escape and a scrim click', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  const { container } = render(<PanelLayout {...content} />);
  const opener = screen.getByRole('button', { name: '打开 AI 助手' });

  await user.click(opener);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(opener).toHaveFocus();

  await user.click(opener);
  const scrim = container.querySelector('.shell__scrim');
  expect(scrim).not.toBeNull();
  await user.click(scrim!);
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test('traps focus inside the narrow AI dialog', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(
    <PanelLayout
      {...content}
      ai={
        <>
          <button type="button">第一个操作</button>
          <button type="button">最后一个操作</button>
        </>
      }
    />,
  );

  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  const dialog = screen.getByRole('dialog', { name: 'AI 助手' });
  const close = within(dialog).getByRole('button', { name: '关闭 AI 助手' });
  const last = within(dialog).getByRole('button', { name: '最后一个操作' });

  close.focus();
  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(last).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
});

test('switching from desktop to narrow does not open a stale AI overlay', () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  render(<PanelLayout {...content} />);

  expect(screen.getByRole('complementary', { name: 'AI 助手' })).toBeInTheDocument();
  act(() => media.setMatches(true));

  expect(screen.queryByRole('complementary', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开 AI 助手' })).toBeInTheDocument();
});

test('clamps stale persisted sizes and ignores the legacy AI width key', () => {
  localStorage.setItem('ai.sidebarWidth', '1');
  localStorage.setItem(
    'react-resizable-panels:chillast.shell.desktop',
    JSON.stringify({
      'shell-ai-panel,shell-main-panel,shell-navigation-panel': {
        expandToSizes: {},
        layout: [99, 0, 1],
      },
    }),
  );

  const { container } = render(<PanelLayout {...content} />);
  const navigationPanel = container.querySelector('[data-panel-id="shell-navigation-panel"]');
  const mainPanel = container.querySelector('[data-panel-id="shell-main-panel"]');
  const aiPanel = container.querySelector('[data-panel-id="shell-ai-panel"]');

  expect(Number(navigationPanel?.getAttribute('data-panel-size'))).toBeGreaterThanOrEqual(12);
  expect(Number(navigationPanel?.getAttribute('data-panel-size'))).toBeLessThanOrEqual(22);
  expect(Number(mainPanel?.getAttribute('data-panel-size'))).toBeGreaterThanOrEqual(42);
  expect(Number(aiPanel?.getAttribute('data-panel-size'))).toBeGreaterThanOrEqual(22);
  expect(Number(aiPanel?.getAttribute('data-panel-size'))).toBeLessThanOrEqual(40);
  expect(localStorage.getItem('ai.sidebarWidth')).toBe('1');
});
