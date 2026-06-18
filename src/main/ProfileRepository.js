'use strict';

const fs = require('fs');
const path = require('path');
const Profile = require('../core/models/Profile');

/**
 * ProfileRepository — Repository pattern over a single JSON document on disk.
 *
 * The rest of the app treats profiles as a collection without caring that the
 * backing store is a file; swapping to SQLite or a remote API would only touch
 * this class. Writes are atomic (temp file + rename) so a crash mid-write cannot
 * corrupt the store. All public methods return/accept plain Profile JSON.
 */
class ProfileRepository {
  /**
   * @param {string} baseDir Directory in which `Profiles.json` lives.
   */
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, 'Profiles.json');
  }

  /** Ensure the storage directory and file exist. Idempotent. */
  init() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this._writeAll([]);
    }
    return this;
  }

  /** @returns {object[]} all profiles as JSON, newest-updated first. */
  list() {
    return this._readAll()
      .map((data) => Profile.fromJSON(data).toJSON())
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  /** @returns {object|null} a single profile JSON by id. */
  get(id) {
    const found = this._readAll().find((p) => p.id === id);
    return found ? Profile.fromJSON(found).toJSON() : null;
  }

  /**
   * Create or update a profile. The presence of a matching id decides which.
   * @param {object} profileJson
   * @returns {object} the persisted profile JSON.
   * @throws {Error} when validation fails.
   */
  save(profileJson) {
    const profile = Profile.fromJSON(profileJson);
    const errors = profile.validate();
    if (errors.length) {
      throw new Error(`档案校验失败：${errors.join('；')}`);
    }

    const all = this._readAll();
    const index = all.findIndex((p) => p.id === profile.id);
    if (index >= 0) {
      const merged = profile.withUpdates({}); // refresh updatedAt
      all[index] = merged.toJSON();
    } else {
      all.push(profile.toJSON());
    }
    this._writeAll(all);
    return profile.toJSON();
  }

  /**
   * Delete a profile by id.
   * @returns {boolean} true if a record was removed.
   */
  remove(id) {
    const all = this._readAll();
    const next = all.filter((p) => p.id !== id);
    const removed = next.length !== all.length;
    if (removed) this._writeAll(next);
    return removed;
  }

  // —— private I/O ————————————————————————————————————————————————

  _readAll() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      // Corrupt file: preserve it for forensics, start fresh.
      try {
        fs.renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      } catch (_) { /* best effort */ }
      return [];
    }
  }

  _writeAll(profiles) {
    fs.mkdirSync(this.baseDir, { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}

module.exports = ProfileRepository;
