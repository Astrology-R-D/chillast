import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { parseAiStatus, apiClient } from '../../api/client';
import type { AiStatus } from '../../api/contracts';
import type { RouteKey } from '../../shell/routes';
import { aiStreamStore, useAiStreamStore } from '../../stores/aiStreamStore';
import { useChartWorkspace } from '../../stores/chartWorkspace';
import { retryLatestChartAiContext } from '../charts/context/chartAiContextPublisher';
import { ChatMode } from './ChatMode';
import { ContextStrip } from './ContextStrip';
import { SessionRail } from './SessionRail';
import './ai-workspace.css';

export function AiWorkspace({ onNavigate }: { onNavigate?: (route: RouteKey) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mode = useAiStreamStore((state) => state.mode);
  const setMode = useAiStreamStore((state) => state.setMode);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const aiContextSyncStatus = useChartWorkspace((state) => state.aiContextSyncStatus);
  const aiContextSyncMessage = useChartWorkspace((state) => state.aiContextSyncMessage);
  const setAiContextSync = useChartWorkspace((state) => state.setAiContextSync);

  // 状态条（AiStatusPanel 职责迁移）：初始拉取 + 事件跟随。
  useEffect(() => {
    let active = true;
    const load = () => {
      void apiClient.getAiStatus().then(
        (next) => { if (active) { setStatus(next); setStatusError(''); } },
        (reason: unknown) => { if (active) { setStatusError(reason instanceof Error ? reason.message : String(reason)); } },
      );
    };
    load();
    const unsubscribe = window.mystApi.ai.onStatusChanged((payload) => {
      if (!active) return;
      try { setStatus(parseAiStatus(payload)); setStatusError(''); } catch (reason) {
        setStatusError(reason instanceof Error ? reason.message : String(reason));
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  // 会话基础设施（三模式共享）：初始化当前会话 + sessionsChanged → invalidate。
  useEffect(() => {
    let active = true;
    const bootstrap = () => {
      void apiClient.listAiSessions().then(
        (sessions) => {
          if (!active || aiStreamStore.getState().activeSessionId) return;
          if (sessions.length > 0) aiStreamStore.getState().setActiveSessionId(sessions[0].id);
          else void apiClient.createAiSession().then(
            (session) => { if (active) aiStreamStore.getState().setActiveSessionId(session.id); },
            () => { /* 会话不可用：ChatMode 显示空态，不阻塞工作台 */ },
          );
        },
        () => { /* 列表失败：SessionRail/ChatMode 显示各自错误态 */ },
      );
    };
    bootstrap();
    const unsubscribe = window.mystApi.ai.onSessionsChanged(() => { void queryClient.invalidateQueries({ queryKey: ['ai-sessions'] }); });
    return () => { active = false; unsubscribe(); };
  }, [queryClient]);

  const statusChip = status?.configured ? `${status.provider || '—'} · ${status.model || '—'}` : null;

  return (
    <section className="ai-workspace" aria-label={t('ai.title')}>
      <header className="ai-workspace__header">
        <div className="ai-workspace__modes" role="tablist" aria-label={t('ai.title')}>
          <button type="button" className="ai-workspace__mode-tab" role="tab" aria-pressed={mode === 'chat'} aria-selected={mode === 'chat'}
            onClick={() => setMode('chat')}><span aria-hidden="true">💬 </span>{t('ai.modeChat')}</button>
          <button type="button" className="ai-workspace__mode-tab" role="tab" aria-pressed={mode === 'report'} aria-selected={mode === 'report'}
            onClick={() => setMode('report')}><span aria-hidden="true">📄 </span>{t('ai.modeReport')}</button>
          <button type="button" className="ai-workspace__mode-tab" role="tab" aria-pressed={mode === 'research'} aria-selected={mode === 'research'}
            onClick={() => setMode('research')}><span aria-hidden="true">🔍 </span>{t('ai.modeResearch')}</button>
        </div>
        <div className="ai-workspace__status" data-configured={status?.configured ? 'true' : 'false'}>
          {statusChip ?? (statusError ? statusError : t('ai.llmDisconnected'))}
        </div>
      </header>
      {status && !status.configured && (
        <div className="ai-workspace__banner ai-workspace__banner--unconfigured" role="alert">
          <span>{t('ai.notConfigured')}</span>
          {onNavigate && <button type="button" onClick={() => onNavigate('settings')}>{t('ai.goToSettings')}</button>}
          <span>{t('ai.toConfigure')}</span>
        </div>
      )}
      {aiContextSyncStatus === 'error' && (
        <div className="ai-workspace__banner ai-workspace__banner--sync-error" role="alert">
          <p>{t('shell.aiContextSyncFailed', { message: aiContextSyncMessage ?? '' })}</p>
          {/* 守卫已把 aiContextSyncStatus 收窄为 'error'；as string 还原比较（运行时等价）。 */}
          <button type="button" disabled={(aiContextSyncStatus as string) === 'syncing'} onClick={() => {
            setAiContextSync('syncing');
            if (!retryLatestChartAiContext()) setAiContextSync('error', aiContextSyncMessage);
          }}>{t('shell.retryAiSync')}</button>
        </div>
      )}
      <ContextStrip />
      <div className="ai-workspace__body">
        <div className="ai-workspace__content">
          <SessionRail />
          {mode === 'chat' ? <ChatMode statusChip={statusChip} />
            : mode === 'report' ? <div className="ai-workspace__placeholder">{t('ai.reportPlaceholder')}</div>
            : <div className="ai-workspace__placeholder">{t('ai.researchPlaceholder')}</div>}
        </div>
      </div>
    </section>
  );
}
