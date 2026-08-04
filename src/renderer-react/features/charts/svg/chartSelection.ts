import type { ChartIdentity, NormalizedChartResult } from '../contracts';

export type ChartSelectionTarget = {
  identity: ChartIdentity;
  tab: 'planets' | 'houses' | 'aspects';
};

export function selectionTargetForIdentity(
  result: NormalizedChartResult,
  identity: ChartIdentity,
): ChartSelectionTarget | null {
  if (!result.identities.includes(identity) || identity.startsWith('ring:')) return null;
  if (identity.startsWith('house:')) {
    return result.houses.some(({ id }) => id === identity) ? { identity, tab: 'houses' } : null;
  }
  if (identity.startsWith('aspect:')) {
    return result.aspects.some(({ id }) => id === identity) ? { identity, tab: 'aspects' } : null;
  }
  return result.rings.some((ring) => ring.points.some(({ id }) => id === identity))
    ? { identity, tab: 'planets' }
    : null;
}
