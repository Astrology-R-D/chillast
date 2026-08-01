import { Bot, X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useNarrowLayout } from './useNarrowLayout';

export interface PanelLayoutProps {
  navigation: ReactNode;
  ai: ReactNode;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PanelLayout({ navigation, ai, children }: PanelLayoutProps) {
  const isNarrow = useNarrowLayout();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isNarrow) setIsAiOpen(false);
  }, [isNarrow]);

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
      autoSaveId="chillast.shell.desktop"
    >
      <Panel
        id="shell-navigation-panel"
        order={1}
        defaultSize={16}
        minSize={12}
        maxSize={22}
        collapsible
        collapsedSize={5}
      >
        <nav className="shell__navigation" aria-label="主导航">
          {navigation}
        </nav>
      </Panel>
      <PanelResizeHandle className="shell__resize-handle" aria-label="调整导航栏宽度" />
      <Panel id="shell-main-panel" order={2} defaultSize={57} minSize={42}>
        <main className="shell__main" aria-label="工作区">
          {children}
        </main>
      </Panel>
      <PanelResizeHandle className="shell__resize-handle" aria-label="调整 AI 助手宽度" />
      <Panel
        id="shell-ai-panel"
        order={3}
        defaultSize={27}
        minSize={22}
        maxSize={40}
        collapsible
        collapsedSize={0}
      >
        <aside className="shell__ai" aria-label="AI 助手">
          {ai}
        </aside>
      </Panel>
    </PanelGroup>
  );
}
