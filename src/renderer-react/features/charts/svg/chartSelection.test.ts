import { describe, expect, test } from 'vitest';
import { twoRingResult } from './chartTestFixtures';
import { selectionTargetForIdentity } from './chartSelection';

describe('chart selection mapping', () => {
  test('maps complete normalized identities to the correct explorer tab', () => {
    expect(selectionTargetForIdentity(twoRingResult, 'natal:sun')).toEqual({ identity: 'natal:sun', tab: 'planets' });
    expect(selectionTargetForIdentity(twoRingResult, 'house:1')).toEqual({ identity: 'house:1', tab: 'houses' });
    expect(selectionTargetForIdentity(twoRingResult, twoRingResult.aspects[0].id)).toEqual({
      identity: twoRingResult.aspects[0].id, tab: 'aspects',
    });
  });

  test('rejects rings and identities absent from the normalized result', () => {
    expect(selectionTargetForIdentity(twoRingResult, 'ring:natal')).toBeNull();
    expect(selectionTargetForIdentity(twoRingResult, 'natal:missing')).toBeNull();
  });
});
