import { Download, Maximize, Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { ChartTransform } from '../../../stores/chartWorkspace';
import type { NormalizedChartResult } from '../contracts';
import { ChartLayerMenu } from './ChartLayerMenu';
import { fitBounds, RESET_TRANSFORM, visibleBounds, zoomAt } from './chartTransform';
import { downloadSvg } from './svgExport';
import { useI18n } from '../../../i18n/I18nProvider';

interface Props {
  result: NormalizedChartResult;
  svg: SVGSVGElement | null;
  transform: ChartTransform;
  onChange(transform: ChartTransform): void;
}

export function ChartToolbar({ result, svg, transform, onChange }: Props) {
  const { t } = useI18n();
  const center = { x: 370, y: 370 };
  const fit = () => {
    if (!svg) return;
    const values = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number) ?? [];
    onChange(fitBounds(visibleBounds(svg), { width: values[2] || 740, height: values[3] || 740 }));
  };
  return <div className="chart-toolbar" data-export-exclude="true">
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.zoomIn')} title={t('chart.svg.zoomIn')} onClick={() => onChange(zoomAt(transform, 1.25, center))}><ZoomIn size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.zoomOut')} title={t('chart.svg.zoomOut')} onClick={() => onChange(zoomAt(transform, 0.8, center))}><ZoomOut size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.pan')} title={t('chart.svg.panHint')} aria-pressed="true"><Move size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.fitVisible')} title={t('chart.svg.fitVisible')} onClick={fit}><Maximize size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.resetView')} title={t('chart.svg.resetView')} onClick={() => onChange({ ...RESET_TRANSFORM })}><RotateCcw size={17} /></button>
    <ChartLayerMenu result={result} />
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.exportSvg')} title={t('chart.svg.exportSvg')} disabled={!svg}
      onClick={() => svg && downloadSvg(svg, `${result.meta.type}-${result.meta.generatedAt.replace(/[:.]/g, '-')}.svg`, {
        title: result.meta.title, description: result.meta.subtitle,
      })}><Download size={17} /></button>
  </div>;
}
