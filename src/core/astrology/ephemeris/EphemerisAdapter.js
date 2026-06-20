'use strict';

/**
 * EphemerisAdapter — abstract contract for the astronomy backend.
 *
 * Implementations translate a birth moment + place into the engine's
 * normalised Frame. The Frame shape is the stable contract: swapping the
 * ephemeris backend must not change what consumers (ChartData, strategies,
 * renderer) receive.
 *
 * Frame shape (all implementations MUST produce this):
 *   { points: [{key, kind, longitude, signIndex, degreeInSign, retrograde, house}],
 *     houses: [{index, cuspLongitude}],
 *     angles: {ascendant, midheaven, descendant, imumcoeli},
 *     instantUtc,  // ISO string
 *     julianDate }  // number, UT
 *
 * - longitude / cuspLongitude / angles.* MUST be normalised to [0,360) via AngleMath.normalize
 * - signIndex / degreeInSign MUST be derived from the normalised longitude via AngleMath
 * - key MUST be a lowercase token from Constants (DEFAULT_BODY_KEYS / DEFAULT_POINT_KEYS)
 * - house is 1-12, or null when no house attribution
 */
class EphemerisAdapter {
  /**
   * @param {object} [settings]
   * @param {string} [settings.houseSystem='placidus']
   * @param {string} [settings.zodiac='tropical']
   */
  constructor(settings = {}) {
    this.houseSystem = settings.houseSystem || 'placidus';
    this.zodiac = settings.zodiac || 'tropical';
  }

  /**
   * Cast a chart from explicit *local civil* fields.
   * @param {object} m {year, month(1-12), day, hour(0-23), minute, latitude, longitude}
   * @returns {object} normalised chart frame.
   */
  castFromLocal(m) { // eslint-disable-line no-unused-vars
    throw new Error('EphemerisAdapter.castFromLocal() must be implemented');
  }

  /**
   * Cast a chart for an absolute instant observed at a place.
   * @param {Date} instantUtc Absolute moment.
   * @param {{latitude:number, longitude:number}} place
   * @returns {object} normalised chart frame.
   */
  castFromInstant(instantUtc, place) { // eslint-disable-line no-unused-vars
    throw new Error('EphemerisAdapter.castFromInstant() must be implemented');
  }
}

module.exports = EphemerisAdapter;
