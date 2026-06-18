// ChartWorkbenchView.js — the shared workbench that drives chart generation.
// Configured by `category` ('personal' or 'relationship'), it renders the right
// profile pickers, chart-type list, type-specific options and settings, then
// computes and displays the result. Both the personal and relationship views are
// thin specialisations of this class, keeping the control logic in one place.

import { h, mount } from '../Dom.js';
import { ApiClient } from '../ApiClient.js';
import { renderChartResult } from '../components/ChartResult.js';
import { notify } from '../components/Toast.js';

const ZODIACS = [
  { value: 'tropical', label: '回归黄道 Tropical' },
  { value: 'sidereal', label: '恒星黄道 Sidereal' },
];

export class ChartWorkbenchView {
  /**
   * @param {object} context shared app context.
   * @param {'personal'|'relationship'} category
   */
  constructor(context, category) {
    this.ctx = context;
    this.category = category;
    this.state = {
      type: category === 'personal' ? 'natal' : 'synastry',
      houseSystem: 'placidus',
      zodiac: 'tropical',
      options: {},
    };
  }

  get title() {
    return this.category === 'personal'
      ? { h1: '个人星盘', sub: '本命 · 行运 · 二次推运 · 太阳/月亮返照' }
      : { h1: '合盘分析', sub: '比较盘 · 组合中点盘 · 戴维森时空盘' };
  }

  get chartTypes() {
    return (this.ctx.reference.chartTypes || []).filter((t) => t.category === this.category);
  }

  render(container) {
    this.container = container;
    this.resultHost = h('div', { class: 'panel', style: { minHeight: '300px' } }, [
      h('div', { class: 'panel-body' }, [emptyResult()]),
    ]);
    this._drawControls();
  }

  _drawControls() {
    const profiles = this.ctx.store.getState().profiles || [];
    const needsSecondary = this._currentType().requiresSecondary;

    if (!profiles.length) {
      mount(this.container, h('div', { class: 'empty-state' }, [
        h('div', { class: 'big' }, '✶'),
        h('p', {}, '请先在「档案管理」创建至少一个档案。'),
      ]));
      return;
    }

    const primaryDefault = this.ctx.store.getState().selectedPrimaryId || profiles[0].id;
    this.primarySelect = profileSelect(profiles, primaryDefault);
    this.secondarySelect = profileSelect(profiles, profiles[1] ? profiles[1].id : profiles[0].id);

    this.typeSelect = h('select', {
      class: 'select', onchange: (e) => { this.state.type = e.target.value; this._drawControls(); },
    }, this.chartTypes.map((t) => h('option', { value: t.value || t.type, selected: (t.type === this.state.type) }, `${t.nameZh} · ${t.nameEn}`)));

    this.houseSelect = h('select', { class: 'select' },
      this.ctx.reference.houseSystems.map((hs) => h('option', { value: hs.value, selected: hs.value === this.state.houseSystem }, `${hs.nameZh} ${hs.nameEn}`)));
    this.zodiacSelect = h('select', { class: 'select' },
      ZODIACS.map((z) => h('option', { value: z.value, selected: z.value === this.state.zodiac }, z.label)));

    const controls = h('div', { class: 'panel' }, [
      h('div', { class: 'panel-header' }, [h('h3', {}, '星盘设置')]),
      h('div', { class: 'panel-body' }, [
        field(this.category === 'relationship' ? '主体（内环）' : '档案', this.primarySelect),
        needsSecondary ? field('次体（外环）', this.secondarySelect) : null,
        field('星盘类型', this.typeSelect),
        this._optionsField(),
        h('div', { class: 'form-grid mt-2' }, [
          field('宫位系统', this.houseSelect),
          field('黄道系统', this.zodiacSelect),
        ]),
        h('button', { class: 'btn btn-primary btn-block mt-3', onclick: () => this._compute() }, '✶ 生成星盘'),
      ]),
    ]);

    mount(this.container, h('div', { class: 'workspace' }, [
      h('div', { class: 'panel-stack' }, [controls]),
      h('div', { class: 'panel-stack' }, [this.resultHost]),
    ]));
  }

  _currentType() {
    return this.chartTypes.find((t) => t.type === this.state.type) || this.chartTypes[0];
  }

  /** Render the type-specific option control (date / year), if any. */
  _optionsField() {
    const def = this._currentType();
    if (def.options.includes('targetDate')) {
      this.dateInput = h('input', { class: 'input', type: 'datetime-local', value: defaultDateTimeLocal() });
      return field('目标日期与时间', this.dateInput);
    }
    if (def.options.includes('year')) {
      this.yearInput = h('input', { class: 'input', type: 'number', min: 1, max: 3000, value: new Date().getFullYear() });
      return field('返照年份', this.yearInput);
    }
    this.dateInput = null;
    this.yearInput = null;
    return null;
  }

  _buildOptions() {
    const options = {};
    const def = this._currentType();
    if (def.options.includes('targetDate') && this.dateInput && this.dateInput.value) {
      options.targetDate = new Date(this.dateInput.value).toISOString();
    }
    if (def.options.includes('year') && this.yearInput) {
      options.year = Number(this.yearInput.value);
    }
    return options;
  }

  async _compute() {
    const profiles = this.ctx.store.getState().profiles || [];
    const byId = (id) => profiles.find((p) => p.id === id);
    const def = this._currentType();

    const primary = byId(this.primarySelect.value);
    const secondary = def.requiresSecondary ? byId(this.secondarySelect.value) : undefined;

    if (def.requiresSecondary && secondary && secondary.id === primary.id) {
      notify.error('请为合盘选择两个不同的档案');
      return;
    }

    this.state.houseSystem = this.houseSelect.value;
    this.state.zodiac = this.zodiacSelect.value;

    mount(this.resultHost.querySelector('.panel-body') || this.resultHost, loadingResult());
    try {
      const chart = await ApiClient.computeChart({
        type: this.state.type,
        primary,
        secondary,
        settings: { houseSystem: this.state.houseSystem, zodiac: this.state.zodiac },
        options: this._buildOptions(),
      });
      // Replace the whole result host with the rendered chart.
      mount(this.resultHost, h('div', { class: 'panel-body' }, []));
      renderChartResult(this.resultHost.querySelector('.panel-body'), chart, this.ctx.reference);
      notify.success(`${chart.meta.typeNameZh} 已生成`);
    } catch (err) {
      mount(this.resultHost, h('div', { class: 'panel-body' }, [
        h('div', { class: 'empty-state' }, [h('div', { class: 'big' }, '⚠'), h('p', {}, err.message)]),
      ]));
      notify.error(err.message);
    }
  }
}

// —— local helpers ————————————————————————————————————————————

function field(label, control) {
  return control ? h('div', { class: 'field mt-2' }, [h('label', {}, label), control]) : null;
}

function profileSelect(profiles, selectedId) {
  return h('select', { class: 'select' },
    profiles.map((p) => h('option', { value: p.id, selected: p.id === selectedId }, `${p.nameZh || p.nameEn} · ${p.birthData.year}-${pad(p.birthData.month)}-${pad(p.birthData.day)}`)));
}

function emptyResult() {
  return h('div', { class: 'empty-state' }, [
    h('div', { class: 'big' }, '✶'),
    h('p', {}, '设置参数后点击「生成星盘」查看结果。'),
  ]);
}
function loadingResult() {
  return h('div', { class: 'empty-state' }, [h('div', { class: 'big boot-glyph' }, '✶'), h('p', {}, '正在计算星盘…')]);
}

function pad(n) { return String(n).padStart(2, '0'); }
function defaultDateTimeLocal() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
}
