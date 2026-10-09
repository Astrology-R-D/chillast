import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import type { WorkspaceAiContext } from '../../api/contracts';
import {
  invalidateLatestChartAiContext, latestChartAiContext, subscribeChartAiContext,
} from '../charts/context/chartAiContextPublisher';

/** 当前 AI 上下文摘要条：档案 / 盘型 / 时间 / 焦点 / 已选；× 清除 = setContext(null)（spec §4）。 */
export function ContextStrip() {
  const { t } = useI18n();
  const [context, setContext] = useState<WorkspaceAiContext | null>(() => latestChartAiContext());

  useEffect(() => subscribeChartAiContext(() => setContext(latestChartAiContext())), []);

  if (!context) return null;
  const chips = context.kind === 'chinese-chart' ? [context.activeProfile.displayName, t('chinese.title'), context.lastBaziData ? t('chinese.generated') : ''] : [
    context.activeProfile?.displayName,
    context.successfulFilters?.type,
    context.draftSummary && typeof context.draftSummary === 'object' && 'targetLocal' in context.draftSummary
      ? String((context.draftSummary as { targetLocal?: string }).targetLocal ?? '')
      : '',
    typeof context.focusedIdentity === 'string' && context.focusedIdentity ? context.focusedIdentity : '',
    context.selectedRows && context.selectedRows.length > 0
      ? `已选 ${context.selectedRows.length}` : '',
  ].filter(Boolean);

  const clear = () => {
    invalidateLatestChartAiContext();
    setContext(null);
    void apiClient.setAiChartContext(null);
  };

  return (
    <div className="context-strip" data-testid="ai-context-strip">
      <span className="context-strip__label">{t('ai.contextStrip')}</span>
      {chips.map((chip) => <span key={chip} className="context-strip__chip">{chip}</span>)}
      <button type="button" className="context-strip__clear" aria-label={t('ai.removeContext')}
        onClick={clear}>×</button>
    </div>
  );
}
