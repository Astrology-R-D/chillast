import type { GeoLocation, Profile } from '../../api/contracts';

export const CHART_TYPES = [
  'natal',
  'transit',
  'tertiaryProgressed',
  'progressed',
  'lunarReturn',
  'solarReturn',
  'solarArc',
  'firdaria',
  'profection',
  'relocation',
  'synastry',
  'composite',
  'marx',
  'davison',
  'compositeSecondary',
  'compositeTertiary',
  'marxSecondary',
  'marxTertiary',
  'davisonSecondary',
  'davisonTertiary',
] as const;

export type ChartType = typeof CHART_TYPES[number];
export type ChartRoute = 'personal' | 'relationship';
export type Zodiac = 'tropical' | 'sidereal';
export type AspectLevel = 'major' | 'minor';
export type ChartOptionName = 'targetDate' | 'year' | 'location';
export type DynamicControl = 'secondaryProfile' | 'targetDate' | 'returnYear' | 'relocationPlace';

export type ChartPointId = `${string}:${string}`;
export type ChartHouseId = `house:${number}`;
export type ChartAspectId = `aspect:${string}:${string}:${string}:${string}:${string}`;

export interface ChartCatalogDefinition {
  type: string;
  nameZh: string;
  nameEn: string;
  category: ChartRoute;
  requiresSecondary: boolean;
  options: ChartOptionName[];
}

export interface ChartDescriptor {
  route: ChartRoute;
  requiresSecondary: boolean;
  serviceOptions: readonly ChartOptionName[];
  controls: readonly DynamicControl[];
}

export interface ChartAspectSettings {
  enabled: string[];
  orbOverrides: Record<string, number>;
}

export interface ChartSettings {
  houseSystem: string;
  zodiac: Zodiac;
  aspects: ChartAspectSettings;
}

export interface ChartOptions {
  targetDate?: string;
  year?: number;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
}

export interface ChartRequest {
  type: ChartType;
  primary: Profile;
  secondary?: Profile;
  settings: ChartSettings;
  options: ChartOptions;
}

export interface ChartPoint {
  id: ChartPointId;
  ringId: string;
  key: string;
  kind: 'body' | 'point' | 'angle';
  glyph: string;
  nameEn: string;
  nameZh: string;
  longitude: number;
  signKey: string;
  signGlyph: string;
  signNameZh: string;
  signIndex: number;
  degreeInSign: number;
  dms: string;
  retrograde: boolean;
  house: number;
}

export interface ChartRing {
  id: string;
  role: 'primary' | 'secondary' | 'transit' | 'progressed' | 'composite';
  label: string;
  points: ChartPoint[];
}

export interface ChartHouse {
  id: ChartHouseId;
  index: number;
  cuspLongitude: number;
  signKey: string;
  signGlyph: string;
  signNameZh: string;
  degreeInSign: number;
}

export interface ChartAngle {
  key: string;
  glyph: string;
  nameZh: string;
  longitude: number;
  signKey: string;
  signGlyph: string;
  signIndex: number;
  degreeInSign: number;
  dms: string;
}

export interface ChartAspect {
  id: ChartAspectId;
  ringA: string;
  point1: string;
  aspectKey: string;
  ringB: string;
  point2: string;
  glyph: string;
  nameZh: string;
  nameEn: string;
  level: AspectLevel;
  exactAngle: number;
  orb: number;
  orbUsed: number;
  strength: number;
  separation: number;
}

export interface ChartSubject {
  role: 'primary' | 'secondary';
  nameZh: string;
  nameEn: string;
  gender: Profile['gender'];
  birthLabel: string;
  location: GeoLocation;
}

export interface ChartMeta {
  type: ChartType;
  typeNameZh: string;
  title: string;
  subtitle: string;
  settings: Pick<ChartSettings, 'houseSystem' | 'zodiac'>;
  generatedAt: string;
  instantUtc: string;
  [key: string]: unknown;
}

export interface ChartDistributions {
  elements: Record<'fire' | 'earth' | 'air' | 'water', number>;
  modalities: Record<'cardinal' | 'fixed' | 'mutable', number>;
}

export interface NormalizedChartResult {
  meta: ChartMeta;
  subjects: ChartSubject[];
  houses: ChartHouse[];
  angles: Record<string, ChartAngle>;
  rings: ChartRing[];
  aspects: ChartAspect[];
  distributions: ChartDistributions;
}

export interface ChartReferenceData {
  signs: Array<Record<string, unknown>>;
  points: Record<string, Record<string, unknown>>;
  aspects: Record<string, Record<string, unknown>>;
  elements: Record<string, Record<string, unknown>>;
  modalities: Record<string, Record<string, unknown>>;
  houseSystems: Array<Record<string, unknown>>;
  chartTypes: ChartCatalogDefinition[];
}
