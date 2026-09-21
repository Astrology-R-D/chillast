import { useEffect, useRef, useState } from 'react';
import type { AiStatus } from '../api/contracts';
import { apiClient, parseAiStatus } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { useChartWorkspace } from '../stores/chartWorkspace';
import { retryLatestChartAiContext } from '../features/charts/context/chartAiContextPublisher';
import type { RouteKey } from './routes';

export function AiStatusPanel({ onNavigate }: { onNavigate?: (route: RouteKey) => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const statusEventVersion = useRef(0);
  const aiContextSyncStatus = useChartWorkspace((state) => state.aiContextSyncStatus);
  const aiContextSyncMessage = useChartWorkspace((state) => state.aiContextSyncMessage);
  const setAiContextSync = useChartWorkspace((state) => state.setAiContextSync);

  useEffect(() => {
    let active = true;
    const eventVersionAtRequest = statusEventVersion.current;
    setLoading(true);
    setError('');
    void apiClient.getAiStatus().then(
      (nextStatus) => {
        if (!active || statusEventVersion.current !== eventVersionAtRequest) return;
        setStatus(nextStatus);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!active || statusEventVersion.current !== eventVersionAtRequest) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [requestVersion]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.mystApi.ai.onStatusChanged((payload) => {
      if (!active) return;
      statusEventVersion.current += 1;
      try {
        setStatus(parseAiStatus(payload));
        setError('');
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <section className="ai-status" aria-live="polite">
      <h2 className="ai-status__title">{t('ai.title')}</h2>
      {aiContextSyncMessage && aiContextSyncStatus !== 'synced' && <div role="alert" className="ai-status__context-error">
        <p>{t('shell.aiContextSyncFailed', { message: aiContextSyncMessage })}</p>
        <button type="button" disabled={aiContextSyncStatus === 'syncing'} onClick={() => {
          setAiContextSync('syncing');
          if (!retryLatestChartAiContext()) setAiContextSync('error', aiContextSyncMessage);
        }}>{t('shell.retryAiSync')}</button>
      </div>}
      {loading && <p className="ai-status__message">{t('shell.loading')}</p>}
      {!loading && error && (
        <div className="ai-status__error">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => setRequestVersion((version) => version + 1)}>
            {t('shell.retry')}
          </button>
        </div>
      )}
      {!loading && !error && status && (
        <div className="ai-status__details">
          <p className="ai-status__state" data-configured={status.configured}>
            {status.configured ? t('shell.aiConfigured') : t('shell.aiNotConfigured')}
          </p>
          {!status.configured && onNavigate ? (
            <p className="ai-status__configure">
              <button type="button" onClick={() => onNavigate('settings')}>
                {t('ai.notConfigured')}「{t('ai.goToSettings')}」{t('ai.toConfigure')}
              </button>
            </p>
          ) : null}
          <dl>
            <div><dt>{t('settings.provider')}</dt><dd>{status.provider?.trim() || '—'}</dd></div>
            <div><dt>{t('settings.model')}</dt><dd>{status.model?.trim() || '—'}</dd></div>
          </dl>
          <p className="ai-status__knowledge">
            {t('shell.knowledgeCount', { count: status.knowledgeDocCount })}
          </p>
        </div>
      )}
    </section>
  );
}
