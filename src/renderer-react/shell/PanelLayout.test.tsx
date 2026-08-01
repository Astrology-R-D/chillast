import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';
import {
  PANEL_AUTO_SAVE_ID,
  PANEL_SIZES,
  PANEL_STORAGE,
  PanelLayout,
  resizePanelSizesByKeyboard,
  sanitizePersistedPanelLayout,
} from './PanelLayout';

const content = {
  navigation: <div>导航内容</div>,
  ai: <div>助手内容</div>,
  children: <div>工作内容</div>,
};

beforeEach(() => localStorage.clear());

test('renders navigation, main, AI, and two keyboard-accessible separators on desktop', async () => {
  const user = userEvent.setup();
  const { container } = render(<PanelLayout {...content} />);

  expect(screen.getByRole('navigation', { name: '主导航' })).toHaveTextContent('导航内容');
  expect(screen.getByRole('main', { name: '工作区' })).toHaveTextContent('工作内容');
  expect(screen.getByRole('complementary', { name: 'AI 助手' })).toHaveTextContent('助手内容');
  expect(container.querySelector('[data-panel-id="shell-navigation-panel"]')).toHaveAttribute(
    'data-panel-size',
    '16.0',
  );
  expect(container.querySelector('[data-panel-id="shell-main-panel"]')).toHaveAttribute(
    'data-panel-size',
    '57.0',
  );
  expect(container.querySelector('[data-panel-id="shell-ai-panel"]')).toHaveAttribute(
    'data-panel-size',
    '27.0',
  );

  const separators = screen.getAllByRole('separator');
  expect(separators).toHaveLength(2);
  expect(separators[0]).toHaveAttribute('aria-label', '调整导航栏宽度');
  expect(separators[1]).toHaveAttribute('aria-label', '调整 AI 助手宽度');
  separators[0].focus();
  await user.keyboard('{ArrowRight}');
  expect(separators[0]).toHaveFocus();
});

test('exports the immutable desktop panel contract', () => {
  expect(PANEL_AUTO_SAVE_ID).toBe('chillast.shell.desktop');
  expect(PANEL_SIZES).toEqual({
    navigation: { defaultSize: 16, minSize: 12, maxSize: 22, collapsedSize: 5 },
    main: { defaultSize: 57, minSize: 42 },
    ai: { defaultSize: 27, minSize: 22, maxSize: 40, collapsedSize: 0 },
  });
  expect(Object.isFrozen(PANEL_SIZES)).toBe(true);
  expect(Object.isFrozen(PANEL_SIZES.navigation)).toBe(true);
});

test.each([
  {
    name: 'grows expanded navigation up to its maximum',
    layout: [16, 57, 27],
    handle: 0,
    key: 'ArrowRight',
    expected: [22, 51, 27],
  },
  {
    name: 'collapses navigation from its minimum',
    layout: [12, 61, 27],
    handle: 0,
    key: 'ArrowLeft',
    expected: [5, 68, 27],
  },
  {
    name: 'keeps navigation collapsed when shrinking again',
    layout: [5, 68, 27],
    handle: 0,
    key: 'ArrowLeft',
    expected: [5, 68, 27],
  },
  {
    name: 'expands collapsed navigation to its minimum',
    layout: [5, 68, 27],
    handle: 0,
    key: 'ArrowRight',
    expected: [12, 61, 27],
  },
  {
    name: 'collapses AI from its minimum',
    layout: [16, 62, 22],
    handle: 1,
    key: 'ArrowRight',
    expected: [16, 84, 0],
  },
  {
    name: 'expands collapsed AI to its minimum',
    layout: [16, 84, 0],
    handle: 1,
    key: 'ArrowLeft',
    expected: [16, 62, 22],
  },
  {
    name: 'respects navigation maximum',
    layout: [22, 51, 27],
    handle: 0,
    key: 'ArrowRight',
    expected: [22, 51, 27],
  },
  {
    name: 'respects main minimum while expanding AI',
    layout: [22, 42, 36],
    handle: 1,
    key: 'ArrowLeft',
    expected: [22, 42, 36],
  },
  {
    name: 'sanitizes stale input before resizing',
    layout: [99, 0, 1],
    handle: 0,
    key: 'ArrowRight',
    expected: [22, 56, 22],
  },
])('$name', ({ layout, handle, key, expected }) => {
  const original = [...layout];
  const result = resizePanelSizesByKeyboard(layout, handle, key);

  expect(result).toEqual(expected);
  expect(result.reduce((sum, size) => sum + size, 0)).toBe(100);
  expect(layout).toEqual(original);
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

test('switching an open narrow AI dialog to desktop focuses the desktop AI panel', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  const { container } = render(<PanelLayout {...content} />);

  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  expect(screen.getByRole('dialog', { name: 'AI 助手' })).toBeInTheDocument();
  act(() => media.setMatches(false));

  const desktopAi = screen.getByRole('complementary', { name: 'AI 助手' });
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(container.querySelector('.shell__scrim')).not.toBeInTheDocument();
  expect(desktopAi).toHaveFocus();

  act(() => media.setMatches(true));
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
});

test('clamps stale persisted sizes and ignores the legacy AI width key', () => {
  localStorage.setItem('ai.sidebarWidth', '1');
  localStorage.setItem(
    `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`,
    JSON.stringify({
      'shell-ai-panel,shell-main-panel,shell-navigation-panel': {
        expandToSizes: {},
        layout: [99, 0, 1],
      },
    }),
  );

  expect(sanitizePersistedPanelLayout([18, 55, 27])).toEqual([18, 55, 27]);
  expect(sanitizePersistedPanelLayout([5, 68, 27])).toEqual([5, 68, 27]);
  expect(sanitizePersistedPanelLayout([16, 84, 0])).toEqual([16, 84, 0]);
  expect(sanitizePersistedPanelLayout([99, 0, 1])).toEqual([22, 56, 22]);
  expect(sanitizePersistedPanelLayout([16, Number.NaN, 27])).toBeNull();
  const stored = PANEL_STORAGE.getItem(`react-resizable-panels:${PANEL_AUTO_SAVE_ID}`);
  expect(JSON.parse(stored!)).toMatchObject({
    'shell-ai-panel,shell-main-panel,shell-navigation-panel': { layout: [22, 56, 22] },
  });
  expect(localStorage.getItem('ai.sidebarWidth')).toBe('1');
});
