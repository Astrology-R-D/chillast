import { h } from '../Dom.js';
import { t } from '../I18n.js';

const ELEMENT_COLOR = {
  wood: 'var(--c-wood)', fire: 'var(--c-fire)', earth: 'var(--c-earth)',
  metal: 'var(--c-metal)', water: 'var(--c-water)',
};

export function hourPillarsPanel(baziData) {
  const hours = baziData.allHourPillars || [];
  if (!hours.length) return null;

  const rows = hours.map((hp) => {
    const stemColor = ELEMENT_COLOR[hp.stem.element] || '';
    const branchColor = ELEMENT_COLOR[hp.branch.element] || '';
    return h('tr', { class: hp.isCurrent ? 'is-current-hour' : '' }, [
      h('td', { class: 'fw-medium' }, `${hp.shichen}时`),
      h('td', { class: 'text-muted' }, hp.hours),
      h('td', { style: { color: stemColor, fontSize: 'var(--fs-lg)' } }, hp.stem.char),
      h('td', { style: { color: branchColor, fontSize: 'var(--fs-lg)' } }, hp.branch.char),
      h('td', {}, hp.full),
    ]);
  });

  return h('div', { class: 'panel' }, [
    h('div', { class: 'panel-header' }, [h('h3', {}, t('chinese.allShichen'))]),
    h('div', { class: 'panel-body' }, [
      h('table', { class: 'data-table' }, [
        h('thead', {}, h('tr', {}, [
          h('th', {}, '时辰'), h('th', {}, '时段'),
          h('th', {}, t('chinese.heavenlyStem')), h('th', {}, t('chinese.earthlyBranch')),
          h('th', {}, '干支'),
        ])),
        h('tbody', {}, rows),
      ]),
    ]),
  ]);
}
