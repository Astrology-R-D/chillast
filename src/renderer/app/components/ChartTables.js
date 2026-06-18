// ChartTables.js — the textual companions to the wheel: planetary positions,
// the aspect grid and element/modality distributions. Each returns a self-
// contained panel node so views can compose them freely.

import { h } from '../Dom.js';
import { t } from '../I18n.js';
import { ASPECT_TYPE_COLOR } from './ChartWheel.js';

const ELEMENT_COLOR = { fire: '#ce9178', earth: '#6a9955', air: '#9cdcfe', water: '#4ec9b0' };
const minorColor = '#6e6e6e';

function pointGlyph(key, reference) {
  const meta = reference.points[key];
  return meta ? meta.glyph : '?';
}
function pointName(key, reference) {
  const meta = reference.points[key];
  return meta ? meta.nameZh : key;
}

/** Format a point's zodiac position like "♑ 24°50′ ℞". */
function formatPos(p) {
  const dms = p.dms;
  const retro = p.retrograde ? ' ℞' : '';
  return `${p.signGlyph} ${dms.degrees}°${String(dms.minutes).padStart(2, '0')}′${retro}`;
}

/** Positions table — one section per ring (handles bi-wheels). */
export function positionsPanel(chart, reference) {
  const sections = (chart.rings || []).map((ring) => {
    const rows = ring.points.map((p) => h('tr', {}, [
      h('td', { class: 'glyph svg-glyph', style: { color: p.retrograde ? '#e06a78' : '#ece9ff' } }, p.glyph),
      h('td', {}, p.nameZh),
      h('td', { class: 'svg-glyph' }, formatPos(p)),
      h('td', {}, p.signNameZh),
      h('td', {}, p.house ? t('tables.houseNum', { num: p.house }) : '—'),
    ]));
    return h('div', { class: 'mt-2' }, [
      (chart.rings.length > 1)
        ? h('div', { class: 'chip mt-2', style: { marginBottom: '8px' } }, ring.label)
        : null,
      h('table', { class: 'data-table' }, [
        h('thead', {}, h('tr', {}, [
          h('th', {}, t('tables.thStar')), h('th', {}, t('tables.thName')), h('th', {}, t('tables.thPos')),
          h('th', {}, t('tables.thSign')), h('th', {}, t('tables.thHouse')),
        ])),
        h('tbody', {}, rows),
      ]),
    ]);
  });

  // Chart angles as a compact extra section.
  const angles = chart.angles || {};
  const angleRows = ['ascendant', 'midheaven', 'descendant', 'imumcoeli']
    .filter((k) => angles[k])
    .map((k) => {
      const a = angles[k];
      return h('tr', {}, [
        h('td', { class: 'glyph' }, a.glyph),
        h('td', {}, a.nameZh),
        h('td', { class: 'svg-glyph' }, `${a.signGlyph} ${a.dms.degrees}°${String(a.dms.minutes).padStart(2, '0')}′`),
        h('td', { colspan: '2' }, ''),
      ]);
    });

  return panel(t('tables.positions'), [
    ...sections,
    angleRows.length ? h('div', { class: 'mt-3' }, [
      h('div', { class: 'chip', style: { marginBottom: '8px' } }, t('tables.angles')),
      h('table', { class: 'data-table' }, [h('tbody', {}, angleRows)]),
    ]) : null,
  ]);
}

/** Aspect list, sorted tightest first (already sorted by the engine). */
export function aspectsPanel(chart, reference) {
  const aspects = chart.aspects || [];
  if (!aspects.length) {
    return panel(t('tables.aspects'), [h('p', { class: 'text-muted' }, t('tables.noAspects'))]);
  }
  const rows = aspects.map((a) => {
    const color = ASPECT_TYPE_COLOR[a.aspectKey] || minorColor;
    return h('tr', {}, [
      h('td', { class: 'svg-glyph' }, `${pointGlyph(a.point1, reference)} ${pointGlyph(a.point2, reference)}`),
      h('td', {}, `${pointName(a.point1, reference)} – ${pointName(a.point2, reference)}`),
      h('td', {}, [h('span', { class: 'aspect-dot', style: { background: color } }), `${a.glyph} ${a.nameZh}`]),
      h('td', {}, `${a.orb.toFixed(2)}°`),
    ]);
  });
  return panel(t('tables.aspectsCount', { count: aspects.length }), [
    h('table', { class: 'data-table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, t('tables.thSymbol')), h('th', {}, t('tables.thCombo')), h('th', {}, t('tables.thAspect')), h('th', {}, t('tables.thOrb')),
      ])),
      h('tbody', {}, rows),
    ]),
  ]);
}

/** Element + modality distribution bars from the primary ring. */
export function distributionsPanel(chart, reference) {
  const dist = chart.distributions || { elements: {}, modalities: {} };
  const elementTotal = Object.values(dist.elements).reduce((a, b) => a + b, 0) || 1;
  const modalityTotal = Object.values(dist.modalities).reduce((a, b) => a + b, 0) || 1;

  const elementBars = Object.entries(dist.elements).map(([key, count]) => bar(
    reference.elements[key] ? reference.elements[key].nameZh : key,
    count, elementTotal, ELEMENT_COLOR[key],
  ));
  const modalityBars = Object.entries(dist.modalities).map(([key, count]) => bar(
    reference.modalities[key] ? reference.modalities[key].nameZh : key,
    count, modalityTotal, '#569cd6',
  ));

  return panel(t('tables.distribution'), [
    h('div', { class: 'text-muted', style: { fontSize: '12px', marginBottom: '8px' } }, t('tables.elements')),
    ...elementBars,
    h('div', { class: 'text-muted', style: { fontSize: '12px', margin: '14px 0 8px' } }, t('tables.modalities')),
    ...modalityBars,
  ]);
}

// —— helpers ——————————————————————————————————————————————————

function panel(title, body) {
  return h('div', { class: 'panel' }, [
    h('div', { class: 'panel-header' }, [h('h3', {}, title)]),
    h('div', { class: 'panel-body' }, body),
  ]);
}

function bar(label, count, total, color) {
  const pct = Math.round((count / total) * 100);
  return h('div', { class: 'dist-row' }, [
    h('span', { style: { fontSize: '13px' } }, label),
    h('div', { class: 'dist-bar' }, [h('span', { style: { width: `${pct}%`, background: color } })]),
    h('span', { class: 'text-muted', style: { fontSize: '12px', textAlign: 'right' } }, String(count)),
  ]);
}
