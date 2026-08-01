import { useEffect, useRef, useState } from 'react';
import type { AiStatus } from '../api/contracts';
import { apiClient } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';

export function AiStatusPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const statusEventVersion = useRef(0);

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
    const unsubscribe = window.mystApi.ai.onStatusChanged((nextStatus) => {
      if (!active) return;
      statusEventVersion.current += 1;
      setStatus(nextStatus);
      setError('');
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
          <dl>
            <div><dt>{t('settings.provider')}</dt><dd>{status.provider}</dd></div>
            <div><dt>{t('settings.model')}</dt><dd>{status.model}</dd></div>
          </dl>
          <p className="ai-status__knowledge">
            {t('shell.knowledgeCount', { count: status.knowledgeDocCount })}
          </p>
        </div>
      )}
    </section>
  );
}
