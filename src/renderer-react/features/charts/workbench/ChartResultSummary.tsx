import { useI18n } from '../../../i18n/I18nProvider';
import type { NormalizedChartResult } from '../contracts';
import type { SubmittedChartSnapshot } from './chartDraft';

function safeJson(value: unknown): string {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function ChartResultSummary({
  result,
  submitted,
}: { result: NormalizedChartResult; submitted: SubmittedChartSnapshot }) {
  const { t } = useI18n();
  const knownMeta = new Set(['type', 'typeNameZh', 'title', 'subtitle', 'settings', 'generatedAt', 'instantUtc', 'firdaria', 'profection']);
  const remaining = Object.entries(result.meta).filter(([key]) => !knownMeta.has(key));
  const location = submitted.request.options.locationLabel;

  return <article className="chart-result-summary">
    <header><p>{result.meta.typeNameZh}</p><h2>{result.meta.title}</h2><p>{result.meta.subtitle}</p></header>
    <dl className="chart-result-summary__facts">
      <div><dt>{t('chart.workbench.subjects')}</dt><dd>{result.subjects.map((subject) => subject.nameZh || subject.nameEn).join(' / ')}</dd></div>
      <div><dt>{t('chart.workbench.settings')}</dt><dd>{result.meta.settings.houseSystem} · {result.meta.settings.zodiac}</dd></div>
      <div><dt>{t('chart.workbench.rings')}</dt><dd>{result.rings.map((ring) => ring.label).join(' / ')} ({result.rings.length})</dd></div>
      <div><dt>{t('chart.workbench.points')}</dt><dd>{result.rings.reduce((sum, ring) => sum + ring.points.length, 0)}</dd></div>
      <div><dt>{t('chart.workbench.aspects')}</dt><dd>{result.aspects.length}</dd></div>
      {submitted.request.options.targetDate && <div><dt>{t('chart.workbench.target')}</dt><dd>{submitted.request.options.targetDate}</dd></div>}
      {submitted.request.options.year !== undefined && <div><dt>{t('chart.workbench.year')}</dt><dd>{submitted.request.options.year}</dd></div>}
      {location && <div><dt>{t('chart.workbench.location')}</dt><dd>{location} ({submitted.request.options.latitude}, {submitted.request.options.longitude})</dd></div>}
      {result.meta.instantUtc && <div><dt>{t('chart.workbench.returnInstant')}</dt><dd>{result.meta.instantUtc}</dd></div>}
      {result.meta.firdaria !== undefined && <div className="chart-result-summary__headline"><dt>{t('chart.workbench.firdaria')}</dt><dd>{safeJson(result.meta.firdaria)}</dd></div>}
      {result.meta.profection !== undefined && <div className="chart-result-summary__headline"><dt>{t('chart.workbench.profection')}</dt><dd>{safeJson(result.meta.profection)}</dd></div>}
    </dl>
    {remaining.length > 0 && <section><h3>{t('chart.workbench.metadata')}</h3><dl className="chart-result-summary__metadata">
      {remaining.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{safeJson(value)}</dd></div>)}
    </dl></section>}
  </article>;
}
