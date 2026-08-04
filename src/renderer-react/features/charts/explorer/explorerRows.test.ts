import { describe, expect, it } from 'vitest';
import type { ChartPoint, NormalizedChartResult } from '../contracts';
import { point, twoRingResult } from '../svg/chartTestFixtures';
import {
  aspectRows,
  compareNullableNumbers,
  comparisonRows,
  distributionRows,
  houseRows,
  planetRows,
  shortestSignedDelta,
  strategyMetadataRows,
} from './explorerRows';

function withRings(rings: NormalizedChartResult['rings']): NormalizedChartResult {
  return { ...twoRingResult, rings };
}

const chartPoint = (ringId: string, key: string, longitude: number) =>
  point(ringId, key, longitude) as ChartPoint;

describe('explorer row adapters', () => {
  it('derives stable machine-readable planet, house, aspect, and distribution rows', () => {
    expect(planetRows(twoRingResult)[0]).toMatchObject({
      id: 'natal:sun',
      chartIdentity: 'natal:sun',
      values: {
        ring: 'natal', point: 'sun', longitude: 10, sign: 'sign-0',
        degreeInSign: 10, house: 1, retrograde: false,
      },
    });
    expect(houseRows(twoRingResult)[0]).toMatchObject({
      id: 'house:1', chartIdentity: 'house:1',
      values: { house: 1, cuspLongitude: 0, sign: 'sign-0', degreeInSign: 0 },
    });
    expect(aspectRows(twoRingResult)[0]).toMatchObject({
      id: 'aspect:natal:moon:trine:natal:sun',
      chartIdentity: 'aspect:natal:moon:trine:natal:sun',
      values: { ringA: 'natal', point1: 'moon', aspect: 'trine', ringB: 'natal', point2: 'sun', orb: 0, strength: 1 },
    });
    expect(distributionRows(twoRingResult).map((row) => row.id)).toEqual([
      'distribution:element:fire', 'distribution:element:earth',
      'distribution:element:air', 'distribution:element:water',
      'distribution:modality:cardinal', 'distribution:modality:fixed',
      'distribution:modality:mutable',
    ]);
  });

  it('retains structured firdaria, profection, return fields, and unknown strategy metadata', () => {
    const result = {
      ...twoRingResult,
      meta: {
        ...twoRingResult.meta,
        firdaria: { major: { ruler: 'sun', startAge: 0, endAge: 10 } },
        profection: { age: 36, profectedSign: 'aries', lordOfYear: 'mars' },
        returnYear: 2026,
        progressionDays: 36.5,
        strategyFacts: { score: 3 },
      },
    } as NormalizedChartResult;

    const distributions = distributionRows(result);
    expect(distributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'firdaria:major', values: expect.objectContaining({ section: 'firdaria', key: 'major', startAge: 0, endAge: 10 }) }),
      expect.objectContaining({ id: 'profection:age', values: { section: 'profection', key: 'age', value: 36, startAge: null, endAge: null } }),
    ]));
    expect(strategyMetadataRows(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'metadata:returnYear', values: { section: 'metadata', key: 'returnYear', value: 2026 }, metadata: 2026 }),
      expect.objectContaining({ id: 'metadata:strategyFacts', values: { section: 'metadata', key: 'strategyFacts', value: null }, metadata: { score: 3 } }),
    ]));
  });
});

describe('comparison rows', () => {
  const complete = withRings([
    { ...twoRingResult.rings[0], points: [chartPoint('natal', 'sun', 10), chartPoint('natal', 'moon', 20)] },
    { ...twoRingResult.rings[1], points: [chartPoint('transit', 'sun', 350), chartPoint('transit', 'moon', 40)] },
  ]);
  const missingMoon = withRings([
    { ...twoRingResult.rings[0], points: [chartPoint('natal', 'sun', 10), chartPoint('natal', 'moon', 20)] },
    { ...twoRingResult.rings[1], points: [chartPoint('transit', 'sun', 350)] },
  ]);

  it('supports merged, side-by-side, and second-minus-first difference modes', () => {
    expect(comparisonRows(complete, 'merged').map((row) => row.id)).toEqual([
      'natal:sun', 'natal:moon', 'transit:sun', 'transit:moon',
    ]);
    expect(comparisonRows(complete, 'sideBySide')[0]).toMatchObject({
      id: 'comparison:sun',
      values: { point: 'sun', firstLongitude: 10, secondLongitude: 350 },
    });
    expect(comparisonRows(complete, 'difference')[0]).toMatchObject({
      id: 'comparison:sun',
      values: { longitudeDelta: -20, houseDelta: 0 },
    });
  });

  it('uses explicit null for a missing side and every derived delta', () => {
    expect(comparisonRows(missingMoon, 'difference').find(({ id }) => id === 'comparison:moon')?.values)
      .toMatchObject({ secondLongitude: null, secondHouse: null, longitudeDelta: null, houseDelta: null });
  });

  it('uses a deterministic shortest signed circular delta in second-first direction', () => {
    expect(shortestSignedDelta(0, 180)).toBe(-180);
    expect(shortestSignedDelta(350, 10)).toBe(20);
    expect(shortestSignedDelta(10, 350)).toBe(-20);
  });

  it('sorts missing nullable numbers last in both directions', () => {
    const values = [3, null, 1, 2];
    expect([...values].sort((a, b) => compareNullableNumbers(a, b, false))).toEqual([1, 2, 3, null]);
    expect([...values].sort((a, b) => compareNullableNumbers(a, b, true))).toEqual([3, 2, 1, null]);
  });
});
