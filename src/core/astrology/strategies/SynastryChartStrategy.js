'use strict';

const ChartStrategy = require('./ChartStrategy');

/**
 * SynastryChartStrategy — relationship comparison bi-wheel (比较盘/双人合盘). Two
 * natal charts are overlaid: the inner ring is the primary subject, the outer
 * ring the secondary subject, and the aspect list contains the inter-aspects
 * between every primary point and every secondary point. Houses are drawn from
 * the primary chart (the conventional "whose house does their planet fall in").
 */
class SynastryChartStrategy extends ChartStrategy {
  build(request) {
    const { primary, secondary, settings } = request;
    if (!secondary) throw new Error('比较盘需要两个档案');

    const frameA = this._castNatal(primary, settings);
    const frameB = this._castNatal(secondary, settings);
    const pointsA = this._enrichPoints(frameA);
    const pointsB = this._enrichPoints(frameB);

    return this._assemble({
      meta: {
        type: 'synastry',
        typeNameZh: '比较盘',
        title: `${primary.displayName || primary.nameZh || ''} ✕ ${secondary.displayName || secondary.nameZh || ''}`,
        subtitle: '比较盘 · Synastry',
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: frameA.instantUtc,
      },
      subjects: [
        this._subjectDescriptor(primary, 'primary'),
        this._subjectDescriptor(secondary, 'secondary'),
      ],
      houses: this.chartData.enrichHouses(frameA.houses),
      angles: this.chartData.enrichAngles(frameA.angles),
      rings: [
        { id: 'primary', role: 'primary', label: primary.nameZh || 'A', points: pointsA },
        { id: 'secondary', role: 'secondary', label: secondary.nameZh || 'B', points: pointsB },
      ],
      aspects: this._crossAspects(pointsA, pointsB, settings),
    });
  }
}

module.exports = SynastryChartStrategy;
