// ProfileForm.js — create/edit a profile. Renders bilingual name fields, gender
// selector, a to-the-minute Gregorian birth datetime and a CityPicker, then
// persists via ApiClient. Pure UI: validation errors come from the domain model
// through the IPC layer, so the form never duplicates business rules.

import { h, mount } from '../Dom.js';
import { ApiClient } from '../ApiClient.js';
import { CityPicker } from './CityPicker.js';
import { notify } from './Toast.js';
import { t } from '../I18n.js';

const GENDERS = [
  { value: 'male', label: 'profiles.genderMale' },
  { value: 'female', label: 'profiles.genderFemale' },
  { value: 'other', label: 'profiles.genderOther' },
];

export class ProfileForm {
  /**
   * @param {object} opts
   * @param {object} [opts.profile] existing profile JSON to edit.
   * @param {Function} [opts.onSaved] called with the saved profile.
   * @param {Function} [opts.onCancel]
   */
  constructor(opts = {}) {
    this.profile = opts.profile || null;
    this.onSaved = opts.onSaved || (() => {});
    this.onCancel = opts.onCancel || (() => {});
    this.gender = this.profile ? this.profile.gender : 'female';
    this._build();
  }

  get element() { return this.root; }

  _build() {
    const p = this.profile;
    const bd = p ? p.birthData : null;

    this.nameZh = input({ placeholder: t('form.placeholderZh'), value: p ? p.nameZh : '' });
    this.nameEn = input({ placeholder: t('form.placeholderEn'), value: p ? p.nameEn : '' });
    this.notes = h('textarea', { class: 'textarea', placeholder: t('form.placeholderNotes') }, p ? p.notes : '');

    this.dateFields = {
      year: numInput({ placeholder: t('form.placeholderYear'), value: bd ? bd.year : '', min: 1, max: 3000, w: '年' }),
      month: numInput({ placeholder: t('form.placeholderMonth'), value: bd ? bd.month : '', min: 1, max: 12 }),
      day: numInput({ placeholder: t('form.placeholderDay'), value: bd ? bd.day : '', min: 1, max: 31 }),
      hour: numInput({ placeholder: t('form.placeholderHour'), value: bd ? bd.hour : '', min: 0, max: 23 }),
      minute: numInput({ placeholder: t('form.placeholderMinute'), value: bd ? bd.minute : '', min: 0, max: 59 }),
    };

    this.genderSeg = h('div', { class: 'segmented' },
      GENDERS.map((g) => h('button', {
        type: 'button',
        class: g.value === this.gender ? 'is-active' : '',
        onclick: () => this._setGender(g.value),
      }, t(g.label))));

    this.cityPicker = new CityPicker({
      value: bd ? bd.location : undefined,
    });

    this.errorBox = h('div', { class: 'field-error', style: { minHeight: '16px' } });

    this.root = h('div', {}, [
      h('div', { class: 'form-grid' }, [
        field(t('form.nameZh'), this.nameZh),
        field(t('form.nameEn'), this.nameEn),
        field(t('form.gender'), this.genderSeg),
        field('', h('div')),
        h('div', { class: 'field col-span' }, [
          h('label', {}, t('form.birthDateTime')),
          h('div', { class: 'datetime-row' }, [
            this.dateFields.year, this.dateFields.month, this.dateFields.day,
            this.dateFields.hour, this.dateFields.minute,
          ]),
        ]),
        this.cityPicker.element,
        h('div', { class: 'field col-span' }, [h('label', {}, t('form.notes')), this.notes]),
      ]),
      this.errorBox,
      h('div', { class: 'row mt-3', style: { gap: '10px' } }, [
        h('button', { class: 'btn btn-primary', onclick: () => this._save() }, p ? t('form.save') : t('form.create')),
        h('button', { class: 'btn btn-ghost', onclick: () => this.onCancel() }, t('form.cancel')),
      ]),
    ]);
  }

  _setGender(value) {
    this.gender = value;
    mount(this.genderSeg, GENDERS.map((g) => h('button', {
      type: 'button',
      class: g.value === this.gender ? 'is-active' : '',
      onclick: () => this._setGender(g.value),
    }, t(g.label))));
  }

  _collect() {
    const num = (input) => (input.value === '' ? NaN : Number(input.value));
    return {
      id: this.profile ? this.profile.id : undefined,
      nameZh: this.nameZh.value.trim(),
      nameEn: this.nameEn.value.trim(),
      gender: this.gender,
      notes: this.notes.value,
      birthData: {
        year: num(this.dateFields.year),
        month: num(this.dateFields.month),
        day: num(this.dateFields.day),
        hour: num(this.dateFields.hour),
        minute: num(this.dateFields.minute),
        location: this.cityPicker.getValue(),
      },
    };
  }

  async _save() {
    this.errorBox.textContent = '';
    try {
      const saved = await ApiClient.profiles.save(this._collect());
      notify.success(t('form.saved'));
      this.onSaved(saved);
    } catch (err) {
      this.errorBox.textContent = err.message;
      notify.error(t('form.saveFailed'));
    }
  }
}

// —— local field helpers ————————————————————————————————————————

function field(label, control) {
  return h('div', { class: 'field' }, [label ? h('label', {}, label) : null, control]);
}
function input(props) {
  return h('input', { class: 'input', ...props });
}
function numInput({ placeholder, value, min, max }) {
  return h('input', {
    class: 'input', type: 'number', placeholder, min, max,
    value: value === '' || value == null ? '' : value,
  });
}
