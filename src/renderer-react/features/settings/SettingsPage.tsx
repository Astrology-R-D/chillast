import { useQueryClient } from '@tanstack/react-query';
import type { RouteKey } from '../../shell/routes';
import { useI18n } from '../../i18n/I18nProvider';
import {
  aiQueryKeys,
  useAiCatalogProviders,
  useAiMcp,
  useAiSessions,
  useAiStatus,
  useAiToolProviders,
  useKnowledgeDocs,
} from './settingsQueries';
import { AiConfigSection } from './AiConfigSection';
import { ToolsAndMcpSection } from './ToolsAndMcpSection';
import { KnowledgeSection } from './KnowledgeSection';
import { SessionsSection } from './SessionsSection';
import './settings.css';

interface SettingsPageProps {
  onNavigate(route: RouteKey, beforeNavigate?: () => void): void;
}

/** 迁移 Phase 7：设置页实装（AI 配置 / 工具与 MCP / 知识库 / 对话管理）。 */
export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const status = useAiStatus();
  const providers = useAiCatalogProviders();
  const tools = useAiToolProviders();
  const mcp = useAiMcp();
  const knowledge = useKnowledgeDocs();
  const sessions = useAiSessions();

  const refresh = (keys: readonly (readonly unknown[])[]) => {
    void Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  };

  return (
    <div className="settings-page">
      <section className="settings-section" aria-labelledby="settings-status">
        <h2 id="settings-status">{t('settings.status')}</h2>
        <p className="settings-hint">
          {status.data
            ? (status.data.configured
              ? `${t('shell.aiConfigured')} · ${status.data.provider} · ${status.data.model}`
              : t('shell.aiNotConfigured'))
            : t('shell.loading')}
        </p>
        <p className="settings-hint">{t('shell.knowledgeCount', { count: status.data ? status.data.knowledgeDocCount : 0 })}</p>
      </section>
      <AiConfigSection
        status={status.data}
        providers={providers.data}
        onSaved={() => refresh([aiQueryKeys.status])}
      />
      <ToolsAndMcpSection
        tools={tools.data}
        mcp={mcp.data}
        onToolsChanged={() => refresh([aiQueryKeys.tools])}
        onMcpChanged={() => refresh([aiQueryKeys.mcp])}
      />
      <KnowledgeSection docs={knowledge.data} onChanged={() => refresh([aiQueryKeys.knowledge, aiQueryKeys.status])} />
      <SessionsSection sessions={sessions.data} onChanged={() => refresh([aiQueryKeys.sessions])} />
    </div>
  );
}
