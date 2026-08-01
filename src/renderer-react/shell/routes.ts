import {
  CalendarDays,
  ChartNoAxesCombined,
  CircleUserRound,
  Orbit,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export type RouteKey =
  | 'profiles'
  | 'personal'
  | 'relationship'
  | 'chinese'
  | 'solarTerms'
  | 'settings';

export interface RouteMetadata {
  key: RouteKey;
  labelKey: string;
  titleKey: string;
  groupKey: string;
  icon: LucideIcon;
}

export const ROUTES: readonly RouteMetadata[] = [
  { key: 'profiles', labelKey: 'nav.profiles', titleKey: 'profiles.title', groupKey: 'nav.groupProfiles', icon: CircleUserRound },
  { key: 'personal', labelKey: 'nav.personal', titleKey: 'chart.personalTitle', groupKey: 'nav.groupCharts', icon: Orbit },
  { key: 'relationship', labelKey: 'nav.relationship', titleKey: 'chart.relationshipTitle', groupKey: 'nav.groupCharts', icon: UsersRound },
  { key: 'chinese', labelKey: 'nav.chinese', titleKey: 'chinese.title', groupKey: 'nav.groupChinese', icon: ChartNoAxesCombined },
  { key: 'solarTerms', labelKey: 'nav.solarTerms', titleKey: 'tools.solarTermTitle', groupKey: 'nav.groupTools', icon: CalendarDays },
  { key: 'settings', labelKey: 'nav.settings', titleKey: 'settings.title', groupKey: 'nav.groupTools', icon: Settings },
];
