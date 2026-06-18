'use strict';

const ChartStrategy = require('./ChartStrategy');
const ReturnFinder = require('../ReturnFinder');

const MS_PER_DAY = 86400000;

/**
 * LunarReturnChartStrategy — the lunar return chart (月亮返照). The Moon returns to
 * its natal longitude roughly every 27.32 days; this finds the return nearest the
 * target date and casts a full chart for that instant.
 */
class LunarReturnChartStrategy extends ChartStrategy {
  build(request) {
    const { primary, settings, options = {} } = request;
    const natalFrame = this._castNatal(primary, settings);
    const natalMoon = natalFrame.points.find((p) => p.key === 'moon');

    const place = options.location || primary.birthData.location;
    const adapter = this._adapter(settings);
    const target = options.targetDate ? new Date(options.targetDate) : new Date();

    // A ±14 day window guarantees exactly one return of the ~27.32-day cycle.
    const returnInstant = ReturnFinder.findReturn({
      adapter,
      place: { latitude: place.latitude, longitude: place.longitude },
      bodyKey: 'moon',
      targetLongitude: natalMoon.longitude,
      windowStart: new Date(target.getTime() - 14 * MS_PER_DAY),
      windowEnd: new Date(target.getTime() + 14 * MS_PER_DAY),
      stepDays: 0.1,
    }) || target;

    const frame = adapter.castFromInstant(returnInstant, {
      latitude: place.latitude,
      longitude: place.longitude,
    });
    const points = this._enrichPoints(frame);

    return this._assemble({
      meta: {
        type: 'lunarReturn',
        typeNameZh: '月亮返照',
        title: `${primary.nameZh || primary.nameEn || ''} · 月亮返照`,
        subtitle: `月亮返照 · Lunar Return @ ${returnInstant.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: frame.instantUtc,
      },
      subjects: [this._subjectDescriptor(primary, 'primary')],
      houses: this.chartData.enrichHouses(frame.houses),
      angles: this.chartData.enrichAngles(frame.angles),
      rings: [{ id: 'lunarReturn', role: 'primary', label: '返照', points }],
      aspects: this._intraAspects(points, settings),
    });
  }
}

module.exports = LunarReturnChartStrategy;
