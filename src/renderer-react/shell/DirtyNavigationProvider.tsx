import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import './dirty-navigation.css';

export interface DraftRegistration {
  dirty: boolean;
  save(): Promise<boolean>;
  discard(): void;
}

type TransitionAction = () => void | Promise<void>;

interface DirtyNavigationApi {
  register(registration: DraftRegistration | null): void;
  requestTransition(action: TransitionAction): Promise<boolean>;
}

interface PendingRequest {
  action: TransitionAction | null;
  native: boolean;
  origin: HTMLElement | null;
  resolve(result: boolean): void;
}

const DirtyNavigationContext = createContext<DirtyNavigationApi | null>(null);

export function useDirtyNavigation(): DirtyNavigationApi {
  const value = useContext(DirtyNavigationContext);
  if (!value) throw new Error('useDirtyNavigation must be used inside DirtyNavigationProvider');
  return value;
}

export function useOptionalDirtyNavigation(): DirtyNavigationApi | null {
  return useContext(DirtyNavigationContext);
}

export function DirtyNavigationProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const registrationRef = useRef<DraftRegistration | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const restoreFocus = (origin: HTMLElement | null) => {
    requestAnimationFrame(() => { if (origin?.isConnected) origin.focus(); });
  };
  const finish = async (proceed: boolean, discard = false) => {
    const request = pendingRef.current;
    if (!request) return;
    pendingRef.current = null;
    setPending(null); setError('');
    if (discard) registrationRef.current?.discard();
    try {
      if (request.native) await apiClient.decideClose(proceed ? 'proceed' : 'cancel');
      else if (proceed && request.action) await request.action();
      request.resolve(proceed);
    } catch {
      request.resolve(false);
    } finally {
      restoreFocus(request.origin);
    }
  };
  const open = (action: TransitionAction | null, native: boolean): Promise<boolean> => {
    if (pendingRef.current) return Promise.resolve(false);
    const registration = registrationRef.current;
    if (!registration?.dirty) {
      if (native) return apiClient.decideClose('proceed');
      return Promise.resolve(action?.()).then(() => true);
    }
    return new Promise<boolean>((resolve) => {
      const request = { action, native, origin: document.activeElement instanceof HTMLElement ? document.activeElement : null, resolve };
      pendingRef.current = request;
      setError(''); setPending(request);
    });
  };
  const api = useMemo<DirtyNavigationApi>(() => ({
    register(registration) { registrationRef.current = registration; },
    requestTransition(action) { return open(action, false); },
  }), []);

  useLayoutEffect(() => {
    const cleanup = apiClient.onCloseRequested(() => { void open(null, true); });
    return () => {
      cleanup();
      if (pendingRef.current?.native) void apiClient.decideClose('cancel').catch(() => false);
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (!pending) return;
    (saving ? statusRef.current : cancelRef.current)?.focus();
  }, [pending, saving]);

  const save = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const saved = await registrationRef.current?.save();
      if (saved) await finish(true);
      else setError(t('dirty.saveFailed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !saving) { event.preventDefault(); void finish(false); return; }
    if (event.key !== 'Tab') return;
    if (saving) { event.preventDefault(); statusRef.current?.focus(); return; }
    const dialog = event.currentTarget;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return <DirtyNavigationContext.Provider value={api}>
    <div className="dirty-navigation__background" inert={Boolean(pending)}>{children}</div>
    {pending && <div className="dirty-navigation__backdrop"><div role="alertdialog" aria-modal="true" aria-labelledby="dirty-title" aria-describedby="dirty-description" className="dirty-navigation__dialog" onKeyDown={onKeyDown}>
      <h2 id="dirty-title">{t('dirty.title')}</h2>
      <p id="dirty-description">{t('dirty.description')}</p>
      {saving && <p ref={statusRef} role="status" tabIndex={-1} aria-busy="true">{t('dirty.saving')}</p>}
      {error && <p role="alert" className="dirty-navigation__error">{error}</p>}
      <div className="dirty-navigation__actions">
        <button ref={cancelRef} type="button" disabled={saving} onClick={() => void finish(false)}>{t('dirty.cancel')}</button>
        <button type="button" disabled={saving} onClick={() => void finish(true, true)}>{t('dirty.discard')}</button>
        <button type="button" disabled={saving} onClick={() => void save()}>{t('dirty.save')}</button>
      </div>
    </div></div>}
  </DirtyNavigationContext.Provider>;
}
