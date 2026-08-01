import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';

const panelControl = vi.hoisted(() => ({
  ai: null as null | { collapse(): void; expand(): void },
  expansions: 0,
}));

vi.mock('react-resizable-panels', async () => {
  const React = await import('react');

  const Panel = React.forwardRef((props: Record<string, unknown>, forwardedRef) => {
    const { children, id, onCollapse, onExpand } = props as {
      children?: React.ReactNode;
      id?: string;
      onCollapse?: () => void;
      onExpand?: () => void;
    };
    const collapsed = React.useRef(false);
    const handle = {
      collapse() {
        collapsed.current = true;
        onCollapse?.();
      },
      expand() {
        panelControl.expansions += 1;
        collapsed.current = false;
        onExpand?.();
      },
      getId: () => id ?? '',
      getSize: () => (collapsed.current ? 0 : 27),
      isCollapsed: () => collapsed.current,
      isExpanded: () => !collapsed.current,
      resize() {},
    };
    React.useImperativeHandle(forwardedRef, () => handle);
    if (id === 'shell-ai-panel') panelControl.ai = handle;
    return <div data-panel-id={id}>{children}</div>;
  });

  return {
    Panel,
    PanelGroup: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
    PanelResizeHandle: ({ hidden, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div role="separator" hidden={hidden} {...props} />
    ),
  };
});

import { PanelLayout } from './PanelLayout';

beforeEach(() => {
  localStorage.clear();
  panelControl.ai = null;
  panelControl.expansions = 0;
});

test('mirrors runtime AI collapse and expansion into accessibility state', () => {
  render(
    <PanelLayout navigation={<div>导航</div>} ai={<button type="button">AI 操作</button>}>
      <div>主区</div>
    </PanelLayout>,
  );
  expect(screen.getByRole('complementary', { name: 'AI 助手' })).toBeInTheDocument();
  screen.getByRole('button', { name: 'AI 操作' }).focus();

  act(() => panelControl.ai?.collapse());
  const collapsedAside = document.querySelector('.shell__ai');
  expect(collapsedAside).toHaveAttribute('hidden');
  expect(collapsedAside).toHaveAttribute('inert');
  expect(collapsedAside).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('button', { name: 'AI 操作' })).not.toBeInTheDocument();
  expect(screen.getByRole('main', { name: '工作区' })).toHaveFocus();

  act(() => panelControl.ai?.expand());
  expect(screen.getByRole('complementary', { name: 'AI 助手' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'AI 操作' })).toBeInTheDocument();
});

test('imperatively expands a collapsed AI panel before desktop focus handoff', async () => {
  const media = createMatchMediaController(false);
  vi.stubGlobal('matchMedia', media.matchMedia);
  const user = userEvent.setup();
  render(
    <PanelLayout navigation={<div>导航</div>} ai={<div>AI</div>}>
      <div>主区</div>
    </PanelLayout>,
  );
  act(() => panelControl.ai?.collapse());
  act(() => media.setMatches(true));
  await user.click(screen.getByRole('button', { name: '打开 AI 助手' }));

  act(() => media.setMatches(false));

  expect(panelControl.expansions).toBe(1);
  expect(screen.getByRole('complementary', { name: 'AI 助手' })).toHaveFocus();
});
