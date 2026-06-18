'use strict';

const ChartStrategy = require('./ChartStrategy');

const TROPICAL_YEAR_DAYS = 365.2422;
const LUNAR_MONTH_DAYS = 27.3216;
const MS_PER_DAY = 86400000;

class CompositeProgressedChartStrategy extends ChartStrategy {
  build(request) {
    const { type, primary, secondary, settings, options = {} } = request;
    if (!secondary) throw new Error('组合推运盘需要两个档案');

    const isTertiary = type === 'compositeTertiary';
    const divisor = isTertiary ? LUNAR_MONTH_DAYS : TROPICAL_YEAR_DAYS;
    const labelZh = isTertiary ? '组合三限' : '组合次限';
    const labelEn = isTertiary ? 'Composite Tertiary' : 'Composite Secondary';

    const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();
    const adapter = this._adapter(settings);

    const frameA = this._castNatal(primary, settings);
    const frameB = this._castNatal(secondary, settings);

    const progFrameA = this._progressFrame(frameA, primary, targetDate, divisor, adapter);
    const progFrameB = this._progressFrame(frameB, secondary, targetDate, divisor, adapter);

    const compositeHouses = this._midpointHouses(progFrameA.houses, progFrameB.houses);
    const compositePoints = this._midpointPoints(progFrameA.points, progFrameB.points, compositeHouses);
    const compositeAngles = this._midpointAngles(progFrameA.angles, progFrameB.angles);

    const points = compositePoints.map((p) => this.chartData.enrichPoint(p));

    return this._assemble({
      meta: {
        type,
        typeNameZh: labelZh,
        title: `${primary.nameZh || ''} ＋ ${secondary.nameZh || ''}`,
        subtitle: `${labelZh} · ${labelEn} @ ${targetDate.toISOString().slice(0, 10)}`,
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: null,
      },
      subjects: [
        this._subjectDescriptor(primary, 'primary'),
        this._subjectDescriptor(secondary, 'secondary'),
      ],
      houses: this.chartData.enrichHouses(compositeHouses),
      angles: this.chartData.enrichAngles(compositeAngles),
      rings: [{ id: type, role: 'composite', label: labelZh, points }],
      aspects: this._intraAspects(points, settings),
    });
  }

  _progressFrame(natalFrame, subject, targetDate, divisor, adapter) {
    const birthMs = new Date(natalFrame.instantUtc).getTime();
    const elapsed = (targetDate.getTime() - birthMs) / (divisor * MS_PER_DAY);
    const progressedMs = birthMs + elapsed * MS_PER_DAY;
    const place = subject.birthData.location;
    return adapter.castFromInstant(new Date(progressedMs), {
      latitude: place.latitude,
      longitude: place.longitude,
    });
  }

  _midpointHouses(housesA, housesB) {
    const byIndexB = new Map(housesB.map((h) => [h.index, h]));
    return housesA
      .map((a) => {
        const b = byIndexB.get(a.index);
        const cuspLongitude = b
          ? this.angleMath.midpoint(a.cuspLongitude, b.cuspLongitude)
          : a.cuspLongitude;
        return { index: a.index, cuspLongitude };
      })
      .sort((x, y) => x.index - y.index);
  }

  _midpointPoints(pointsA, pointsB, compositeHouses) {
    const byKeyB = new Map(pointsB.map((p) => [p.key, p]));
    const out = [];
    for (const a of pointsA) {
      const b = byKeyB.get(a.key);
      if (!b) continue;
      const longitude = this.angleMath.midpoint(a.longitude, b.longitude);
      out.push({
        key: a.key,
        kind: a.kind,
        longitude,
        signIndex: this.angleMath.signIndex(longitude),
        degreeInSign: this.angleMath.degreeInSign(longitude),
        retrograde: false,
        house: this.chartData.houseForLongitude(longitude, compositeHouses),
      });
    }
    return out;
  }

  _midpointAngles(anglesA, anglesB) {
    const out = {};
    for (const key of Object.keys(anglesA)) {
      out[key] = this.angleMath.midpoint(anglesA[key], anglesB[key]);
    }
    return out;
  }
}

module.exports = CompositeProgressedChartStrategy;
