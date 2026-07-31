export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
