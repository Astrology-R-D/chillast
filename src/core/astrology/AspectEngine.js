'use strict';

const AngleMath = require('../util/AngleMath');
const { ASPECTS } = require('./Constants');

/**
 * AspectEngine — detects aspects between celestial points.
 *
 * A single, reusable algorithm serves every chart type:
 *   • intra-chart aspects  → call {@link compute} with `sameSet: true`
 *   • inter-chart aspects  → call with two different point arrays (synastry,
 *     transits-to-natal, etc.)
 *
 * The aspect catalogue and per-aspect orbs are injected so callers (or future
 * user settings) can tune sensitivity without touching the detection logic.
 */
class AspectEngine {
  /**
   * @param {object} [options]
   * @param {string[]} [options.enabledAspectKeys] Subset of ASPECTS to detect.
   * @param {Object<string,number>} [options.orbOverrides] Per-aspect orb override.
   */
  constructor(options = {}) {
    this.catalogue = ASPECTS;
    this.enabledAspectKeys = options.enabledAspectKeys
      || Object.keys(ASPECTS); // all aspects by default
    this.orbOverrides = options.orbOverrides || {};
  }

  /** Effective orb for an aspect key (override → catalogue default). */
  orbFor(aspectKey) {
    if (Number.isFinite(this.orbOverrides[aspectKey])) return this.orbOverrides[aspectKey];
    return this.catalogue[aspectKey].defaultOrb;
  }

  /**
   * Compute aspects between two point arrays.
   *
   * @param {Array} pointsA First set (each {key, longitude, ...}).
   * @param {Array} pointsB Second set.
   * @param {object} [opts]
   * @param {boolean} [opts.sameSet=false] When true, A and B are the same chart;
   *   only unordered pairs (i < j) are evaluated and self-pairs skipped.
   * @returns {Array<object>} aspect records sorted by ascending orb.
   */
  compute(pointsA, pointsB, opts = {}) {
    const sameSet = Boolean(opts.sameSet);
    const results = [];

    for (let i = 0; i < pointsA.length; i += 1) {
      const a = pointsA[i];
      const startJ = sameSet ? i + 1 : 0;
      for (let j = startJ; j < pointsB.length; j += 1) {
        const b = pointsB[j];
        if (sameSet && a.key === b.key) continue;
        const hit = this._match(a, b);
        if (hit) results.push(hit);
      }
    }

    return results.sort((x, y) => x.orb - y.orb);
  }

  /** Return the tightest matching aspect for a pair, or null. */
  _match(a, b) {
    const separation = AngleMath.separation(a.longitude, b.longitude);
    let best = null;

    for (const aspectKey of this.enabledAspectKeys) {
      const def = this.catalogue[aspectKey];
      if (!def) continue;
      const orb = Math.abs(separation - def.angle);
      const allowed = this.orbFor(aspectKey);
      if (orb <= allowed && (!best || orb < best.orb)) {
        best = {
          point1: a.key,
          point2: b.key,
          aspectKey,
          exactAngle: def.angle,
          separation: Number(separation.toFixed(4)),
          orb: Number(orb.toFixed(4)),
          orbUsed: allowed,
          level: def.level,
          strength: Number((1 - orb / allowed).toFixed(4)), // 1 = exact, 0 = edge
        };
      }
    }

    return best;
  }
}

module.exports = AspectEngine;
