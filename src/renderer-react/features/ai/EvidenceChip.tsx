import { useState } from 'react';
import type { AnalysisReport } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import './evidence.css';

export function EvidenceChip({ id, report }: { id: string; report?: AnalysisReport | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const claim = report?.version === 1 ? report.claims.find((c) => c.id === id) : undefined;
  if (!claim) return <span className="evidence-chip--invalid" title={t('ai.evidenceUnavailable')}>{t('ai.evidenceUnavailable')}</span>;
  const sourceIds = new Set([...claim.sourceIds, ...(claim.checks || []).flatMap(check => check.sourceIds)]);
  const sources = report!.sources.filter((s) => sourceIds.has(s.id));
  const label = claim.kind === 'hypothesis' ? '解释假设' : ['reflection', 'suggestion'].includes(claim.kind || '') ? '回应依据' : t('ai.evidence');
  return <span className="evidence-chip">
    <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label} {id.slice(1)}</button>
    {open && <span className="evidence-card">
      {claim.kind === 'hypothesis' && <small className="evidence-card__kind">解释假设 · 尚待现实检验</small>}
      <strong>{claim.statement}</strong>
      {claim.kind === 'hypothesis' && ['symbolic', 'mixed'].includes(claim.basis || '') && <small>含占星或命理象征解释；不表示已确认当事人的真实想法。</small>}
      {report?.task && <small>{report.task.time.dates.length ? `${report.task.time.dates.join(' — ')} · ` : ''}{report.task.zone} · {report.task.time.basis}</small>}
      {claim.support && <span className="evidence-card__section"><strong>依据说明</strong>{claim.support}</span>}
      {!!claim.userRefs?.length && <span className="evidence-card__section"><strong>用户提供的描述</strong>{claim.userRefs.map((ref, index) => <span className="evidence-card__source" key={`${ref.id}/${index}`}><q>{ref.quote}</q></span>)}</span>}
      {claim.meaning && <span className="evidence-card__section"><strong>对当前问题的含义</strong>{claim.meaning}</span>}
      {!!claim.checks?.length && <span className="evidence-card__section"><strong>适用条件核对</strong>{claim.checks.map((check, index) => <span key={index}>{check.status === 'verified' ? '✓' : check.category === 'reality' ? '尚待现实检验' : '待核对'} {check.condition}</span>)}</span>}
      {!!claim.alternatives?.length && <span className="evidence-card__section"><strong>其他解释与区分线索</strong>{claim.alternatives.map((item, index) => <span key={index}>{item.explanation}<br />{item.distinction}</span>)}</span>}
      {!!claim.whatWouldChange?.length && <span className="evidence-card__section"><strong>何时调整判断</strong>{claim.whatWouldChange.map((item, index) => <span key={index}>{item}</span>)}</span>}
      {!!claim.responseOptions?.length && <span className="evidence-card__section"><strong>可选回应与取舍</strong>{claim.responseOptions.map((item, index) => <span key={index}>{item.action}<br />{item.when} {item.tradeoff}{item.wording && <><br />表达示例：{item.wording}</>}</span>)}</span>}
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
