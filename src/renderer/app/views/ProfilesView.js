import { h, mount, clear } from '../Dom.js';
import { ApiClient } from '../ApiClient.js';
import { ProfileForm } from '../components/ProfileForm.js';
import { notify } from '../components/Toast.js';
import { t } from '../I18n.js';

const GENDER_LABEL = { male: 'profiles.genderMale', female: 'profiles.genderFemale', other: 'profiles.genderOther' };

let _helpShown = false;

export class ProfilesView {
  constructor(context) {
    this.ctx = context;
    this.mode = 'idle';
    this.editing = null;
  }

  get title() { return { h1: t('profiles.title'), sub: t('profiles.sub') }; }

  render(container) {
    this.container = container;
    this._draw();
    if (!_helpShown) { _helpShown = true; this._showHelpPopup(); }
  }

  _draw() {
    const profiles = this.ctx.store.getState().profiles || [];

    const listPanel = h('div', { class: 'panel' }, [
      h('div', { class: 'panel-header' }, [
        h('h3', {}, t('profiles.panelHeading', { count: profiles.length })),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => this._startCreate() }, t('profiles.createBtn')),
      ]),
      h('div', { class: 'panel-body' }, [
        profiles.length
          ? h('div', { class: 'profile-list' }, profiles.map((p) => this._profileCard(p)))
          : h('div', { class: 'empty-state' }, [
            h('div', { class: 'big' }, '✶'),
            h('p', {}, t('profiles.emptyText')),
          ]),
      ]),
    ]);

    if (this.mode === 'idle') {
      mount(this.container, listPanel);
    } else {
      const formPanel = this._formPanel();
      mount(this.container, h('div', { class: 'workspace' }, [
        h('div', { class: 'panel-stack' }, [listPanel]),
        h('div', { class: 'panel-stack' }, [formPanel]),
      ]));
    }
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
        h('div', { class: 'name' }, [
          p.nameZh || p.nameEn,
          p.nameEn && p.nameZh
            ? h('span', { class: 'text-muted fw-normal ml-2 fs-sm' }, p.nameEn)
            : null,
        ]),
        h('div', { class: 'sub' }, `${t(GENDER_LABEL[p.gender])} · ${bd.year}-${pad(bd.month)}-${pad(bd.day)} ${pad(bd.hour)}:${pad(bd.minute)} · ${bd.location.label || ''}`),
      ]),
      h('div', { class: 'row-actions' }, [
        h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => { e.stopPropagation(); this._startEdit(p); } }, t('profiles.editBtn')),
        h('button', { class: 'btn btn-sm btn-danger', onclick: (e) => { e.stopPropagation(); this._remove(p); } }, t('profiles.deleteBtn')),
      ]),
    ]);
  }

  _showHelpPopup() {
    const popup = h('div', { class: 'help-popup' }, [
      h('div', { class: 'help-popup-header' }, [
        h('span', { class: 'fw-semibold fs-sm' }, t('profiles.helpTitle')),
        h('button', {
          class: 'btn btn-sm btn-ghost',
          style: { padding: '2px 6px', border: 'none', fontSize: '14px' },
          onclick: () => dismiss(),
        }, '×'),
      ]),
      h('p', { class: 'text-secondary fs-sm' }, t('profiles.helpBody')),
    ]);

    document.body.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add('is-visible'));

    const dismiss = () => {
      popup.classList.remove('is-visible');
      setTimeout(() => popup.remove(), 300);
    };

    setTimeout(dismiss, 8000);
  }

  _formPanel() {
    const form = new ProfileForm({
      profile: this.mode === 'edit' ? this.editing : null,
      onSaved: async () => { await this.ctx.refreshProfiles(); this.mode = 'idle'; this._draw(); },
      onCancel: () => { this.mode = 'idle'; this._draw(); },
    });
    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-header' }, [h('h3', {}, this.mode === 'edit' ? t('profiles.editHeading') : t('profiles.createHeading'))]),
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
    if (!window.confirm(t('profiles.deleteConfirm', { name: p.nameZh || p.nameEn }))) return;
    try {
      await ApiClient.profiles.remove(p.id);
      await this.ctx.refreshProfiles();
      notify.success(t('profiles.deleted'));
      this._draw();
    } catch (err) {
      notify.error(err.message);
    }
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
