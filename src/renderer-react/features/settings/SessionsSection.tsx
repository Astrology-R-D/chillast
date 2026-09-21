import { useState } from 'react';
import type { AiSessionSummary } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

interface SessionsSectionProps {
  sessions: AiSessionSummary[] | undefined;
  onChanged(): void;
}

/** 对话管理：重命名 / 重新生成标题 / 删除（prompt+confirm 对齐老层交互）。 */
export function SessionsSection({ sessions, onChanged }: SessionsSectionProps) {
  const { t } = useI18n();
  const [error, setError] = useState('');

  function sessionLabel(session: AiSessionSummary): string {
    if (session.title) return session.title;
    const firstUser = (session.messages || []).find((m) => m.role === 'user');
    return firstUser && firstUser.content ? firstUser.content.slice(0, 24) : t('settings.sessionUntitled');
  }

  async function onRename(session: AiSessionSummary) {
    const next = window.prompt(t('settings.sessionRenamePrompt'), session.title || sessionLabel(session));
    if (next == null) return;
    const title = next.trim();
    if (!title) return;
    try {
      await apiClient.renameAiSession(session.id, title);
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onRegenTitle(session: AiSessionSummary) {
    try {
      const { title } = await apiClient.regenerateAiSessionTitle(session.id);
      if (!title) setError(t('settings.sessionTitleFailed'));
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onDelete(session: AiSessionSummary) {
    if (!window.confirm(t('ai.deleteSessionConfirm'))) return;
    try {
      await apiClient.deleteAiSession(session.id);
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-sessions">
      <h2 id="settings-sessions">{t('settings.sessions')}</h2>
      <p className="settings-hint">{t('settings.sessionsHint', { count: (sessions ?? []).length })}</p>
      <div className="settings-list">
        {(sessions ?? []).length === 0
          ? <span className="settings-hint">{t('settings.sessionsEmpty')}</span>
          : (sessions ?? []).map((session) => (
            <div key={session.id} className="settings-list-item">
              <span><span className="settings-item-name">{sessionLabel(session)}</span>
                <span className="settings-item-meta">{t('settings.sessionMeta', {
                  count: (session.messages || []).length,
                  date: (session.updatedAt || session.createdAt || '').slice(0, 10),
                })}</span></span>
              <span className="settings-row">
                <button type="button" onClick={() => { void onRegenTitle(session); }}>{t('settings.sessionRegenTitle')}</button>
                <button type="button" onClick={() => { void onRename(session); }}>{t('settings.sessionRename')}</button>
                <button type="button" onClick={() => { void onDelete(session); }}>{t('settings.removeDoc')}</button>
              </span>
            </div>
          ))}
      </div>
      {error ? <span className="settings-feedback" data-kind="error">{error}</span> : null}
    </section>
  );
}
