import { h, mount, clear } from '../Dom.js';
import { ApiClient } from '../ApiClient.js';
import { renderBaZiChart } from '../components/BaZiChart.js';
import { fiveElementsPanel, dayMasterPanel, lunarInfoPanel, pillarDetailPanel } from '../components/BaZiTables.js';
import { notify } from '../components/Toast.js';
import { t } from '../I18n.js';

export class ChineseAstrologyView {
  constructor(context) {
    this.ctx = context;
  }

  get title() {
    return { h1: t('chinese.title'), sub: t('chinese.sub') };
  }

  render(container) {
    this.container = container;
    this._draw();
  }

  _draw() {
    const profiles = this.ctx.store.getState().profiles || [];

    if (!profiles.length) {
      mount(this.container, h('div', { class: 'empty-state' }, [
        h('div', { class: 'big' }, '☯'),
        h('p', {}, t('chinese.needProfile')),
      ]));
      return;
    }

    const defaultId = this.ctx.store.getState().selectedPrimaryId || profiles[0].id;
    this.profileSelect = profileSelect(profiles, defaultId);

    this.chartCol = h('div', { class: 'chart-col' }, [emptyResult()]);
    this.dataCol = h('div', { class: 'data-col' });

    const wrap = h('div', { class: 'workbench-wrap' }, [
      h('div', { class: 'workbench-bar' }, [
        labeled(t('chinese.labelProfile'), this.profileSelect),
        h('button', {
          class: 'btn btn-primary',
          onclick: () => this._compute(),
        }, t('chinese.generate')),
      ]),
      h('div', { class: 'workbench-main' }, [
        this.chartCol,
        this.dataCol,
      ]),
    ]);

    mount(this.container, wrap);
  }

  async _compute() {
    const profiles = this.ctx.store.getState().profiles || [];
    const profile = profiles.find((p) => p.id === this.profileSelect.value);
    if (!profile) return;

    mount(this.chartCol, loadingResult());
    clear(this.dataCol);

    try {
      const result = await ApiClient.chinese.computeBazi(profile);

      mount(this.chartCol, h('div', { style: { padding: 'var(--sp-4)' } }, [
        renderBaZiChart(result.bazi),
      ]));

      mount(this.dataCol, [
        dayMasterPanel(result.bazi),
        fiveElementsPanel(result.bazi),
        lunarInfoPanel(result.lunar),
        pillarDetailPanel(result.bazi),
      ]);

      notify.success(t('chinese.generated'));
    } catch (err) {
      mount(this.chartCol, h('div', { class: 'empty-state' }, [
        h('div', { class: 'big' }, '⚠'),
        h('p', {}, err.message),
      ]));
      notify.error(err.message);
    }
  }
}

function labeled(text, control) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, [
    h('span', { style: { fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.05em' } }, text),
    control,
  ]);
}

function profileSelect(profiles, selectedId) {
  return h('select', { class: 'select' },
    profiles.map((p) =>
      h('option', { value: p.id, selected: p.id === selectedId },
        `${p.nameZh || p.nameEn} · ${p.birthData.year}-${pad(p.birthData.month)}-${pad(p.birthData.day)}`)
    ));
}

function emptyResult() {
  return h('div', { class: 'empty-state' }, [
    h('div', { class: 'big' }, '☯'),
    h('p', {}, t('chinese.emptyResult')),
  ]);
}

function loadingResult() {
  return h('div', { class: 'empty-state' }, [
    h('div', { class: 'big boot-glyph' }, '☯'),
    h('p', {}, t('chinese.loading')),
  ]);
}

function pad(n) { return String(n).padStart(2, '0'); }
