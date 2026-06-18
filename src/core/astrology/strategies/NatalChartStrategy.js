'use strict';

const ChartStrategy = require('./ChartStrategy');

/**
 * NatalChartStrategy — the foundational birth chart (本命盘): planetary positions,
 * houses and intra-chart aspects for a single subject at the moment of birth.
 */
class NatalChartStrategy extends ChartStrategy {
  build(request) {
    const { primary, settings } = request;
    const frame = this._castNatal(primary, settings);
    const points = this._enrichPoints(frame);

    return this._assemble({
      meta: {
        type: 'natal',
        typeNameZh: '本命盘',
        title: primary.nameZh || primary.nameEn || '本命盘',
        subtitle: '出生星盘 · Natal Chart',
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: frame.instantUtc,
      },
      subjects: [this._subjectDescriptor(primary, 'primary')],
      houses: this.chartData.enrichHouses(frame.houses),
      angles: this.chartData.enrichAngles(frame.angles),
      rings: [{ id: 'natal', role: 'primary', label: primary.nameZh || 'Natal', points }],
      aspects: this._intraAspects(points, settings),
    });
  }
}

module.exports = NatalChartStrategy;
