import { useState } from 'react';
import type { AiToolCall } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { ToolView } from './toolViews/ToolUserViewRegistry';
import './toolViews/registerToolViews';

function RawToolData({ call }: { call: AiToolCall }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <details className="tool-card__raw" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('ai.toolRawData')}</summary>
    {open && <><code>{call.artifact?.providerId ? `${call.artifact.providerId}/` : ''}{call.tool}</code><pre>{call.args}</pre><pre>{call.result}</pre>{call.artifact && <pre>{JSON.stringify(call.artifact, null, 2)}</pre>}</>}
  </details>;
}

function ToolCard({ call }: { call: AiToolCall }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(call.status === 'error');
  const labelKey = `ai.toolNames.${call.tool}`;
  const translated = t(labelKey);
  const name = translated === labelKey ? call.tool : translated;
  return <details className={`tool-card tool-card--${call.status}`} data-tool={call.tool} open={call.status === 'error' || open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span className="tool-card__name">{name}</span><span className="tool-card__status">{t(call.status === 'calling' ? 'ai.toolRunning' : call.status === 'error' ? 'ai.toolFailed' : 'ai.toolDone')}</span>{call.durationMs !== undefined && <span className="tool-card__duration">{(call.durationMs / 1000).toFixed(1)}s</span>}</summary>
    {(open || call.status === 'error') && <div className="tool-card__details">
      {(call.args || call.argsDigest) && <section><strong>{t('ai.toolArguments')}</strong><ToolView call={call} side="input" /></section>}
      {(call.result || call.resultExcerpt || call.artifact) && <section><strong>{t('ai.toolResult')}</strong><ToolView call={call} side="output" /></section>}
      <RawToolData call={call} />
    </div>}
  </details>;
}

export function ToolActivity({ calls }: { calls: AiToolCall[] }) {
  const { t } = useI18n();
  if (!calls.length) return null;
  return <details className="tool-activity" open={calls.some((call) => call.status === 'error')}>
    <summary>{t('ai.toolSummary', { count: calls.length })}</summary>
    {calls.map((call, index) => <ToolCard key={call.callId ?? `${call.tool}-${index}`} call={call} />)}
  </details>;
}
