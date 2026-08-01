import { Bot, X } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { useNarrowLayout } from './useNarrowLayout';

export interface PanelLayoutProps {
  navigation: ReactNode;
  ai: ReactNode;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]';

export const PANEL_AUTO_SAVE_ID = 'chillast.shell.desktop';

export const PANEL_SIZES = Object.freeze({
  navigation: Object.freeze({ defaultSize: 16, minSize: 12, maxSize: 22, collapsedSize: 5 }),
  main: Object.freeze({ defaultSize: 57, minSize: 42 }),
  ai: Object.freeze({ defaultSize: 27, minSize: 22, maxSize: 40, collapsedSize: 0 }),
});

const PANEL_CONSTRAINTS = [PANEL_SIZES.navigation, PANEL_SIZES.main, PANEL_SIZES.ai];
const KEYBOARD_RESIZE_BY = 6;
const PANEL_STORAGE_KEY = `react-resizable-panels:${PANEL_AUTO_SAVE_ID}`;
const PANEL_STORAGE_ENTRY_KEY = [
  'shell-navigation-panel',
  'shell-main-panel',
  'shell-ai-panel',
].sort().join(',');

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
    const state = JSON.parse(serialized) as Record<string, unknown>;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;

    const sanitized: Record<string, { layout: number[]; expandToSizes: Record<string, number> }> = {};
    for (const [panelKey, value] of Object.entries(state)) {
      if (!isSafeStorageKey(panelKey) || !value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const entry = value as { layout?: unknown; expandToSizes?: unknown };
      const layout = sanitizePersistedPanelLayout(entry.layout);
      const expandToSizes = entry.expandToSizes;
      if (!layout || !expandToSizes || typeof expandToSizes !== 'object' || Array.isArray(expandToSizes)) {
        continue;
      }
      const expandEntries = Object.entries(expandToSizes);
      if (
        expandEntries.some(
          ([key, size]) =>
            !isSafeStorageKey(key) ||
            typeof size !== 'number' ||
            !Number.isFinite(size) ||
            size < 0 ||
            size > 100,
        )
      ) {
        continue;
      }
      sanitized[panelKey] = { layout, expandToSizes: Object.fromEntries(expandEntries) };
    }
    return JSON.stringify(sanitized);
  } catch {
    return null;
  }
}

function isSafeStorageKey(key: string): boolean {
  return Boolean(key.trim()) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

export const PANEL_STORAGE = Object.freeze({
  getItem(name: string): string | null {
    try {
      const stored = localStorage.getItem(name);
      return name === PANEL_STORAGE_KEY && stored ? sanitizeStoredPanelState(stored) : stored;
    } catch {
      return null;
    }
  },
  setItem(name: string, value: string): void {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Persistence is optional; resizing must remain usable when storage is unavailable.
    }
  },
});

function readInitialDesktopAiCollapsed(): boolean {
  const serialized = PANEL_STORAGE.getItem(PANEL_STORAGE_KEY);
  if (!serialized) return false;
  try {
    const state = JSON.parse(serialized) as Record<string, { layout?: unknown }>;
    const layout = state[PANEL_STORAGE_ENTRY_KEY]?.layout;
    return Array.isArray(layout) && layout[2] === PANEL_SIZES.ai.collapsedSize;
  } catch {
    return false;
  }
}

function redistributeAcrossSide(
  layout: number[],
  indices: readonly number[],
  amount: number,
  capacityAt: (index: number) => number,
  direction: 1 | -1,
): void {
  let remaining = amount;
  for (const index of indices) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, capacityAt(index));
    layout[index] = Number((layout[index]! + direction * applied).toFixed(10));
    remaining = Number((remaining - applied).toFixed(10));
  }
}

// Contract oracle for browser-level react-resizable-panels behavior; not used by PanelLayout runtime.
export function resizePanelSizesByKeyboard(
  layout: readonly number[],
  handleIndex: number,
  key: string,
): number[] {
  const sanitized = sanitizePersistedPanelLayout(layout) ?? [
    PANEL_SIZES.navigation.defaultSize,
    PANEL_SIZES.main.defaultSize,
    PANEL_SIZES.ai.defaultSize,
  ];
  if ((key !== 'ArrowLeft' && key !== 'ArrowRight') || handleIndex < 0 || handleIndex > 1) {
    return sanitized;
  }

  const next = [...sanitized];
  const left = sanitized[handleIndex];
  const right = sanitized[handleIndex + 1];
  const leftConstraints = PANEL_CONSTRAINTS[handleIndex];
  const rightConstraints = PANEL_CONSTRAINTS[handleIndex + 1];
  if (left == null || right == null || leftConstraints == null || rightConstraints == null) return next;

  const direction = key === 'ArrowRight' ? 1 : -1;
  const shrinkingConstraints = direction < 0 ? leftConstraints : rightConstraints;
  const shrinkingSize = direction < 0 ? left : right;
  const collapsedSize =
    'collapsedSize' in shrinkingConstraints ? shrinkingConstraints.collapsedSize : undefined;
  if (collapsedSize != null && shrinkingSize === collapsedSize) return next;

  let requestedDelta = direction * KEYBOARD_RESIZE_BY;
  let shrinkingMinimum: number = shrinkingConstraints.minSize;
  if (collapsedSize != null && shrinkingSize === shrinkingConstraints.minSize) {
    shrinkingMinimum = collapsedSize;
    requestedDelta = direction * (shrinkingConstraints.minSize - collapsedSize);
  }

  const expandingConstraints = direction < 0 ? rightConstraints : leftConstraints;
  const expandingSize = direction < 0 ? right : left;
  const expandingCollapsedSize =
    'collapsedSize' in expandingConstraints ? expandingConstraints.collapsedSize : undefined;
  if (expandingCollapsedSize != null && expandingSize === expandingCollapsedSize) {
    requestedDelta = direction * (expandingConstraints.minSize - expandingCollapsedSize);
  }

  const expandingIndices =
    direction > 0
      ? Array.from({ length: handleIndex + 1 }, (_, offset) => handleIndex - offset)
      : Array.from(
          { length: PANEL_CONSTRAINTS.length - handleIndex - 1 },
          (_, offset) => handleIndex + 1 + offset,
        );
  const shrinkingIndices =
    direction > 0
      ? Array.from(
          { length: PANEL_CONSTRAINTS.length - handleIndex - 1 },
          (_, offset) => handleIndex + 1 + offset,
        )
      : Array.from({ length: handleIndex + 1 }, (_, offset) => handleIndex - offset);
  const shrinkingPivot = shrinkingIndices[0];
  const expansionCapacityAt = (index: number) => {
    const constraints = PANEL_CONSTRAINTS[index]!;
    const maximum = 'maxSize' in constraints ? constraints.maxSize : 100;
    return Math.max(0, maximum - next[index]!);
  };
  const shrinkCapacityAt = (index: number) => {
    const minimum = index === shrinkingPivot ? shrinkingMinimum : PANEL_CONSTRAINTS[index]!.minSize;
    return Math.max(0, next[index]! - minimum);
  };
  const expansionCapacity = expandingIndices.reduce(
    (total, index) => total + expansionCapacityAt(index),
    0,
  );
  const shrinkCapacity = shrinkingIndices.reduce(
    (total, index) => total + shrinkCapacityAt(index),
    0,
  );
  const amount = Math.min(Math.abs(requestedDelta), expansionCapacity, shrinkCapacity);

  redistributeAcrossSide(next, shrinkingIndices, amount, shrinkCapacityAt, -1);
  redistributeAcrossSide(next, expandingIndices, amount, expansionCapacityAt, 1);
  return next;
}

export function PanelLayout({ navigation, ai, children }: PanelLayoutProps) {
  const isNarrow = useNarrowLayout();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isDesktopAiCollapsed, setIsDesktopAiCollapsed] = useState(
    readInitialDesktopAiCollapsed,
  );
  const aiPanelRef = useRef<ImperativePanelHandle>(null);
  const mainRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const narrowToolbarRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreOpenerOnCloseRef = useRef(true);
  const previousIsNarrowRef = useRef(isNarrow);
  const activeBeforeLayoutRef = useRef<Element | null>(null);
  const acceptPanelCallbacksRef = useRef(false);
  const observedPanelCollapseRef = useRef(false);
  const focusAiAfterExpandRef = useRef(false);

  useLayoutEffect(() => {
    acceptPanelCallbacksRef.current = true;
  }, []);

  useLayoutEffect(() => {
    const wasNarrow = previousIsNarrowRef.current;
    const activeBeforeChange = activeBeforeLayoutRef.current ?? document.activeElement;

    if (wasNarrow !== isNarrow) {
      if (!wasNarrow && isNarrow && !isAiOpen && dialogRef.current?.contains(activeBeforeChange)) {
        openerRef.current?.focus();
      } else if (wasNarrow && !isNarrow) {
        if (isAiOpen) {
          restoreOpenerOnCloseRef.current = false;
          setIsAiOpen(false);
          if (isDesktopAiCollapsed) {
            focusAiAfterExpandRef.current = true;
            if (observedPanelCollapseRef.current) aiPanelRef.current?.expand();
            setIsDesktopAiCollapsed(false);
          } else {
            dialogRef.current?.focus();
          }
        } else if (narrowToolbarRef.current?.contains(activeBeforeChange)) {
          if (isDesktopAiCollapsed) mainRef.current?.focus();
          else dialogRef.current?.focus();
        }
      }
    }

    previousIsNarrowRef.current = isNarrow;
    activeBeforeLayoutRef.current = null;
    return () => {
      activeBeforeLayoutRef.current = document.activeElement;
    };
  }, [isAiOpen, isDesktopAiCollapsed, isNarrow]);

  useLayoutEffect(() => {
    if (focusAiAfterExpandRef.current && !isNarrow && !isDesktopAiCollapsed) {
      focusAiAfterExpandRef.current = false;
      dialogRef.current?.focus();
    }
  }, [isDesktopAiCollapsed, isNarrow]);

  useEffect(() => {
    if (!isAiOpen) return;

    closeRef.current?.focus();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setIsAiOpen(false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) {
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('focusin', handleFocusIn);
      if (restoreOpenerOnCloseRef.current) openerRef.current?.focus();
      restoreOpenerOnCloseRef.current = true;
    };
  }, [isAiOpen]);

  const isHiddenFromFocus = (element: HTMLElement) => {
    if (element.tabIndex < 0 || element.matches(':disabled, [aria-disabled="true"]')) return true;
    let current: HTMLElement | null = element;
    while (current && current !== dialogRef.current?.parentElement) {
      if (
        current.hidden ||
        current.hasAttribute('inert') ||
        current.getAttribute('aria-hidden') === 'true' ||
        current.matches('fieldset[disabled] *')
      ) {
        return true;
      }
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      current = current.parentElement;
    }
    return false;
  };

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !isHiddenFromFocus(element));
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
  const isAiHidden = isNarrow ? !isAiOpen : isDesktopAiCollapsed;

  return (
    <PanelGroup
      className={`shell ${isNarrow ? 'shell--narrow' : 'shell--desktop'}${isAiOpen ? ' shell--ai-open' : ''}`}
      direction="horizontal"
      autoSaveId={PANEL_AUTO_SAVE_ID}
      keyboardResizeBy={KEYBOARD_RESIZE_BY}
      storage={PANEL_STORAGE}
    >
      <Panel
        className="shell__panel shell__navigation-panel"
        id="shell-navigation-panel"
        order={1}
        defaultSize={PANEL_SIZES.navigation.defaultSize}
        minSize={PANEL_SIZES.navigation.minSize}
        maxSize={PANEL_SIZES.navigation.maxSize}
        collapsible
        collapsedSize={PANEL_SIZES.navigation.collapsedSize}
      >
        <nav
          className={`shell__navigation${isNarrow ? ' shell__navigation--rail' : ''}`}
          aria-label="主导航"
          aria-hidden={isNarrow && isAiOpen ? true : undefined}
          inert={isNarrow && isAiOpen}
        >
          {navigation}
        </nav>
      </Panel>
      <PanelResizeHandle
        className="shell__resize-handle"
        aria-label="调整导航栏宽度"
        disabled={isNarrow}
        hidden={isNarrow}
      />
      <Panel
        className="shell__panel shell__main-panel"
        id="shell-main-panel"
        order={2}
        defaultSize={PANEL_SIZES.main.defaultSize}
        minSize={PANEL_SIZES.main.minSize}
      >
        <main
          ref={mainRef}
          className={`shell__main${isNarrow ? ' shell__main--narrow' : ''}`}
          aria-label="工作区"
          aria-hidden={isNarrow && isAiOpen ? true : undefined}
          inert={isNarrow && isAiOpen}
          tabIndex={-1}
        >
          <div ref={narrowToolbarRef} className="shell__main-toolbar" hidden={!isNarrow}>
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
      </Panel>
      <PanelResizeHandle
        className="shell__resize-handle"
        aria-label="调整 AI 助手宽度"
        disabled={isNarrow}
        hidden={isNarrow}
      />
      <Panel
        ref={aiPanelRef}
        className="shell__panel shell__ai-panel"
        id="shell-ai-panel"
        order={3}
        defaultSize={PANEL_SIZES.ai.defaultSize}
        minSize={PANEL_SIZES.ai.minSize}
        maxSize={PANEL_SIZES.ai.maxSize}
        collapsible
        collapsedSize={PANEL_SIZES.ai.collapsedSize}
        onCollapse={() => {
          observedPanelCollapseRef.current = true;
          if (acceptPanelCallbacksRef.current) {
            if (!isNarrow && dialogRef.current?.contains(document.activeElement)) {
              mainRef.current?.focus();
            }
            setIsDesktopAiCollapsed(true);
          }
        }}
        onExpand={() => {
          observedPanelCollapseRef.current = false;
          if (acceptPanelCallbacksRef.current) setIsDesktopAiCollapsed(false);
        }}
      >
        <aside
          ref={dialogRef}
          className={`shell__ai${isNarrow ? ' shell__ai-overlay' : ''}`}
          role={isNarrow ? 'dialog' : undefined}
          aria-modal={isNarrow && isAiOpen ? true : undefined}
          aria-label="AI 助手"
          aria-hidden={isAiHidden ? true : undefined}
          inert={isAiHidden}
          hidden={isAiHidden}
          tabIndex={-1}
          onKeyDown={trapFocus}
        >
          <div className="shell__ai-toolbar" hidden={!isNarrow}>
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
      </Panel>
      <div
        className="shell__scrim"
        aria-hidden="true"
        hidden={!isNarrow || !isAiOpen}
        onClick={() => setIsAiOpen(false)}
      />
    </PanelGroup>
  );
}
