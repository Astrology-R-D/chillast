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

export const ELEMENT_KEYS = ['fire', 'earth', 'air', 'water'] as const;
export const MODALITY_KEYS = ['cardinal', 'fixed', 'mutable'] as const;

export type ChartType = typeof CHART_TYPES[number];
export type ElementKey = typeof ELEMENT_KEYS[number];
export type ModalityKey = typeof MODALITY_KEYS[number];
export type ChartRoute = 'personal' | 'relationship';
export type Zodiac = 'tropical' | 'sidereal';
export type AspectLevel = 'major' | 'minor';
export type ChartOptionName = 'targetDate' | 'year' | 'location';
export type DynamicControl = 'secondaryProfile' | 'targetDate' | 'returnYear' | 'relocationPlace';

export type RingIdentity = `ring:${string}`;
export type PointIdentity = `${string}:${string}`;
export type HouseIdentity = `house:${number}`;
export type AspectIdentity = `aspect:${string}:${string}:${string}:${string}:${string}`;
export type ChartIdentity = RingIdentity | PointIdentity | HouseIdentity | AspectIdentity;

export interface ChartCatalogDefinition {
  type: ChartType;
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
  id: PointIdentity;
  ringId: string;
  key: string;
  kind: 'body' | 'point';
  glyph: string;
  nameEn: string;
  nameZh: string;
  longitude: number;
  signKey: string;
  signGlyph: string;
  signNameZh: string;
  signIndex: number;
  degreeInSign: number;
  dms: { degrees: number; minutes: number; seconds: number };
  retrograde: boolean;
  house: number | null;
}

export interface ChartRing {
  id: string;
  identity: RingIdentity;
  role: string;
  label: string;
  points: ChartPoint[];
}

export interface ChartHouse {
  id: HouseIdentity;
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
  dms: { degrees: number; minutes: number; seconds: number };
}

export interface ChartAspect {
  id: AspectIdentity;
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
  role: string;
  nameZh: string;
  nameEn: string;
  gender: string;
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
  instantUtc: string | null;
  [key: string]: unknown;
}

export interface ChartDistributions {
  elements: Record<ElementKey, number>;
  modalities: Record<ModalityKey, number>;
}

export interface NormalizedChartResult {
  resultId: string;
  identities: ChartIdentity[];
  meta: ChartMeta;
  subjects: ChartSubject[];
  houses: ChartHouse[];
  angles: Record<string, ChartAngle>;
  rings: ChartRing[];
  aspects: ChartAspect[];
  distributions: ChartDistributions;
}

export interface ChartSignReference {
  key: string;
  nameEn: string;
  nameZh: string;
  shortZh: string;
  glyph: string;
  element: ElementKey;
  modality: ModalityKey;
  ruler: string;
}

export interface ChartPointReference {
  nameEn: string;
  nameZh: string;
  glyph: string;
  kind: 'body' | 'point' | 'angle';
}

export interface ChartAspectReference {
  nameEn: string;
  nameZh: string;
  angle: number;
  defaultOrb: number;
  level: AspectLevel;
  glyph: string;
}

export interface ChartElementReference {
  nameEn: string;
  nameZh: string;
  token: string;
}

export interface ChartModalityReference {
  nameEn: string;
  nameZh: string;
}

export interface ChartHouseSystemReference {
  value: string;
  nameEn: string;
  nameZh: string;
}

export interface ChartReferenceData {
  signs: ChartSignReference[];
  points: Record<string, ChartPointReference>;
  aspects: Record<string, ChartAspectReference>;
  elements: Record<ElementKey, ChartElementReference>;
  modalities: Record<ModalityKey, ChartModalityReference>;
  houseSystems: ChartHouseSystemReference[];
  chartTypes: ChartCatalogDefinition[];
}
