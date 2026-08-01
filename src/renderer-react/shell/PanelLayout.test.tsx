import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
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

function StatefulProbe({ label, onMount }: { label: string; onMount: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(onMount, [onMount]);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      {label}: {count}
    </button>
  );
}

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
    name: 'grows AI by shrinking navigation after main reaches its minimum',
    layout: [22, 42, 36],
    handle: 1,
    key: 'ArrowLeft',
    expected: [18, 42, 40],
  },
  {
    name: 'grows navigation by shrinking AI after main reaches its minimum',
    layout: [18, 42, 40],
    handle: 0,
    key: 'ArrowRight',
    expected: [22, 42, 36],
  },
  {
    name: 'stays unchanged when the expanding side has no aggregate capacity',
    layout: [18, 42, 40],
    handle: 1,
    key: 'ArrowLeft',
    expected: [18, 42, 40],
  },
  {
    name: 'stays unchanged when navigation is already at maximum',
    layout: [22, 42, 36],
    handle: 0,
    key: 'ArrowRight',
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

test('isolates the background and skips hidden or inert controls when trapping focus', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(
    <PanelLayout
      navigation={<button type="button">背景导航操作</button>}
      ai={
        <>
          <button type="button" style={{ display: 'none' }}>CSS 隐藏操作</button>
          <div inert><button type="button">惰性操作</button></div>
          <button type="button">可见首项</button>
          <button type="button">可见末项</button>
          <button type="button" hidden>隐藏操作</button>
        </>
      }
    >
      <button type="button">背景主操作</button>
    </PanelLayout>,
  );

  const closedAi = document.querySelector('.shell__ai');
  expect(closedAi).toHaveAttribute('inert');
  expect(closedAi).toHaveAttribute('hidden');
  expect(screen.queryByRole('button', { name: '可见首项' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  const dialog = screen.getByRole('dialog', { name: 'AI 助手' });
  const navigation = document.querySelector('.shell__navigation');
  const main = document.querySelector('.shell__main');
  expect(navigation).toHaveAttribute('inert');
  expect(navigation).toHaveAttribute('aria-hidden', 'true');
  expect(main).toHaveAttribute('inert');
  expect(main).toHaveAttribute('aria-hidden', 'true');

  const close = within(dialog).getByRole('button', { name: '关闭 AI 助手' });
  const last = within(dialog).getByRole('button', { name: '可见末项' });
  const backgroundMainAction = screen.getByRole('button', { name: '背景主操作', hidden: true });
  backgroundMainAction.focus();
  expect(close).toHaveFocus();
  close.focus();
  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(last).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  expect(screen.getByRole('button', { name: '背景导航操作', hidden: true })).not.toHaveFocus();
  expect(backgroundMainAction).not.toHaveFocus();
});

test('keeps child state and mount identity across breakpoints and narrow AI toggles', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  const mounts = { navigation: 0, main: 0, ai: 0 };
  const onNavigationMount = () => { mounts.navigation += 1; };
  const onMainMount = () => { mounts.main += 1; };
  const onAiMount = () => { mounts.ai += 1; };
  render(
    <PanelLayout
      navigation={<StatefulProbe label="导航状态" onMount={onNavigationMount} />}
      ai={<StatefulProbe label="AI 状态" onMount={onAiMount} />}
    >
      <StatefulProbe label="主状态" onMount={onMainMount} />
    </PanelLayout>,
  );

  await user.click(screen.getByRole('button', { name: '导航状态: 0' }));
  await user.click(screen.getByRole('button', { name: '主状态: 0' }));
  await user.click(screen.getByRole('button', { name: 'AI 状态: 0' }));
  act(() => media.setMatches(true));

  expect(screen.getByRole('button', { name: '导航状态: 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '主状态: 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'AI 状态: 1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  expect(screen.getByRole('button', { name: 'AI 状态: 1' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '关闭 AI 助手' }));
  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  expect(screen.getByRole('button', { name: 'AI 状态: 1' })).toBeInTheDocument();

  act(() => media.setMatches(false));
  expect(screen.getByRole('button', { name: '导航状态: 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '主状态: 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'AI 状态: 1' })).toBeInTheDocument();
  expect(mounts).toEqual({ navigation: 1, main: 1, ai: 1 });
});

test('does not close the narrow AI dialog when a child consumes Escape', async () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(
    <PanelLayout
      {...content}
      ai={
        <button type="button" onKeyDown={(event) => {
          if (event.key === 'Escape') event.preventDefault();
        }}>
          消费 Escape
        </button>
      }
    />,
  );

  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  const consumer = screen.getByRole('button', { name: '消费 Escape' });
  consumer.focus();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog', { name: 'AI 助手' })).toBeInTheDocument();
  expect(consumer).toHaveFocus();
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
  expect(container.querySelector('.shell__scrim')).toHaveAttribute('hidden');
  expect(desktopAi).toHaveFocus();

  act(() => media.setMatches(true));
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
});

test('moves desktop AI focus to the narrow opener without opening the dialog', () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  render(<PanelLayout {...content} ai={<button type="button">桌面 AI 操作</button>} />);
  const desktopAiAction = screen.getByRole('button', { name: '桌面 AI 操作' });
  desktopAiAction.focus();

  act(() => media.setMatches(true));

  const opener = screen.getByRole('button', { name: '打开 AI 助手' });
  expect(opener).toHaveFocus();
  expect(screen.queryByRole('dialog', { name: 'AI 助手' })).not.toBeInTheDocument();
  expect(document.activeElement).not.toHaveAttribute('hidden');
  expect(document.activeElement).not.toHaveAttribute('inert');
});

test('moves narrow opener focus to desktop AI when the dialog is closed', () => {
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  render(<PanelLayout {...content} />);
  screen.getByRole('button', { name: '打开 AI 助手' }).focus();

  act(() => media.setMatches(false));

  const desktopAi = screen.getByRole('complementary', { name: 'AI 助手' });
  expect(desktopAi).toHaveFocus();
  expect(desktopAi).not.toHaveAttribute('hidden');
  expect(desktopAi).not.toHaveAttribute('inert');
});

test('initializes a persisted collapsed desktop AI panel as hidden and inert', async () => {
  const key = `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`;
  localStorage.setItem(key, JSON.stringify({
    'shell-ai-panel,shell-main-panel,shell-navigation-panel': {
      layout: [16, 84, 0],
      expandToSizes: { 'shell-ai-panel': 27 },
    },
  }));
  const user = userEvent.setup();
  render(
    <PanelLayout {...content} ai={<button type="button">折叠 AI 操作</button>}>
      <button type="button">主区停靠点</button>
    </PanelLayout>,
  );

  const aiAside = document.querySelector('.shell__ai');
  const aiAction = screen.getByRole('button', { name: '折叠 AI 操作', hidden: true });
  expect(aiAside).toHaveAttribute('hidden');
  expect(aiAside).toHaveAttribute('inert');
  expect(aiAside).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('complementary', { name: 'AI 助手' })).not.toBeInTheDocument();

  screen.getByRole('button', { name: '主区停靠点' }).focus();
  await user.tab();
  expect(aiAction).not.toHaveFocus();
});

test('expands a collapsed desktop AI before focusing it from an open narrow dialog', async () => {
  const key = `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`;
  localStorage.setItem(key, JSON.stringify({
    'shell-ai-panel,shell-main-panel,shell-navigation-panel': {
      layout: [16, 84, 0],
      expandToSizes: { 'shell-ai-panel': 27 },
    },
  }));
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(<PanelLayout {...content} />);

  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));
  act(() => media.setMatches(false));

  const desktopAi = screen.getByRole('complementary', { name: 'AI 助手' });
  expect(desktopAi).not.toHaveAttribute('hidden');
  expect(desktopAi).not.toHaveAttribute('inert');
  expect(desktopAi).toHaveFocus();
});

test('moves closed narrow opener focus to main when desktop AI remains collapsed', () => {
  const key = `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`;
  localStorage.setItem(key, JSON.stringify({
    'shell-ai-panel,shell-main-panel,shell-navigation-panel': {
      layout: [16, 84, 0],
      expandToSizes: { 'shell-ai-panel': 27 },
    },
  }));
  const media = createMatchMediaController(true);
  vi.stubGlobal('matchMedia', media.matchMedia);
  render(<PanelLayout {...content} />);
  screen.getByRole('button', { name: '打开 AI 助手' }).focus();

  act(() => media.setMatches(false));

  const main = screen.getByRole('main', { name: '工作区' });
  expect(main).toHaveFocus();
  expect(main).not.toHaveAttribute('hidden');
  expect(main).not.toHaveAttribute('inert');
  expect(screen.queryByRole('complementary', { name: 'AI 助手' })).not.toBeInTheDocument();
});

test('does not steal focus from navigation or main across closed breakpoint transitions', () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  render(
    <PanelLayout
      navigation={<button type="button">导航焦点</button>}
      ai={<button type="button">AI 焦点</button>}
    >
      <button type="button">主区焦点</button>
    </PanelLayout>,
  );
  const navigationAction = screen.getByRole('button', { name: '导航焦点' });
  navigationAction.focus();

  act(() => media.setMatches(true));
  expect(navigationAction).toHaveFocus();

  const mainAction = screen.getByRole('button', { name: '主区焦点' });
  mainAction.focus();
  act(() => media.setMatches(false));
  expect(mainAction).toHaveFocus();
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

test('removes malformed persisted entries and preserves valid schema entries', () => {
  const key = `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`;
  localStorage.setItem(key, JSON.stringify({
    valid: { layout: [18, 55, 27], expandToSizes: { 'shell-ai-panel': 27 } },
    primitive: 'bad',
    missingLayout: { expandToSizes: {} },
    missingExpand: { layout: [18, 55, 27] },
    nullExpand: { layout: [18, 55, 27], expandToSizes: null },
    arrayExpand: { layout: [18, 55, 27], expandToSizes: [] },
    badExpandKey: { layout: [18, 55, 27], expandToSizes: { '': 27 } },
    reservedExpandKey: { layout: [18, 55, 27], expandToSizes: { ['__proto__']: 27 } },
    badExpandSize: { layout: [18, 55, 27], expandToSizes: { ai: 'wide' } },
    negativeExpandSize: { layout: [18, 55, 27], expandToSizes: { ai: -1 } },
    oversizedExpandSize: { layout: [18, 55, 27], expandToSizes: { ai: 101 } },
    infiniteExpandSize: { layout: [18, 55, 27], expandToSizes: { ai: Number.POSITIVE_INFINITY } },
  }));

  expect(JSON.parse(PANEL_STORAGE.getItem(key)!)).toEqual({
    valid: { layout: [18, 55, 27], expandToSizes: { 'shell-ai-panel': 27 } },
  });

  localStorage.setItem(key, JSON.stringify({ panelKey: 'bad' }));
  expect(PANEL_STORAGE.getItem(key)).toBe('{}');
});

test('contains storage read and write failures', () => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => { throw new Error('read failed'); }),
    setItem: vi.fn(() => { throw new Error('write failed'); }),
  });

  expect(PANEL_STORAGE.getItem(`react-resizable-panels:${PANEL_AUTO_SAVE_ID}`)).toBeNull();
  expect(() => PANEL_STORAGE.setItem('key', 'value')).not.toThrow();
});
