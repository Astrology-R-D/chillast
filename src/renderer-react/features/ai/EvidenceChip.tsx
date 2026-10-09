import { useState } from 'react';
import type { AnalysisReport } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import './evidence.css';

export function EvidenceChip({ id, report }: { id: string; report?: AnalysisReport | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const claim = report?.version === 1 ? report.claims.find((c) => c.id === id) : undefined;
  if (!claim) return <span className="evidence-chip--invalid" title={t('ai.evidenceUnavailable')}>{t('ai.evidenceUnavailable')}</span>;
  const sources = report!.sources.filter((s) => claim.sourceIds.includes(s.id));
  return <span className="evidence-chip">
    <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('ai.evidence')} {id.slice(1)}</button>
    {open && <span className="evidence-card">
      <strong>{claim.statement}</strong>
      {claim.facts.length > 0 && <span className="evidence-card__section"><strong>{t('ai.evidenceFacts')}</strong>{claim.facts.map((fact) => <span key={`${fact.callId}/${fact.key}`}>{fact.text}</span>)}</span>}
      {sources.length > 0 && <span className="evidence-card__section"><strong>{t('ai.evidenceSources')}</strong>{sources.map((s) => <span className="evidence-card__source" key={s.id}>
        <strong>{s.title}{s.location?.lines && ` · ${s.pack ? '整理文本' : ''}第 ${s.location.lines.from}–${s.location.lines.to} 行`}</strong>
        {s.pack && <small>{s.pack.name} · v{s.pack.version} · {s.corpus}</small>}
        <q>{s.content}</q><small>{s.id} · 版本 {s.version.slice(0, 10)}</small>
        {s.provenance?.sourceName && <small>原始文件：{s.provenance.sourceName} · 原 PDF 页码映射未经核对</small>}
        {s.url && /^https?:\/\//i.test(s.url) && <a href={s.url} target="_blank" rel="noopener noreferrer">{t('ai.openSource')}</a>}
      </span>)}</span>}
      {claim.limitations && <span className="evidence-card__section"><strong>{t('ai.evidenceLimits')}</strong>{claim.limitations}</span>}
      {claim.question && <span className="evidence-card__section"><strong>{t('ai.evidenceQuestion')}</strong>{claim.question}</span>}
    </span>}
  </span>;
}
