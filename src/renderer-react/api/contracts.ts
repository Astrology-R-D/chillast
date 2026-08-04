export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

import type { ChartIdentity, ChartSubject, ChartType, NormalizedChartResult, Zodiac } from '../features/charts/contracts';
import type { SubmittedChartSnapshot } from '../features/charts/workbench/chartDraft';

export type Gender = 'male' | 'female' | 'other';
export type CloseDecision = 'proceed' | 'cancel';

export interface GeoLocation {
  label: string;
  latitude: number;
  longitude: number;
}

export interface BirthData {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  location: GeoLocation;
}

export interface Profile {
  id: string;
  nameZh: string;
  nameEn: string;
  gender: Gender;
  birthData: BirthData;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ProfileSaveInput = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>
  & Partial<Pick<Profile, 'id' | 'createdAt' | 'updatedAt'>>;

export interface WesternCityRaw {
  nameZh?: string;
  nameEn?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface ChineseCityRaw {
  nameZh: string;
  province?: string;
  latitude: number;
  longitude: number;
}

export interface CitySearchResult {
  key: string;
  label: string;
  nameZh: string;
  nameEn: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  source: 'western' | 'chinese';
}

export interface ResolveLocationInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  latitude: number;
  longitude: number;
}

export interface LocationResolution {
  timeZone: string;
  utcOffsetMinutes: number;
  utcOffsetLabel: string;
  instantUtc: string;
}

export type LocaleDictionary = {
  [key: string]: string | LocaleDictionary;
};

export type ConfigValue = string | number | boolean | null | ConfigValue[] | ConfigObject;

export interface ConfigObject {
  [key: string]: ConfigValue | undefined;
}

export interface AppLayoutConfig extends ConfigObject {
  sidebarWidth?: number;
  chartCanvasMaxWidth?: number;
  headerHeight?: number;
  responsiveBreakpoint?: number;
  workbenchGridColumns?: string;
}

export interface AppWindowConfig extends ConfigObject {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  backgroundColor?: string;
}

export interface AppUiConfig extends ConfigObject {
  showBrandSub?: boolean;
  showHeaderChips?: boolean;
  showViewSubtitle?: boolean;
  aiGlyph?: string;
}

export interface ChartRadiiConfig extends ConfigObject {
  outerRim?: number;
  zodiacOuter?: number;
  zodiacInner?: number;
  houseOuter?: number;
  houseNumber?: number;
}

export interface PlanetRadiusConfig extends ConfigObject {
  single?: number;
  inner?: number;
  outer?: number;
}

export interface AppChartConfig extends ConfigObject {
  svgSize?: number;
  radii?: ChartRadiiConfig;
  planetRadius?: PlanetRadiusConfig;
  leaderLength?: number;
  planetColors?: Record<string, string>;
  aspectColors?: Record<string, string>;
  elementColors?: Record<string, string>;
}

export interface AppConfig extends ConfigObject {
  spacing?: Record<string, string>;
  type?: Record<string, string>;
  weight?: Record<string, number>;
  colors?: Record<string, string>;
  radii?: Record<string, string>;
  shadows?: Record<string, string>;
  layout?: AppLayoutConfig;
  window?: AppWindowConfig;
  ui?: AppUiConfig;
  chart?: AppChartConfig;
  locale?: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
  knowledgeDocCount: number;
}

export type AiInitProgress =
  | { phase: 'preparing'; total?: number }
  | { phase: 'model'; percent?: number; file?: string }
  | { phase: 'indexing'; done: number; total: number }
  | { phase: 'ready'; docs: number; chunks?: number; fromCache?: boolean }
  | { phase: 'error'; message: string };

export interface WesternChartAiContext {
  kind: 'western-chart';
  resultId: string;
  chartType: ChartType;
  subjects: ChartSubject[];
  successfulFilters: SubmittedChartSnapshot;
  result: NormalizedChartResult;
  focusedIdentity: ChartIdentity | null;
  draftIsStale: boolean;
  draftSummary: null | {
    label: 'uncalculated';
    type: ChartType;
    houseSystem: string;
    zodiac: Zodiac;
    targetLocal?: string;
    returnYear?: number;
    relocationLabel?: string;
  };
  selectedRows?: Array<{ id: string; values: Record<string, string | number | boolean | null> }>;
}
