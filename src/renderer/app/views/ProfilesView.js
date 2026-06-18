// ProfilesView.js — manage the local profile library: list, create, edit and
// delete. Profiles are the input to every chart, so this is the app's home base.

import { h, mount } from '../Dom.js';
import { ApiClient } from '../ApiClient.js';
import { ProfileForm } from '../components/ProfileForm.js';
import { notify } from '../components/Toast.js';

const GENDER_LABEL = { male: '男', female: '女', other: '其他' };

export class ProfilesView {
  constructor(context) {
    this.ctx = context;       // { store, reference, refreshProfiles, navigate }
    this.mode = 'idle';        // idle | create | edit
    this.editing = null;
  }

  get title() { return { h1: '档案管理', sub: '创建并管理你的星盘档案 · 本地 JSON 存储' }; }

  render(container) {
    this.container = container;
    this._draw();
  }

  _draw() {
    const profiles = this.ctx.store.getState().profiles || [];

    const listPanel = h('div', { class: 'panel' }, [
      h('div', { class: 'panel-header' }, [
        h('h3', {}, `档案库 (${profiles.length})`),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => this._startCreate() }, '＋ 新建档案'),
      ]),
      h('div', { class: 'panel-body' }, [
        profiles.length
          ? h('div', { class: 'profile-list' }, profiles.map((p) => this._profileCard(p)))
          : h('div', { class: 'empty-state' }, [
            h('div', { class: 'big' }, '✶'),
            h('p', {}, '还没有档案，点击「新建档案」开始。'),
          ]),
      ]),
    ]);

    const rightPanel = this.mode === 'idle'
      ? this._helpPanel()
      : this._formPanel();

    mount(this.container, h('div', { class: 'workspace' }, [
      h('div', { class: 'panel-stack' }, [listPanel]),
      h('div', { class: 'panel-stack' }, [rightPanel]),
    ]));
  }

  _profileCard(p) {
    const selectedId = this.ctx.store.getState().selectedPrimaryId;
    const bd = p.birthData;
    const initial = (p.nameZh || p.nameEn || '?').slice(0, 1);
    return h('div', {
      class: `profile-card ${selectedId === p.id ? 'is-selected' : ''}`,
      onclick: () => this._select(p),
    }, [
      h('div', { class: `avatar ${p.gender}` }, initial),
      h('div', { class: 'who' }, [
        h('div', { class: 'name' }, [p.nameZh || p.nameEn, h('span', { class: 'text-muted', style: { fontWeight: '400', marginLeft: '6px', fontSize: '12px' } }, p.nameEn && p.nameZh ? p.nameEn : '')]),
        h('div', { class: 'sub' }, `${GENDER_LABEL[p.gender]} · ${bd.year}-${pad(bd.month)}-${pad(bd.day)} ${pad(bd.hour)}:${pad(bd.minute)} · ${bd.location.label || ''}`),
      ]),
      h('div', { class: 'row-actions' }, [
        h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => { e.stopPropagation(); this._startEdit(p); } }, '编辑'),
        h('button', { class: 'btn btn-sm btn-danger', onclick: (e) => { e.stopPropagation(); this._remove(p); } }, '删除'),
      ]),
    ]);
  }

  _helpPanel() {
    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-header' }, [h('h3', {}, '使用指引')]),
      h('div', { class: 'panel-body' }, [
        h('p', { class: 'text-secondary' }, '在左侧创建档案后，前往「个人星盘」生成本命、行运、推运与返照盘，或前往「合盘分析」生成比较盘、组合盘与戴维森盘。'),
        h('ul', { class: 'text-secondary', style: { lineHeight: '1.9', marginTop: '12px', paddingLeft: '18px' } }, [
          h('li', {}, '出生时间使用公历，精确到分钟，时区由出生地坐标自动推算（含历史夏令时）。'),
          h('li', {}, '出生地可搜索内置城市，或手动输入经纬度。'),
          h('li', {}, '所有档案以 JSON 形式保存在本机用户数据目录。'),
        ]),
      ]),
    ]);
  }

  _formPanel() {
    const form = new ProfileForm({
      profile: this.mode === 'edit' ? this.editing : null,
      onSaved: async () => { await this.ctx.refreshProfiles(); this.mode = 'idle'; this._draw(); },
      onCancel: () => { this.mode = 'idle'; this._draw(); },
    });
    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-header' }, [h('h3', {}, this.mode === 'edit' ? '编辑档案' : '新建档案')]),
      h('div', { class: 'panel-body' }, [form.element]),
    ]);
  }

  _startCreate() { this.mode = 'create'; this.editing = null; this._draw(); }
  _startEdit(p) { this.mode = 'edit'; this.editing = p; this._draw(); }

  _select(p) {
    this.ctx.store.setState({ selectedPrimaryId: p.id });
    this._draw();
  }

  async _remove(p) {
    if (!window.confirm(`确定删除档案「${p.nameZh || p.nameEn}」？`)) return;
    try {
      await ApiClient.profiles.remove(p.id);
      await this.ctx.refreshProfiles();
      notify.success('档案已删除');
      this._draw();
    } catch (err) {
      notify.error(err.message);
    }
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
