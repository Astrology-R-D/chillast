import { expect, test } from 'vitest';
import { twoRingResult } from '../svg/chartTestFixtures';
import { presentChartValue } from './chartPresentation';
import type { ExplorerRow } from './explorerRows';

test('uses the shared degree/minute format while retaining raw numeric data for exports', () => {
  for (const [degree, text] of [[18.9872, '18°59′'], [29.9999, '29°59′'], [19, '19°00′']] as const) {
    const row: ExplorerRow = { id: 'natal:moon', chartIdentity: null, values: { degreeInSign: degree } };
    expect(presentChartValue(row, 'degreeInSign', twoRingResult).text).toBe(text);
    expect(row.values.degreeInSign).toBe(degree);
  }
});
