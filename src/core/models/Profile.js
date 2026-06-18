'use strict';

const BirthData = require('./BirthData');

/** Allowed gender tokens kept stable for serialization. */
const GENDERS = Object.freeze(['male', 'female', 'other']);

/**
 * Profile — the aggregate root persisted to disk. Identified by a stable `id`
 * and carrying bilingual names, gender and the birth moment. Equality and
 * persistence are driven entirely by `toJSON` so the storage layer stays dumb.
 */
class Profile {
  /**
   * @param {object} params
   * @param {string} [params.id]        Stable identifier; generated when absent.
   * @param {string} params.nameZh      Chinese name.
   * @param {string} [params.nameEn]    English name.
   * @param {string} params.gender      One of GENDERS.
   * @param {BirthData|object} params.birthData
   * @param {string} [params.notes]     Free-form notes.
   * @param {string} [params.createdAt] ISO timestamp.
   * @param {string} [params.updatedAt] ISO timestamp.
   */
  constructor({ id, nameZh, nameEn, gender, birthData, notes, createdAt, updatedAt }) {
    this.id = id || Profile.generateId();
    this.nameZh = String(nameZh || '').trim();
    this.nameEn = String(nameEn || '').trim();
    this.gender = GENDERS.includes(gender) ? gender : 'other';
    this.birthData = birthData instanceof BirthData ? birthData : new BirthData(birthData || {});
    this.notes = String(notes || '');
    this.createdAt = createdAt || new Date().toISOString();
    this.updatedAt = updatedAt || this.createdAt;
  }

  /** Preferred display name, favouring the Chinese name. */
  get displayName() {
    return this.nameZh || this.nameEn || '未命名档案';
  }

  /** @returns {string[]} validation error messages, empty when valid. */
  validate() {
    const errors = [];
    if (!this.nameZh && !this.nameEn) errors.push('至少需要填写中文或英文名字');
    if (!GENDERS.includes(this.gender)) errors.push('性别取值无效');
    this.birthData.validate().forEach((e) => errors.push(e));
    return errors;
  }

  /** Return a copy with patched fields and a refreshed updatedAt timestamp. */
  withUpdates(patch) {
    return new Profile({
      ...this.toJSON(),
      ...patch,
      // Preserve nested value objects unless explicitly replaced.
      birthData: patch.birthData || this.birthData.toJSON(),
      updatedAt: new Date().toISOString(),
    });
  }

  toJSON() {
    return {
      id: this.id,
      nameZh: this.nameZh,
      nameEn: this.nameEn,
      gender: this.gender,
      birthData: this.birthData.toJSON(),
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(data) {
    return new Profile(data || {});
  }

  static generateId() {
    return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  static get GENDERS() {
    return GENDERS;
  }
}

module.exports = Profile;
