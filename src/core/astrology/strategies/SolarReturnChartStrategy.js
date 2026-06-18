'use strict';

const ChartStrategy = require('./ChartStrategy');
const ReturnFinder = require('../ReturnFinder');

const MS_PER_DAY = 86400000;

/**
 * SolarReturnChartStrategy — the solar return / solar revolution chart (太阳返照).
 * It finds the exact moment in the chosen year when the transiting Sun reconjuncts
 * the natal Sun, then casts a full chart for that instant at the chosen location.
 */
class SolarReturnChartStrategy extends ChartStrategy {
  build(request) {
    const { primary, settings, options = {} } = request;
    const natalFrame = this._castNatal(primary, settings);
    const natalSun = natalFrame.points.find((p) => p.key === 'sun');

    // Location for the return: natal place, or the user's current place.
    const place = options.location || primary.birthData.location;
    const adapter = this._adapter(settings);

    // Search a ±5 day window around the birthday anniversary in the target year.
    const year = options.year || new Date().getFullYear();
    const bd = primary.birthData;
    const anniversary = Date.UTC(year, bd.month - 1, bd.day, 0, 0);
    const returnInstant = ReturnFinder.findReturn({
      adapter,
      place: { latitude: place.latitude, longitude: place.longitude },
      bodyKey: 'sun',
      targetLongitude: natalSun.longitude,
      windowStart: new Date(anniversary - 5 * MS_PER_DAY),
      windowEnd: new Date(anniversary + 5 * MS_PER_DAY),
      stepDays: 0.25,
    }) || new Date(anniversary);

    const frame = adapter.castFromInstant(returnInstant, {
      latitude: place.latitude,
      longitude: place.longitude,
    });
    const points = this._enrichPoints(frame);

    return this._assemble({
      meta: {
        type: 'solarReturn',
        typeNameZh: '太阳返照',
        title: `${primary.nameZh || primary.nameEn || ''} · ${year} 太阳返照`,
        subtitle: `太阳返照 · Solar Return @ ${returnInstant.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: frame.instantUtc,
      },
      subjects: [this._subjectDescriptor(primary, 'primary')],
      houses: this.chartData.enrichHouses(frame.houses),
      angles: this.chartData.enrichAngles(frame.angles),
      rings: [{ id: 'solarReturn', role: 'primary', label: '返照', points }],
      aspects: this._intraAspects(points, settings),
    });
  }
}

module.exports = SolarReturnChartStrategy;
