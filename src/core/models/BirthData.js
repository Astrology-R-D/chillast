'use strict';

const GeoLocation = require('./GeoLocation');

/**
 * BirthData — immutable value object capturing the moment of birth.
 *
 * Stored as the *local civil* calendar fields (Gregorian, to the minute) exactly
 * as they appear on a birth certificate, paired with the place. The astrology
 * engine converts local → UTC using the place coordinates, so no timezone needs
 * to be persisted here.
 */
class BirthData {
  /**
   * @param {object} params
   * @param {number} params.year   Gregorian year, e.g. 1990.
   * @param {number} params.month  1–12 (human, not zero-based).
   * @param {number} params.day    1–31.
   * @param {number} params.hour   0–23 local clock time.
   * @param {number} params.minute 0–59.
   * @param {GeoLocation|object} params.location Birth place.
   */
  constructor({ year, month, day, hour, minute, location }) {
    this.year = Number(year);
    this.month = Number(month);
    this.day = Number(day);
    this.hour = Number(hour);
    this.minute = Number(minute);
    this.location = location instanceof GeoLocation ? location : new GeoLocation(location || {});
    Object.freeze(this);
  }

  /** @returns {string[]} validation error messages, empty when valid. */
  validate() {
    const errors = [];
    const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!inRange(this.year, 1, 3000)) errors.push('出生年份无效');
    if (!inRange(this.month, 1, 12)) errors.push('出生月份必须在 1–12 之间');
    if (!inRange(this.day, 1, 31)) errors.push('出生日期必须在 1–31 之间');
    if (!inRange(this.hour, 0, 23)) errors.push('出生小时必须在 0–23 之间');
    if (!inRange(this.minute, 0, 59)) errors.push('出生分钟必须在 0–59 之间');
    // Calendar sanity: reject impossible day-of-month combinations.
    if (errors.length === 0) {
      const probe = new Date(Date.UTC(this.year, this.month - 1, this.day));
      if (probe.getUTCMonth() !== this.month - 1) errors.push('该月份不存在此日期');
    }
    this.location.validate().forEach((e) => errors.push(e));
    return errors;
  }

  /** ISO-like local label for display, e.g. "1990-01-15 14:30". */
  toLocalLabel() {
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(this.year, 4)}-${p(this.month)}-${p(this.day)} ${p(this.hour)}:${p(this.minute)}`;
  }

  toJSON() {
    return {
      year: this.year,
      month: this.month,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      location: this.location.toJSON(),
    };
  }

  static fromJSON(data) {
    return new BirthData(data || {});
  }
}

module.exports = BirthData;
