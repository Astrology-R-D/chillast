import { describe, expect, it } from 'vitest';
import { allowedColumnIds, columnIds, columnsFor } from './explorerColumns';

const labels = new Proxy<Record<string, string>>({}, { get: (_target, key) => String(key) });

describe('stable explorer columns', () => {
  it('uses exact nonlocalized machine IDs for every explorer tab', () => {
    expect(columnIds('planets')).toEqual(['selected', 'ring', 'point', 'longitude', 'sign', 'degreeInSign', 'house', 'retrograde']);
    expect(columnIds('houses')).toEqual(['selected', 'house', 'cuspLongitude', 'sign', 'degreeInSign']);
    expect(columnIds('aspects')).toEqual(['selected', 'ringA', 'point1', 'aspect', 'ringB', 'point2', 'orb', 'strength']);
    expect(columnIds('distributions')).toEqual(['selected', 'section', 'key', 'value', 'startAge', 'endAge']);
  });

  it('defines distinct merged, side-by-side, and difference comparison columns', () => {
    expect(columnIds('comparison', 'merged')).toEqual(columnIds('planets'));
    expect(columnIds('comparison', 'sideBySide')).toEqual([
      'selected', 'point', 'firstRing', 'firstLongitude', 'firstSign', 'firstHouse', 'firstRetrograde',
      'secondRing', 'secondLongitude', 'secondSign', 'secondHouse', 'secondRetrograde',
    ]);
    expect(columnIds('comparison', 'difference')).toEqual([
      ...columnIds('comparison', 'sideBySide'), 'longitudeDelta', 'houseDelta',
    ]);
  });

  it('attaches simultaneous token, number, boolean, and text filter capabilities', () => {
    const planets = columnsFor('planets', 'merged', labels);
    const aspects = columnsFor('aspects', 'merged', labels);
    for (const id of ['ring', 'point', 'longitude', 'sign', 'house', 'retrograde']) {
      expect(planets.find((column) => column.id === id)?.filterFn, id).toBeTypeOf('function');
    }
    for (const id of ['point1', 'aspect', 'point2', 'orb']) {
      expect(aspects.find((column) => column.id === id)?.filterFn, id).toBeTypeOf('function');
    }
    expect(planets[0]).toMatchObject({ id: 'selected', enableHiding: false, enablePinning: false });
  });

  it('publishes the union of valid IDs for persistence validation', () => {
    const allowed = allowedColumnIds();
    expect([...allowed.planets]).toEqual(columnIds('planets'));
    expect(allowed.comparison).toEqual(new Set([
      ...columnIds('comparison', 'merged'),
      ...columnIds('comparison', 'sideBySide'),
      ...columnIds('comparison', 'difference'),
    ]));
  });
});
