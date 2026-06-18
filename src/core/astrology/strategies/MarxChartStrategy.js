'use strict';

const ChartStrategy = require('./ChartStrategy');

class MarxChartStrategy extends ChartStrategy {
  build(request) {
    const { primary, secondary, settings } = request;
    if (!secondary) throw new Error('马盘需要两个档案');

    const frameA = this._castNatal(primary, settings);
    const frameB = this._castNatal(secondary, settings);

    const marxPoints = frameA.points.map((pA) => {
      return {
        key: pA.key,
        kind: pA.kind,
        longitude: pA.longitude,
        signIndex: pA.signIndex,
        degreeInSign: pA.degreeInSign,
        retrograde: pA.retrograde,
        house: this.chartData.houseForLongitude(pA.longitude, frameB.houses),
      };
    });
    const enrichedPoints = marxPoints.map((p) => this.chartData.enrichPoint(p));

    return this._assemble({
      meta: {
        type: 'marx',
        typeNameZh: '马盘',
        title: `${primary.nameZh || ''} → ${secondary.nameZh || ''}`,
        subtitle: '马盘 · Marx Chart',
        settings: this._chartSettings(settings),
        generatedAt: new Date().toISOString(),
        instantUtc: frameA.instantUtc,
      },
      subjects: [
        this._subjectDescriptor(primary, 'primary'),
        this._subjectDescriptor(secondary, 'secondary'),
      ],
      houses: this.chartData.enrichHouses(frameB.houses),
      angles: this.chartData.enrichAngles(frameB.angles),
      rings: [{ id: 'marx', role: 'composite', label: '马盘', points: enrichedPoints }],
      aspects: this._intraAspects(enrichedPoints, settings),
    });
  }
}

module.exports = MarxChartStrategy;
