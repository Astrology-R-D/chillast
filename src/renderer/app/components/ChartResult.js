// ChartResult.js — composes a computed chart into its full presentation: the
// SVG wheel, a legend, subject header and the data panels. Shared by both the
// personal and relationship views so the result layout stays consistent.

import { h, mount } from '../Dom.js';
import { ChartWheel } from './ChartWheel.js';
import { positionsPanel, aspectsPanel, distributionsPanel } from './ChartTables.js';
import { notify } from './Toast.js';

const RING_LEGEND = {
  primary: '本命 / 主体', secondary: '次体', transit: '行运',
  progressed: '推运', composite: '组合',
};

export function renderChartResult(container, chart, reference) {
  const wheel = new ChartWheel(reference);

  const canvasWrap = h('div', { class: 'chart-canvas-wrap' });
  wheel.render(canvasWrap, chart);

  const subjectsLine = (chart.subjects || []).map((s) => h('span', { class: 'chip' }, [
    h('span', { class: 'glyph' }, s.role === 'secondary' ? '☽' : '☉'),
    `${s.nameZh || s.nameEn || '—'} · ${s.birthLabel} · ${s.location.label || ''}`,
  ]));

  const settingChips = h('div', { class: 'row wrap', style: { gap: '8px' } }, [
    h('span', { class: 'chip' }, chart.meta.typeNameZh),
    h('span', { class: 'chip' }, `宫制 ${chart.meta.settings.houseSystem}`),
    h('span', { class: 'chip' }, `黄道 ${chart.meta.settings.zodiac}`),
  ]);

  const legend = h('div', { class: 'row wrap mt-2', style: { gap: '12px', fontSize: '12px', justifyContent: 'center' } }, [
    legendDot('#5bd6a0', '柔和相位'),
    legendDot('#e06a78', '紧张相位'),
    legendDot('#d9b25b', '合相 / 四轴'),
    legendDot('#8a82b0', '次要相位'),
    ...(chart.rings.length > 1 ? [legendDot('#f0cd7a', `外环 · ${RING_LEGEND[chart.rings[1].role] || chart.rings[1].label}`)] : []),
  ]);

  const exportBtn = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => exportSvg(canvasWrap, chart) }, '导出 SVG');

  const node = h('div', {}, [
    h('div', { class: 'chart-title-row' }, [
      h('div', {}, [
        h('h2', {}, chart.meta.title),
        h('div', { class: 'sub' }, chart.meta.subtitle),
      ]),
      h('div', { class: 'row', style: { gap: '8px' } }, [exportBtn]),
    ]),
    h('div', { class: 'row wrap mt-2', style: { gap: '8px' } }, subjectsLine),
    h('div', { class: 'mt-2' }, settingChips),
    h('div', { class: 'chart-layout mt-3' }, [
      h('div', {}, [canvasWrap, legend]),
      h('div', { class: 'panel-stack', style: { display: 'flex', flexDirection: 'column', gap: '18px' } }, [
        positionsPanel(chart, reference),
        distributionsPanel(chart, reference),
        aspectsPanel(chart, reference),
      ]),
    ]),
  ]);

  mount(container, node);
}

function legendDot(color, label) {
  return h('span', { class: 'row', style: { gap: '6px' } }, [
    h('span', { class: 'aspect-dot', style: { background: color } }), label,
  ]);
}

function exportSvg(canvasWrap, chart) {
  const svg = canvasWrap.querySelector('svg');
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(chart.meta.title || 'chart').replace(/[^\w一-龥-]+/g, '_')}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  notify.success('已导出 SVG');
}
