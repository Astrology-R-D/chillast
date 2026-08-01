import { Bot, X } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useNarrowLayout } from './useNarrowLayout';

export interface PanelLayoutProps {
  navigation: ReactNode;
  ai: ReactNode;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const PANEL_AUTO_SAVE_ID = 'chillast.shell.desktop';

export const PANEL_SIZES = Object.freeze({
  navigation: Object.freeze({ defaultSize: 16, minSize: 12, maxSize: 22, collapsedSize: 5 }),
  main: Object.freeze({ defaultSize: 57, minSize: 42 }),
  ai: Object.freeze({ defaultSize: 27, minSize: 22, maxSize: 40, collapsedSize: 0 }),
});

const PANEL_CONSTRAINTS = [PANEL_SIZES.navigation, PANEL_SIZES.main, PANEL_SIZES.ai];
const KEYBOARD_RESIZE_BY = 6;
const PANEL_STORAGE_KEY = `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`;

export function sanitizePersistedPanelLayout(layout: unknown): number[] | null {
  if (
    !Array.isArray(layout) ||
    layout.length !== PANEL_CONSTRAINTS.length ||
    !layout.every((size) => typeof size === 'number' && Number.isFinite(size))
  ) {
    return null;
  }

  const total = layout.reduce<number>((sum, size) => sum + size, 0);
  const navigationIsValid =
    layout[0] === PANEL_SIZES.navigation.collapsedSize ||
    (layout[0] >= PANEL_SIZES.navigation.minSize && layout[0] <= PANEL_SIZES.navigation.maxSize);
  const mainIsValid = layout[1] >= PANEL_SIZES.main.minSize;
  const aiIsValid =
    layout[2] === PANEL_SIZES.ai.collapsedSize ||
    (layout[2] >= PANEL_SIZES.ai.minSize && layout[2] <= PANEL_SIZES.ai.maxSize);
  if (Math.abs(total - 100) < 0.001 && navigationIsValid && mainIsValid && aiIsValid) {
    return [...layout];
  }

  const minimums = PANEL_CONSTRAINTS.map((constraints) => constraints.minSize);
  const maximums = [
    PANEL_SIZES.navigation.maxSize,
    100 - PANEL_SIZES.navigation.minSize - PANEL_SIZES.ai.minSize,
    PANEL_SIZES.ai.maxSize,
  ];
  const next = layout.map((size, index) =>
    Math.min(maximums[index]!, Math.max(minimums[index]!, size)),
  );
  let remaining = 100 - next.reduce((total, size) => total + size, 0);

  for (const index of [1, 2, 0]) {
    if (Math.abs(remaining) < Number.EPSILON) break;
    const capacity = remaining > 0 ? maximums[index]! - next[index]! : next[index]! - minimums[index]!;
    const adjustment = Math.sign(remaining) * Math.min(Math.abs(remaining), capacity);
    next[index]! += adjustment;
    remaining -= adjustment;
  }

  return Math.abs(remaining) < 0.001 ? next : null;
}

function sanitizeStoredPanelState(serialized: string): string | null {
  try {
    const state = JSON.parse(serialized) as Record<string, { layout?: unknown }>;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;

    for (const value of Object.values(state)) {
      if (!value || typeof value !== 'object') continue;
      const layout = sanitizePersistedPanelLayout(value.layout);
      if (!layout) return null;
      value.layout = layout;
    }
    return JSON.stringify(state);
  } catch {
    return null;
  }
}

export const PANEL_STORAGE = Object.freeze({
  getItem(name: string): string | null {
    const stored = localStorage.getItem(name);
    return name === PANEL_STORAGE_KEY && stored ? sanitizeStoredPanelState(stored) : stored;
  },
  setItem(name: string, value: string): void {
    localStorage.setItem(name, value);
  },
});

export function resizePanelSizesByKeyboard(
  layout: readonly number[],
  handleIndex: number,
  key: string,
): number[] {
  if ((key !== 'ArrowLeft' && key !== 'ArrowRight') || handleIndex < 0 || handleIndex > 1) {
    return [...layout];
  }

  const next = [...layout];
  const left = layout[handleIndex];
  const right = layout[handleIndex + 1];
  const leftConstraints = PANEL_CONSTRAINTS[handleIndex];
  const rightConstraints = PANEL_CONSTRAINTS[handleIndex + 1];
  if (left == null || right == null || leftConstraints == null || rightConstraints == null) return next;

  const requestedDelta = key === 'ArrowRight' ? KEYBOARD_RESIZE_BY : -KEYBOARD_RESIZE_BY;
  const leftMin = leftConstraints.minSize;
  const leftMax = 'maxSize' in leftConstraints ? leftConstraints.maxSize : 100;
  const rightMin = rightConstraints.minSize;
  const rightMax = 'maxSize' in rightConstraints ? rightConstraints.maxSize : 100;
  const delta = Math.max(
    leftMin - left,
    right - rightMax,
    Math.min(requestedDelta, leftMax - left, right - rightMin),
  );

  next[handleIndex] = left + delta;
  next[handleIndex + 1] = right - delta;
  return next;
}

export function PanelLayout({ navigation, ai, children }: PanelLayoutProps) {
  const isNarrow = useNarrowLayout();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const desktopAiRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!isNarrow && isAiOpen) {
      setIsAiOpen(false);
      desktopAiRef.current?.focus();
    }
  }, [isAiOpen, isNarrow]);

  useEffect(() => {
    if (!isAiOpen) return;

    closeRef.current?.focus();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsAiOpen(false);
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      openerRef.current?.focus();
    };
  }, [isAiOpen]);

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (isNarrow) {
    return (
      <div className="shell shell--narrow">
        <nav className="shell__navigation shell__navigation--rail" aria-label="主导航">
          {navigation}
        </nav>
        <main className="shell__main shell__main--narrow" aria-label="工作区">
          <div className="shell__main-toolbar">
            <button
              ref={openerRef}
              className="shell__icon-button"
              type="button"
              aria-label="打开 AI 助手"
              title="打开 AI 助手"
              onClick={() => setIsAiOpen(true)}
            >
              <Bot aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="shell__main-content">{children}</div>
        </main>
        {isAiOpen ? (
          <>
            <div className="shell__scrim" aria-hidden="true" onClick={() => setIsAiOpen(false)} />
            <aside
              ref={dialogRef}
              className="shell__ai-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="AI 助手"
              tabIndex={-1}
              onKeyDown={trapFocus}
            >
              <div className="shell__ai-toolbar">
                <button
                  ref={closeRef}
                  className="shell__icon-button"
                  type="button"
                  aria-label="关闭 AI 助手"
                  title="关闭 AI 助手"
                  onClick={() => setIsAiOpen(false)}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <div className="shell__ai-content">{ai}</div>
            </aside>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <PanelGroup
      className="shell shell--desktop"
      direction="horizontal"
      autoSaveId={PANEL_AUTO_SAVE_ID}
      keyboardResizeBy={KEYBOARD_RESIZE_BY}
      storage={PANEL_STORAGE}
    >
      <Panel
        id="shell-navigation-panel"
        order={1}
        defaultSize={PANEL_SIZES.navigation.defaultSize}
        minSize={PANEL_SIZES.navigation.minSize}
        maxSize={PANEL_SIZES.navigation.maxSize}
        collapsible
        collapsedSize={PANEL_SIZES.navigation.collapsedSize}
      >
        <nav className="shell__navigation" aria-label="主导航">
          {navigation}
        </nav>
      </Panel>
      <PanelResizeHandle
        className="shell__resize-handle"
        aria-label="调整导航栏宽度"
      />
      <Panel
        id="shell-main-panel"
        order={2}
        defaultSize={PANEL_SIZES.main.defaultSize}
        minSize={PANEL_SIZES.main.minSize}
      >
        <main className="shell__main" aria-label="工作区">
          {children}
        </main>
      </Panel>
      <PanelResizeHandle
        className="shell__resize-handle"
        aria-label="调整 AI 助手宽度"
      />
      <Panel
        id="shell-ai-panel"
        order={3}
        defaultSize={PANEL_SIZES.ai.defaultSize}
        minSize={PANEL_SIZES.ai.minSize}
        maxSize={PANEL_SIZES.ai.maxSize}
        collapsible
        collapsedSize={PANEL_SIZES.ai.collapsedSize}
      >
        <aside ref={desktopAiRef} className="shell__ai" aria-label="AI 助手" tabIndex={-1}>
          {ai}
        </aside>
      </Panel>
    </PanelGroup>
  );
}
