'use strict';

const ChartStrategy = require('./ChartStrategy');

const TROPICAL_YEAR_DAYS = 365.2422;
const LUNAR_MONTH_DAYS = 27.3216;
const MS_PER_DAY = 86400000;

class DavisonProgressedChartStrategy extends ChartStrategy {
  build(request) {
    const { type, primary, secondary, settings, options = {} } = request;
    if (!secondary) throw new Error('时空推运盘需要两个档案');

    const isTertiary = type === 'davisonTertiary';
    const divisor = isTertiary ? LUNAR_MONTH_DAYS : TROPICAL_YEAR_DAYS;
    const labelZh = isTertiary ? '时空三限' : '时空次限';
    const labelEn = isTertiary ? 'Davison Tertiary' : 'Davison Secondary';

    const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();
    const adapter = this._adapter(settings);

    const frameA = this._castNatal(primary, settings);
    const frameB = this._castNatal(secondary, settings);

    const midInstant = new Date(
      (new Date(frameA.instantUtc).getTime() + new Date(frameB.instantUtc).getTime()) / 2,
    );
    const locA = primary.birthData.location;
    const locB = secondary.birthData.location;
    const midPlace = {
      latitude: (locA.latitude + locB.latitude) / 2,
      longitude: this._midLongitude(locA.longitude, locB.longitude),
    };

    const davisonFrame = adapter.castFromInstant(midInstant, midPlace);
    const davisonPoints = this._enrichPoints(davisonFrame);

    const davisonMs = midInstant.getTime();
    const elapsed = (targetDate.getTime() - davisonMs) / (divisor * MS_PER_DAY);
    const progressedMs = davisonMs + elapsed * MS_PER_DAY;

    const progressedFrame = adapter.castFromInstant(new Date(progressedMs), midPlace);
    const progressedPoints = this._enrichPoints(progressedFrame);

    return this._assemble({
      meta: {
        type,
        typeNameZh: labelZh,
        title: `${primary.nameZh || ''} ⊕ ${secondary.nameZh || ''}`,
        subtitle: `${labelZh} · ${labelEn} @ ${targetDate.toISOString().slice(0, 10)}`,
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: progressedFrame.instantUtc,
      },
      subjects: [
        this._subjectDescriptor(primary, 'primary'),
        this._subjectDescriptor(secondary, 'secondary'),
      ],
      houses: this.chartData.enrichHouses(davisonFrame.houses),
      angles: this.chartData.enrichAngles(davisonFrame.angles),
      rings: [
        { id: 'davison', role: 'primary', label: '时空', points: davisonPoints },
        { id: type, role: 'progressed', label: labelZh, points: progressedPoints },
      ],
      aspects: this._crossAspects(davisonPoints, progressedPoints, settings),
    });
  }

  _midLongitude(lngA, lngB) {
    const mid = this.angleMath.midpoint(lngA, lngB);
    return mid > 180 ? mid - 360 : mid;
  }
}

module.exports = DavisonProgressedChartStrategy;
