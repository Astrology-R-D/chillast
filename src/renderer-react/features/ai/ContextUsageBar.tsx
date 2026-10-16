import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ContextUsage } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import { useChartWorkspace } from '../../stores/chartWorkspace';
import { useI18n } from '../../i18n/I18nProvider';

export function ContextUsageBar({ draft, onBusyChange }: { draft: string; onBusyChange?(busy: boolean): void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const sessionId = useAiStreamStore((s) => s.activeSessionId);
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const active = useAiStreamStore((s) => s.active);
  const finish = useAiStreamStore((s) => s.streamFinishSignal);
  const sync = useChartWorkspace((s) => s.aiContextSyncStatus);
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setUsage(null); setNotice(''); setBusy(false); }, [sessionId]);
  useEffect(() => { if (active) setNotice(''); }, [active]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    let current = true;
    if (!sessionId || active || !window.mystApi?.ai?.contextUsage) return;
    const timer = setTimeout(() => {
      void apiClient.getAiContextUsage(sessionId, draft).then((value) => { if (current) setUsage(value); }, () => { if (current) setUsage(null); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [sessionId, draft, active, finish, sync, revision]);
  useEffect(() => {
    const unsubscribe = window.mystApi?.ai?.onContextChanged?.((event) => {
      if (event.sessionId !== sessionId) return;
      if (event.usage) setUsage(event.usage);
      if (event.message) setNotice(event.message);
      if (event.compression) setBusy(event.compression === 'running');
    });
    const status = window.mystApi?.ai?.onStatusChanged?.(() => setRevision((v) => v + 1));
    return () => { unsubscribe?.(); status?.(); };
  }, [sessionId]);
  const compress = async () => {
    if (!sessionId || active || busy) return;
    setBusy(true); setNotice(t('ai.contextCompressing'));
    try {
      const result = await apiClient.compressAiContext(sessionId);
      if (currentSession.current === sessionId) {
        setUsage(result.usage); setNotice(result.message);
        setRevision((v) => v + 1);
      }
      await queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
    } catch (error) { if (currentSession.current === sessionId) setNotice(error instanceof Error ? error.message : String(error)); }
    finally { if (currentSession.current === sessionId) setBusy(false); }
  };
  return <div className="context-usage">
    <div className="context-usage__row" title={usage ? `${t('ai.contextEstimated')} · ${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens · ${t('ai.contextReserve')}: ${usage.reserve.toLocaleString()}` : t('ai.contextUnknown')}>
      <span>{t('ai.contextUsage')}</span>
      <meter aria-label={t('ai.contextUsage')} min={0} max={100} low={70} high={90} optimum={30} value={Math.min(100, usage?.percent || 0)} />
      <span>{usage?.percent === null || !usage ? t('ai.contextUnknownShort') : `≈ ${usage.percent}%`}</span>
      {usage && usage.percent !== null && usage.percent > 70 && <button type="button" disabled={active || busy} onClick={() => { void compress(); }}>{t(busy ? 'ai.contextCompressing' : 'ai.contextCompress')}</button>}
      {busy && !active && sessionId && <button type="button" onClick={() => { void window.mystApi.ai.stop(sessionId); }}>{t('ai.stop')}</button>}
    </div>
    {notice && <div className="context-usage__notice" role="status"><span>{notice}</span>{!busy && <button type="button" aria-label={t('ai.dismissNotice')} onClick={() => setNotice('')}>×</button>}</div>}
    {Boolean(usage?.compressedMessages) && <small>{t('ai.contextCompressedCount', { count: usage!.compressedMessages! })}</small>}
  </div>;
}
