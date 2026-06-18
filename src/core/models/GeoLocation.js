'use strict';

/**
 * GeoLocation — immutable value object describing a birth place.
 *
 * Latitude/longitude are the authoritative inputs for chart calculation; the
 * horoscope engine derives the historical timezone (including DST) purely from
 * these coordinates, so capturing them accurately matters more than the label.
 */
class GeoLocation {
  /**
   * @param {object} params
   * @param {string} params.label    Human readable place name (e.g. "Beijing, China").
   * @param {number} params.latitude Decimal degrees, north positive (-90..90).
   * @param {number} params.longitude Decimal degrees, east positive (-180..180).
   */
  constructor({ label, latitude, longitude }) {
    this.label = String(label || '').trim();
    this.latitude = Number(latitude);
    this.longitude = Number(longitude);
    Object.freeze(this);
  }

  /** @returns {string[]} validation error messages, empty when valid. */
  validate() {
    const errors = [];
    if (!this.label) errors.push('出生地名称不能为空');
    if (!Number.isFinite(this.latitude) || this.latitude < -90 || this.latitude > 90) {
      errors.push('纬度必须在 -90 到 90 之间');
    }
    if (!Number.isFinite(this.longitude) || this.longitude < -180 || this.longitude > 180) {
      errors.push('经度必须在 -180 到 180 之间');
    }
    return errors;
  }

  toJSON() {
    return { label: this.label, latitude: this.latitude, longitude: this.longitude };
  }

  static fromJSON(data) {
    return new GeoLocation(data || {});
  }
}

module.exports = GeoLocation;
