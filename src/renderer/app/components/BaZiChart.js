import { h } from '../Dom.js';
import { t } from '../I18n.js';

const ELEMENT_CSS_VAR = {
  wood: 'var(--c-wood)', fire: 'var(--c-fire)', earth: 'var(--c-earth)',
  metal: 'var(--c-metal)', water: 'var(--c-water)',
};

const ELEMENT_KEY_TO_LOCALE = {
  wood: 'chinese.elementWood', fire: 'chinese.elementFire', earth: 'chinese.elementEarth',
  metal: 'chinese.elementMetal', water: 'chinese.elementWater',
};

const YINYANG_LOCALE = { yang: 'chinese.yang', yin: 'chinese.yin' };

const PILLAR_LABELS = ['chinese.pillarHour', 'chinese.pillarDay', 'chinese.pillarMonth', 'chinese.pillarYear'];
const PILLAR_ORDER = ['hour', 'day', 'month', 'year'];

export function renderBaZiChart(baziData) {
  const pillars = PILLAR_ORDER.map((key, i) => {
    const p = baziData.pillars[key];
    const isDayMaster = key === 'day';
    const stemColor = ELEMENT_CSS_VAR[p.stem.element] || 'var(--text-primary)';
    const branchColor = ELEMENT_CSS_VAR[p.branch.element] || 'var(--text-primary)';

    return h('div', { class: `bazi-pillar${isDayMaster ? ' is-day-master' : ''}` }, [
      h('div', { class: 'bazi-pillar-label' }, t(PILLAR_LABELS[i])),
      h('div', { class: 'bazi-stem', style: { color: stemColor } }, p.stem.char),
      h('div', { class: 'bazi-yinyang' }, `${t(ELEMENT_KEY_TO_LOCALE[p.stem.element])} ${t(YINYANG_LOCALE[p.stem.yinYang])}`),
      h('div', { class: 'bazi-branch', style: { color: branchColor } }, p.branch.char),
      h('div', { class: 'bazi-yinyang' }, `${t(ELEMENT_KEY_TO_LOCALE[p.branch.element])} ${t(YINYANG_LOCALE[p.branch.yinYang])}`),
      p.branch.animal
        ? h('div', { class: 'bazi-element-tag' }, p.branch.animal)
        : null,
    ]);
  });

  return h('div', { class: 'bazi-chart' }, pillars);
}
