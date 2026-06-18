'use strict';

/**
 * AngleMath — pure functions for working with ecliptic angles (degrees, 0–360).
 *
 * Kept dependency-free so it can be unit tested in isolation and reused by every
 * astrology strategy. All functions are side-effect free.
 */
const AngleMath = {
  /** Normalise any angle into the [0, 360) range. */
  normalize(angle) {
    const wrapped = angle % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
  },

  /**
   * Shortest separation between two angles, always in [0, 180].
   * Used for aspect detection where direction is irrelevant.
   */
  separation(a, b) {
    const diff = Math.abs(this.normalize(a) - this.normalize(b)) % 360;
    return diff > 180 ? 360 - diff : diff;
  },

  /**
   * Signed delta from `from` to `to` in (-180, 180].
   * Positive means `to` is counter-clockwise (zodiacally later) from `from`.
   */
  delta(from, to) {
    let d = this.normalize(to) - this.normalize(from);
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  },

  /**
   * Circular midpoint of two angles along the shortest arc.
   * Required for composite charts where naive averaging is wrong across 0°.
   */
  midpoint(a, b) {
    const half = this.delta(a, b) / 2;
    return this.normalize(this.normalize(a) + half);
  },

  /** Zero-based zodiac sign index (0 = Aries) for an absolute longitude. */
  signIndex(longitude) {
    return Math.floor(this.normalize(longitude) / 30);
  },

  /** Degrees within the current sign (0–30). */
  degreeInSign(longitude) {
    return this.normalize(longitude) % 30;
  },

  /** Split a within-sign decimal degree into {degrees, minutes, seconds}. */
  toDms(decimalDegrees) {
    const total = Math.abs(decimalDegrees);
    const degrees = Math.floor(total);
    const minutesFloat = (total - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.round((minutesFloat - minutes) * 60);
    if (seconds === 60) return { degrees, minutes: minutes + 1, seconds: 0 };
    return { degrees, minutes, seconds };
  },
};

module.exports = AngleMath;
