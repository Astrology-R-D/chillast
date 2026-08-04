import { Maximize, Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { ChartTransform } from '../../../stores/chartWorkspace';
import type { NormalizedChartResult } from '../contracts';
import { ChartLayerMenu } from './ChartLayerMenu';
import { fitBounds, RESET_TRANSFORM, visibleBounds, zoomAt } from './chartTransform';

interface Props {
  result: NormalizedChartResult;
  svg: SVGSVGElement | null;
  transform: ChartTransform;
  onChange(transform: ChartTransform): void;
}

export function ChartToolbar({ result, svg, transform, onChange }: Props) {
  const center = { x: 370, y: 370 };
  const fit = () => {
    if (!svg) return;
    const values = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number) ?? [];
    onChange(fitBounds(visibleBounds(svg), { width: values[2] || 740, height: values[3] || 740 }));
  };
  return <div className="chart-toolbar" data-export-exclude="true">
    <button type="button" className="chart-toolbar__button" aria-label="放大" title="放大" onClick={() => onChange(zoomAt(transform, 1.25, center))}><ZoomIn size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label="缩小" title="缩小" onClick={() => onChange(zoomAt(transform, 0.8, center))}><ZoomOut size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label="平移" title="拖动或使用方向键平移" aria-pressed="true"><Move size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label="适合可见内容" title="适合可见内容" onClick={fit}><Maximize size={17} /></button>
    <button type="button" className="chart-toolbar__button" aria-label="重置视图" title="重置视图" onClick={() => onChange({ ...RESET_TRANSFORM })}><RotateCcw size={17} /></button>
    <ChartLayerMenu result={result} />
  </div>;
}
