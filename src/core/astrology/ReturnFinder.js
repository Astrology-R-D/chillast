'use strict';

const AngleMath = require('../util/AngleMath');

const MS_PER_DAY = 86400000;

/**
 * ReturnFinder — locates the instant a transiting body returns to a target
 * ecliptic longitude (the defining moment of solar/lunar return charts).
 *
 * It treats the signed angular delta `g(t) = delta(target, bodyLon(t))` as a
 * function with an ascending zero crossing at the return, then brackets and
 * bisects that crossing. A magnitude guard rejects the ±180° discontinuity so we
 * never mistake an opposition for a conjunction.
 */
const ReturnFinder = {
  /**
   * @param {object} params
   * @param {EphemerisAdapter} params.adapter
   * @param {{latitude:number, longitude:number}} params.place
   * @param {string} params.bodyKey Celestial key to track (e.g. 'sun', 'moon').
   * @param {number} params.targetLongitude Natal longitude to return to.
   * @param {Date} params.windowStart Inclusive search start.
   * @param {Date} params.windowEnd   Inclusive search end.
   * @param {number} [params.stepDays=0.25] Coarse sampling resolution.
   * @returns {Date|null} the return instant, or null if none found in window.
   */
  findReturn({ adapter, place, bodyKey, targetLongitude, windowStart, windowEnd, stepDays = 0.25 }) {
    const lonAt = (ms) => {
      const frame = adapter.castFromInstant(new Date(ms), place);
      const point = frame.points.find((p) => p.key === bodyKey);
      return point ? point.longitude : null;
    };
    const g = (ms) => AngleMath.delta(targetLongitude, lonAt(ms));

    const startMs = windowStart.getTime();
    const endMs = windowEnd.getTime();
    const stepMs = stepDays * MS_PER_DAY;

    let prevMs = startMs;
    let prevG = g(prevMs);

    for (let t = startMs + stepMs; t <= endMs; t += stepMs) {
      const currG = g(t);
      const ascendingZero = prevG <= 0 && currG > 0;
      const nearTarget = Math.abs(prevG) < 30 && Math.abs(currG) < 30;
      if (ascendingZero && nearTarget) {
        return new Date(this._bisect(g, prevMs, t));
      }
      prevMs = t;
      prevG = currG;
    }
    return null;
  },

  /** Bisection refinement of the ascending zero between two bracketing ms. */
  _bisect(g, loMs, hiMs, iterations = 40) {
    let lo = loMs;
    let hi = hiMs;
    for (let i = 0; i < iterations; i += 1) {
      const mid = (lo + hi) / 2;
      const gm = g(mid);
      if (gm > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  },
};

module.exports = ReturnFinder;
