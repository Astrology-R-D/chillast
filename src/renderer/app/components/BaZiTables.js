import { h } from '../Dom.js';
import { t } from '../I18n.js';

const ELEMENT_COLOR = {
  wood: 'var(--c-wood)', fire: 'var(--c-fire)', earth: 'var(--c-earth)',
  metal: 'var(--c-metal)', water: 'var(--c-water)',
};

const ELEMENT_KEY_TO_ZH = {
  wood: 'chinese.elementWood', fire: 'chinese.elementFire', earth: 'chinese.elementEarth',
  metal: 'chinese.elementMetal', water: 'chinese.elementWater',
};

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

export function fiveElementsPanel(baziData) {
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = baziData.pillars[key];
    if (counts[p.stem.element] != null) counts[p.stem.element]++;
    if (counts[p.branch.element] != null) counts[p.branch.element]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const bars = Object.entries(counts).map(([key, count]) =>
    bar(t(ELEMENT_KEY_TO_ZH[key]), count, total, ELEMENT_COLOR[key]));

  return panel(t('chinese.fiveElementsDist'), bars);
}

export function dayMasterPanel(baziData) {
  const dm = baziData.dayMaster;
  const color = ELEMENT_COLOR[dm.element] || 'var(--text-primary)';
  const elementZh = t(ELEMENT_KEY_TO_ZH[dm.element]);

  return panel(t('chinese.dayMasterAnalysis'), [
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } }, [
      h('div', {
        style: {
          fontSize: '36px', fontWeight: '700', color,
          width: '64px', height: '64px', display: 'grid', placeItems: 'center',
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
          border: '2px solid ' + color,
        },
      }, dm.char),
      h('div', {}, [
        h('div', { style: { fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' } },
          t('chinese.dayMasterIs', { element: elementZh })),
        h('div', { class: 'text-muted', style: { marginTop: '4px' } },
          `${t('chinese.dayMaster')}: ${dm.char} (${elementZh})`),
      ]),
    ]),
  ]);
}

export function lunarInfoPanel(lunarData) {
  const rows = [
    [t('chinese.lunarBirthday'), `${lunarData.lunarYear}年 ${lunarData.lunarMonth}月 ${lunarData.lunarDay}`],
    [t('chinese.zodiacAnimal'), lunarData.zodiacAnimal],
    [t('chinese.huangdiYear'), String(lunarData.huangdiYear)],
  ];
  if (lunarData.solarTerm) {
    rows.push([t('chinese.solarTerm'), lunarData.solarTerm]);
  }

  const tableRows = rows.map(([label, value]) =>
    h('tr', {}, [
      h('td', { style: { color: 'var(--text-muted)', width: '100px' } }, label),
      h('td', {}, value),
    ]));

  return panel(t('chinese.lunarTitle'), [
    h('table', { class: 'data-table' }, [h('tbody', {}, tableRows)]),
  ]);
}

export function pillarDetailPanel(baziData) {
  const pillarKeys = ['year', 'month', 'day', 'hour'];
  const labelKeys = ['chinese.pillarYear', 'chinese.pillarMonth', 'chinese.pillarDay', 'chinese.pillarHour'];

  const rows = pillarKeys.map((key, i) => {
    const p = baziData.pillars[key];
    const stemColor = ELEMENT_COLOR[p.stem.element] || '';
    const branchColor = ELEMENT_COLOR[p.branch.element] || '';
    return h('tr', {}, [
      h('td', { style: { fontWeight: 'var(--fw-semibold)' } }, t(labelKeys[i])),
      h('td', { style: { color: stemColor, fontSize: 'var(--fs-lg)' } }, p.stem.char),
      h('td', { style: { color: branchColor, fontSize: 'var(--fs-lg)' } }, p.branch.char),
      h('td', {}, p.full),
      h('td', {}, `${t(ELEMENT_KEY_TO_ZH[p.stem.element])}/${t(ELEMENT_KEY_TO_ZH[p.branch.element])}`),
    ]);
  });

  return panel(t('chinese.pillarDetail'), [
    h('table', { class: 'data-table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, ''),
        h('th', {}, t('chinese.heavenlyStem')),
        h('th', {}, t('chinese.earthlyBranch')),
        h('th', {}, '干支'),
        h('th', {}, t('chinese.fiveElements')),
      ])),
      h('tbody', {}, rows),
    ]),
  ]);
}
