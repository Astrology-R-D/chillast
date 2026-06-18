'use strict';

const ChartData = require('../ChartData');
const AngleMath = require('../../util/AngleMath');

/**
 * ChartStrategy — abstract base of the Strategy pattern family. Each concrete
 * strategy knows how to produce one *kind* of chart, but shares the casting,
 * enrichment and aspect plumbing defined here so concrete classes stay small and
 * focused on the part that makes them unique.
 *
 * Collaborators (the adapter and aspect-engine classes) are injected through
 * `deps`, keeping strategies decoupled from concrete implementations and easy to
 * unit test with fakes.
 */
class ChartStrategy {
  /**
   * @param {object} deps
   * @param {Function} deps.HoroscopeAdapter Adapter class.
   * @param {Function} deps.AspectEngine     Aspect engine class.
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @abstract
   * @param {object} request Validated chart request.
   * @returns {object} ChartData DTO.
   */
  build(request) { // eslint-disable-line no-unused-vars
    throw new Error('ChartStrategy.build() must be implemented by a subclass');
  }

  // —— shared helpers ————————————————————————————————————————————————

  /** Construct an adapter for the request's settings. */
  _adapter(settings) {
    return new this.deps.HoroscopeAdapter(this._chartSettings(settings));
  }

  /** Construct an aspect engine for the request's settings. */
  _aspectEngine(settings) {
    const aspectCfg = (settings && settings.aspects) || {};
    return new this.deps.AspectEngine({
      enabledAspectKeys: aspectCfg.enabled,
      orbOverrides: aspectCfg.orbOverrides,
    });
  }

  _chartSettings(settings) {
    return {
      houseSystem: (settings && settings.houseSystem) || 'placidus',
      zodiac: (settings && settings.zodiac) || 'tropical',
    };
  }

  /** Cast a natal frame for a subject from its local birth fields. */
  _castNatal(subject, settings) {
    const bd = subject.birthData;
    return this._adapter(settings).castFromLocal({
      year: bd.year,
      month: bd.month,
      day: bd.day,
      hour: bd.hour,
      minute: bd.minute,
      latitude: bd.location.latitude,
      longitude: bd.location.longitude,
    });
  }

  /** Build a serialisable descriptor of a subject for chart headers. */
  _subjectDescriptor(subject, role) {
    const bd = subject.birthData;
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return {
      role,
      nameZh: subject.nameZh || '',
      nameEn: subject.nameEn || '',
      gender: subject.gender || 'other',
      birthLabel: `${p(bd.year, 4)}-${p(bd.month)}-${p(bd.day)} ${p(bd.hour)}:${p(bd.minute)}`,
      location: bd.location,
    };
  }

  /** Convert a frame's raw points into enriched display points. */
  _enrichPoints(frame) {
    return frame.points.map((point) => ChartData.enrichPoint(point));
  }

  /** Run intra-chart aspect detection over a single enriched ring. */
  _intraAspects(points, settings) {
    return this._aspectEngine(settings)
      .compute(points, points, { sameSet: true })
      .map((a) => ChartData.enrichAspect(a));
  }

  /** Run cross-chart aspect detection between two enriched rings. */
  _crossAspects(pointsA, pointsB, settings) {
    return this._aspectEngine(settings)
      .compute(pointsA, pointsB, { sameSet: false })
      .map((a) => ChartData.enrichAspect(a));
  }

  /** Assemble the common envelope of a ChartData DTO. */
  _assemble({ meta, subjects, houses, angles, rings, aspects, distributions }) {
    return {
      meta,
      subjects,
      houses: houses || [],
      angles: angles || {},
      rings,
      aspects: aspects || [],
      distributions: distributions || ChartData.distributions(rings[0] ? rings[0].points : []),
    };
  }

  /** Shared util re-export so subclasses avoid a second import. */
  get angleMath() {
    return AngleMath;
  }

  get chartData() {
    return ChartData;
  }
}

module.exports = ChartStrategy;
