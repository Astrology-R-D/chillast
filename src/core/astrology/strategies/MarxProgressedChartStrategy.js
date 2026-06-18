'use strict';

const ChartStrategy = require('./ChartStrategy');

const TROPICAL_YEAR_DAYS = 365.2422;
const LUNAR_MONTH_DAYS = 27.3216;
const MS_PER_DAY = 86400000;

class MarxProgressedChartStrategy extends ChartStrategy {
  build(request) {
    const { type, primary, secondary, settings, options = {} } = request;
    if (!secondary) throw new Error('马盘推运需要两个档案');

    const isTertiary = type === 'marxTertiary';
    const divisor = isTertiary ? LUNAR_MONTH_DAYS : TROPICAL_YEAR_DAYS;
    const labelZh = isTertiary ? '马盘三限' : '马盘次限';
    const labelEn = isTertiary ? 'Marx Tertiary' : 'Marx Secondary';

    const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();
    const adapter = this._adapter(settings);

    const frameA = this._castNatal(primary, settings);
    const frameB = this._castNatal(secondary, settings);

    const birthAMs = new Date(frameA.instantUtc).getTime();
    const elapsed = (targetDate.getTime() - birthAMs) / (divisor * MS_PER_DAY);
    const progressedMs = birthAMs + elapsed * MS_PER_DAY;

    const placeA = primary.birthData.location;
    const progFrameA = adapter.castFromInstant(new Date(progressedMs), {
      latitude: placeA.latitude,
      longitude: placeA.longitude,
    });

    const marxPoints = progFrameA.points.map((pA) => ({
      key: pA.key,
      kind: pA.kind,
      longitude: pA.longitude,
      signIndex: pA.signIndex,
      degreeInSign: pA.degreeInSign,
      retrograde: pA.retrograde,
      house: this.chartData.houseForLongitude(pA.longitude, frameB.houses),
    }));
    const enrichedPoints = marxPoints.map((p) => this.chartData.enrichPoint(p));

    return this._assemble({
      meta: {
        type,
        typeNameZh: labelZh,
        title: `${primary.nameZh || ''} → ${secondary.nameZh || ''}`,
        subtitle: `${labelZh} · ${labelEn} @ ${targetDate.toISOString().slice(0, 10)}`,
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: null,
      },
      subjects: [
        this._subjectDescriptor(primary, 'primary'),
        this._subjectDescriptor(secondary, 'secondary'),
      ],
      houses: this.chartData.enrichHouses(frameB.houses),
      angles: this.chartData.enrichAngles(frameB.angles),
      rings: [{ id: type, role: 'composite', label: labelZh, points: enrichedPoints }],
      aspects: this._intraAspects(enrichedPoints, settings),
    });
  }
}

module.exports = MarxProgressedChartStrategy;
