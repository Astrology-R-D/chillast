import { AlertTriangle, Ban, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useI18n } from '../../../i18n/I18nProvider';
import { useChartWorkspace, type ChartRouteState } from '../../../stores/chartWorkspace';
import type { ChartRoute } from '../contracts';
import { ChartResultSummary } from './ChartResultSummary';

export function useResultOrientation(ref: RefObject<HTMLElement | null>): 'horizontal' | 'vertical' {
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('vertical');
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setOrientation(entry.contentRect.width >= 760 ? 'horizontal' : 'vertical'));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return orientation;
}

export interface ChartResultShellProps {
  route: ChartRoute;
  state: ChartRouteState;
  profilesAvailable: boolean;
  validDraft: boolean;
  startupError?: string | null;
  onRetry(): void;
  onCancel(): void;
}

function clampRatio(value: [number, number], minimum: number): [number, number] {
  const min = Math.min(50, Math.max(0, minimum));
  const first = Math.min(100 - min, Math.max(min, value[0]));
  return [first, 100 - first];
}

export function ChartResultShell({ route, state, profilesAvailable, validDraft, startupError, onRetry, onCancel }: ChartResultShellProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const orientation = useResultOrientation(ref);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const stored = useChartWorkspace((workspace) => workspace.workspace.split[route]);
  const setSplit = useChartWorkspace((workspace) => workspace.setSplit);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const extent = orientation === 'horizontal' ? size.width : size.height;
  const minimum = extent > 0 ? (360 / extent) * 100 : 0;
  const ratio = clampRatio(stored[orientation], minimum);
  const result = state.lastSuccessfulResult;
  const accepted = state.accepted;

  let status: string | null = null;
  let icon = null;
  if (!profilesAvailable) status = t('chart.workbench.profileRequired');
  else if (startupError) status = startupError;
  else if (state.requestStatus === 'loading') { status = t('chart.workbench.loading'); icon = <LoaderCircle size={16} />; }
  else if (state.requestStatus === 'error') {
    status = t(`chart.workbench.${state.requestFailureKind ?? 'error'}Error`);
    icon = <AlertTriangle size={16} />;
  } else if (state.requestStatus === 'cancelled') { status = t('chart.workbench.cancelled'); icon = <Ban size={16} />; }
  else if (!result) status = t('chart.workbench.empty');

  return <section ref={ref} className={`chart-result chart-result--${orientation}`} data-orientation={orientation}>
    <header className="chart-result__header">
      <div aria-live="polite" role="status">{icon}{status}{state.isStale && <span className="chart-result__stale">{t('chart.workbench.stale')}</span>}</div>
      <div className="chart-result__actions">{state.requestStatus === 'loading' && <button type="button" onClick={onCancel}><X size={15} />{t('chart.workbench.cancel')}</button>}
        {state.requestStatus === 'error' && validDraft && <button type="button" onClick={onRetry}><RefreshCw size={15} />{t('chart.workbench.retry')}</button>}</div>
    </header>
    {result && accepted && <PanelGroup key={orientation} direction={orientation} className="chart-result__split"
      onLayout={(layout) => { if (layout.length === 2) setSplit(route, orientation, [layout[0], layout[1]]); }}>
      <Panel id={`${route}-${orientation}-chart`} order={1} defaultSize={ratio[0]} minSize={Math.min(50, minimum)}
        className="chart-result__chart-pane" data-min-percent={minimum.toFixed(3)}>
        <div className="chart-result__pane-heading"><span>{result.meta.typeNameZh}</span><strong>{result.rings.length} {t('chart.workbench.rings')} · {result.aspects.length} {t('chart.workbench.aspects')}</strong></div>
        <p>{t('chart.workbench.chartPending')}</p>
      </Panel>
      <PanelResizeHandle className="chart-result__resize" aria-label={t('chart.workbench.resizeSplit')} />
      <Panel id={`${route}-${orientation}-data`} order={2} defaultSize={ratio[1]} minSize={Math.min(50, minimum)} className="chart-result__data-pane">
        <p className="chart-result__pending">{t('chart.workbench.dataPending')}</p>
        <ChartResultSummary result={result} submitted={accepted} />
      </Panel>
    </PanelGroup>}
  </section>;
}
