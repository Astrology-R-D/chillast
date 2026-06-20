'use strict';

const { Origin, Horoscope } = require('circular-natal-horoscope-js');
const { DateTime } = require('luxon');
const AngleMath = require('../util/AngleMath');
const { DEFAULT_BODY_KEYS, DEFAULT_POINT_KEYS } = require('./Constants');
const EphemerisAdapter = require('./ephemeris/EphemerisAdapter');

/**
 * HoroscopeAdapter — Adapter pattern around circular-natal-horoscope-js.
 *
 * It hides the third-party object graph behind a small, stable interface that
 * returns plain, IPC-serialisable data. The rest of the engine never imports the
 * library directly, so swapping the ephemeris backend later touches only this
 * file. The library's own aspect calculation is disabled; aspects are produced
 * by {@link AspectEngine} for uniform handling of single- and dual-chart cases.
 */
class HoroscopeAdapter extends EphemerisAdapter {
  /**
   * @param {object} [settings]
   * @param {string} [settings.houseSystem='placidus']
   * @param {string} [settings.zodiac='tropical']
   */
  constructor(settings = {}) {
    super(settings);
  }

  /**
   * Cast a chart from explicit *local civil* fields. Used for natal charts where
   * the user supplies clock time at the birth place; the library derives the
   * historical timezone (incl. DST) from the coordinates.
   *
   * @param {object} m
   * @param {number} m.year   Gregorian year.
   * @param {number} m.month  1–12 (human month).
   * @param {number} m.day    1–31.
   * @param {number} m.hour   0–23.
   * @param {number} m.minute 0–59.
   * @param {number} m.latitude
   * @param {number} m.longitude
   * @returns {object} normalised chart frame.
   */
  castFromLocal(m) {
    const origin = new Origin({
      year: m.year,
      month: m.month - 1, // library months are zero-based
      date: m.day,
      hour: m.hour,
      minute: m.minute,
      latitude: m.latitude,
      longitude: m.longitude,
    });
    return this._buildFrame(origin);
  }

  /**
   * Cast a chart for an absolute instant observed at a location. Used for
   * transits, returns and progressions, where the moment is known in UTC but the
   * houses must be computed for a specific place.
   *
   * @param {Date} instantUtc Absolute moment.
   * @param {{latitude:number, longitude:number}} place
   * @returns {object} normalised chart frame.
   */
  castFromInstant(instantUtc, place) {
    const zone = this._resolveZone(place.latitude, place.longitude);
    const local = DateTime.fromJSDate(instantUtc, { zone: 'utc' }).setZone(zone);
    return this.castFromLocal({
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute,
      latitude: place.latitude,
      longitude: place.longitude,
    });
  }

  /** Resolve the IANA timezone name the library associates with a coordinate. */
  _resolveZone(latitude, longitude) {
    const probe = new Origin({
      year: 2000, month: 0, date: 1, hour: 12, minute: 0, latitude, longitude,
    });
    return probe.timezone && probe.timezone.name ? probe.timezone.name : 'UTC';
  }

  /** Translate a horoscope instance into the engine's normalised frame. */
  _buildFrame(origin) {
    const horoscope = new Horoscope({
      origin,
      houseSystem: this.houseSystem,
      zodiac: this.zodiac,
      aspectPoints: [],
      aspectWithPoints: [],
      aspectTypes: [],
      language: 'en',
    });

    const points = [];
    for (const body of horoscope.CelestialBodies.all) {
      if (!DEFAULT_BODY_KEYS.includes(body.key)) continue;
      points.push(this._normalizePoint(body, 'body'));
    }
    for (const point of horoscope.CelestialPoints.all) {
      if (!DEFAULT_POINT_KEYS.includes(point.key)) continue;
      points.push(this._normalizePoint(point, 'point'));
    }

    const houses = horoscope.Houses.map((house) => ({
      index: house.id,
      cuspLongitude: AngleMath.normalize(house.ChartPosition.StartPosition.Ecliptic.DecimalDegrees),
    }));

    const ascendant = AngleMath.normalize(horoscope.Ascendant.ChartPosition.Ecliptic.DecimalDegrees);
    const midheaven = AngleMath.normalize(horoscope.Midheaven.ChartPosition.Ecliptic.DecimalDegrees);
    const angles = {
      ascendant,
      midheaven,
      descendant: AngleMath.normalize(ascendant + 180),
      imumcoeli: AngleMath.normalize(midheaven + 180),
    };

    return {
      points,
      houses,
      angles,
      instantUtc: origin.utcTime instanceof Date ? origin.utcTime.toISOString() : new Date(origin.utcTime).toISOString(),
      julianDate: origin.julianDate,
    };
  }

  /** Normalise a single celestial body/point into the engine point shape. */
  _normalizePoint(raw, kind) {
    const longitude = AngleMath.normalize(raw.ChartPosition.Ecliptic.DecimalDegrees);
    return {
      key: raw.key,
      kind,
      longitude,
      signIndex: AngleMath.signIndex(longitude),
      degreeInSign: AngleMath.degreeInSign(longitude),
      retrograde: Boolean(raw.isRetrograde),
      house: raw.House && raw.House.id ? raw.House.id : null,
    };
  }
}

module.exports = HoroscopeAdapter;
