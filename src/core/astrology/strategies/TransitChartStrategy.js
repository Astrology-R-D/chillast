'use strict';

const ChartStrategy = require('./ChartStrategy');

/**
 * TransitChartStrategy — current/forecast sky (行运盘) laid over the natal chart.
 * Inner ring = natal positions; outer ring = transiting positions at the target
 * date; aspects connect transiting points to natal points. Houses come from the
 * natal chart, the conventional frame for reading transits.
 */
class TransitChartStrategy extends ChartStrategy {
  build(request) {
    const { primary, settings, options = {} } = request;
    const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();

    const natalFrame = this._castNatal(primary, settings);
    const natalPoints = this._enrichPoints(natalFrame);

    // Transits are cast for the natal location by default (sky as seen there).
    const place = options.location || primary.birthData.location;
    const transitFrame = this._adapter(settings).castFromInstant(targetDate, {
      latitude: place.latitude,
      longitude: place.longitude,
    });
    const transitPoints = this._enrichPoints(transitFrame);

    return this._assemble({
      meta: {
        type: 'transit',
        typeNameZh: '行运盘',
        title: `${primary.nameZh || primary.nameEn || ''} · 行运`,
        subtitle: `行运盘 · Transits @ ${this._fmt(targetDate)}`,
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: transitFrame.instantUtc,
      },
      subjects: [this._subjectDescriptor(primary, 'primary')],
      houses: this.chartData.enrichHouses(natalFrame.houses),
      angles: this.chartData.enrichAngles(natalFrame.angles),
      rings: [
        { id: 'natal', role: 'primary', label: '本命', points: natalPoints },
        { id: 'transit', role: 'transit', label: '行运', points: transitPoints },
      ],
      aspects: this._crossAspects(natalPoints, transitPoints, settings),
    });
  }

  _fmt(date) {
    return date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

module.exports = TransitChartStrategy;
