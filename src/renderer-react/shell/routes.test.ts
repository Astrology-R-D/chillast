import { expect, test } from 'vitest';
import { ROUTES } from './routes';

test('defines exactly the six localized shell routes and their groups', () => {
  expect(ROUTES.map(({ key }) => key)).toEqual([
    'profiles',
    'personal',
    'relationship',
    'chinese',
    'solarTerms',
    'settings',
  ]);
  expect(ROUTES.map(({ groupKey }) => groupKey)).toEqual([
    'nav.groupProfiles',
    'nav.groupCharts',
    'nav.groupCharts',
    'nav.groupChinese',
    'nav.groupTools',
    'nav.groupTools',
  ]);
  expect(ROUTES.every((route) => route.labelKey && route.titleKey && route.icon)).toBe(true);
});
