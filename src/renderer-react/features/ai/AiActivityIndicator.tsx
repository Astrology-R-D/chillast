import { useEffect, useState } from 'react';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import { useI18n } from '../../i18n/I18nProvider';
import type { AiToolCall } from '../../api/contracts';

function toolTopic(call: AiToolCall): string {
  try {
    const args = JSON.parse(call.args || '{}');
    const topic = args.query || args.name || args.url || '';
    return typeof topic === 'string' ? topic.replace(/\s+/g, ' ').slice(0, 100) : '';
  } catch { return ''; }
}

/** Public task status comes from real pipeline phases and tool calls, never hidden reasoning. */
export function AiActivityIndicator() {
  const { t } = useI18n();
  const stage = useAiStreamStore((s) => s.stage);
  const activity = useAiStreamStore((s) => s.activity);
  const startedAt = useAiStreamStore((s) => s.startedAt);
  const segments = useAiStreamStore((s) => s.segments);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = startedAt || Date.now();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const calls = segments.flatMap((s) => s.kind === 'tool' ? [s.event] : []);
  const pending = calls.filter((c) => c.status === 'calling');
  const completed = calls.filter((c) => c.status === 'done').length;
  const current = pending.at(-1);
  const phase = activity?.phase || stage || 'preparing';
  const key = current ? `ai.toolNames.${current.tool}` : `ai.activity.${activity?.repair ? 'repair' : phase}`;
  const translated = t(key);
  const label = current ? t('ai.activity.tool', { name: translated === key ? current.tool : translated }) : translated;
  const topic = current ? toolTopic(current) : activity?.topic;
  return <div className="ai-activity" data-phase={current ? 'tool' : phase}>
    <span className="ai-activity__spinner" aria-hidden="true" />
    <div className="ai-activity__text" role="status" aria-live="polite">
      <strong>{label}</strong>
      {topic && <span className="ai-activity__topic">{topic}</span>}
      {calls.length > 0 && <small>{t('ai.activity.toolsCompleted', { done: completed, total: calls.length })}{pending.length > 1 && ` · ${t('ai.activity.parallel', { count: pending.length })}`}</small>}
    </div>
    <span className="ai-activity__elapsed" aria-hidden="true">{elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}</span>
  </div>;
}
