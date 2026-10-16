export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DiagnosticInfo {
  enabled: boolean;
  directory: string;
  files: string[];
  maxFileBytes: number;
  maxFiles: number;
  lastError: string | null;
}

import type { ChartIdentity, ChartRequest, ChartRoute, ChartSettings, ChartType, NormalizedChartResult, Zodiac } from '../features/charts/contracts';

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
  maxTokensMode?: 'custom' | 'context';
  contextWindow?: number;
  maxOutputTokens?: number;
  knowledgeDocCount: number;
}

export interface AiCatalogProvider {
  key: string;
  label: string;
  catalogId: string | null;
  needsKey: boolean;
  modelCount: number;
}

export interface AiCatalogModel {
  id: string;
  name: string;
  limitContext: number;
  limitOutput: number;
  costInput: number;
  costOutput: number;
  releaseDate: string;
}

export interface AiToolProviderDescriptor {
  id: string;
  category: string;
  enabled: boolean;
  ready: boolean;
  configurableEnabled?: boolean;
  tools: Array<{ name: string; description: string; callLimit?: number }>;
}

export interface AiMcpInfo {
  servers: Record<string, {
    enabled?: boolean;
    transport?: string;
    command?: string;
    args?: string[];
    url?: string;
  }>;
  toolCount: number;
  connected: boolean;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  source: string;
  importedAt: string;
  cachedOnly?: boolean;
  packId?: string;
  packVersion?: string;
  corpus?: string;
  domain?: string;
}

export interface KnowledgePackInfo {
  id: string; version: string; name: string; description: string; corpora: string[]; documentCount: number;
  fingerprint: string; createdAt: string; installedAt: string; active: boolean; ready: boolean; error: string | null;
}
export interface KnowledgePackList { builtinEnabled: boolean; busy: boolean; legacyDocuments: number; packs: KnowledgePackInfo[] }
export interface KnowledgePackPreview { token: string; manifest: Pick<KnowledgePackInfo, 'id' | 'version' | 'name' | 'description' | 'corpora' | 'documentCount' | 'fingerprint' | 'createdAt'> }

export interface AiSessionSummary {
  id: string;
  title: string | null;
  messages: Array<{ role: string; content: string; attachments?: Array<{ name: string; content: string }>; toolCalls?: AiToolCall[]; analysisReport?: AnalysisReport }>;
  contextSummary?: { text: string; coveredMessages: number; prefixHash: string; createdAt: string };
  pinned?: boolean;
  forkedFrom?: { sessionId: string; messageIndex: number };
  mode?: 'chat' | 'research';
  createdAt?: string;
  updatedAt?: string;
}

export interface AiSavedConfiguration {
  id: string;
  name: string;
  settings: Omit<AiSettingsInput, 'apiKey'>;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AiConfigurationList { activeId: string | null; configurations: AiSavedConfiguration[] }
export interface AiConfigurationSaveInput { id?: string; name: string; settings: AiSettingsInput }

export interface AiToolCall {
  callId?: string;
  tool: string;
  status: 'calling' | 'done' | 'error';
  argsDigest: string;
  resultExcerpt: string;
  args?: string;
  result?: string;
  startedAt?: number;
  durationMs?: number;
  requiresConfirmation: boolean;
  artifact?: ToolArtifact;
}

export interface AiActivity {
  phase: 'preparing' | 'analysis' | 'validation' | 'answer';
  topic?: string;
  repair?: boolean;
}

export interface SourceSnapshot {
  blockId?: string; chapterPath?: string[]; contentType?: string; tags?: string[];
  previousBlockId?: string | null; nextBlockId?: string | null;
  id: string; documentId: string; version: string; title: string; content: string;
  fileName?: string; source: string; url?: string;
  location?: { lines?: { from: number; to: number }; basis?: 'prepared-text'; originalPageMapping?: 'unverified' } | null;
  pack?: { id: string; name: string; version: string; fingerprint: string };
  corpus?: string;
  provenance?: { sourceName?: string; sourceHash?: string | null; completedAt?: string | null };
  book?: { title?: string } | null;
}
export interface ToolArtifact {
  version: number; providerId?: string; tool?: string; kind: string; data: unknown;
  sources?: SourceSnapshot[]; facts?: Record<string, string>;
  search?: { provider: string; requestedProvider: string; fallback: boolean;
    attempts: Array<{ provider: string; endpoint: string; code: string; message: string }> };
}
export interface AnalysisReport {
  dialogueVersion?: number;
  knowledgeFingerprint?: string;
  task?: { version: number; startedAt: string; zone: string; time: { mode: string; dates: string[]; basis: string }; technical?: boolean };
  readiness?: { status: 'ready' | 'partial' | 'insufficient'; checkedAt: string; issues: Array<{ claimId: string; code: string; message: string }> };
  version: number; contextKey: string; focus: string; questions: string[]; sources: SourceSnapshot[];
  claims: Array<{ id: string; kind?: 'fact' | 'interpretation' | 'hypothesis' | 'reflection' | 'suggestion'; basis?: 'tool' | 'symbolic' | 'conversation' | 'mixed';
    statement: string; facts: Array<{ callId: string; key: string; text: string }>;
    sourceIds: string[]; limitations: string; question: string; support?: string;
    meaning?: string; userRefs?: Array<{ id: string; quote: string }>;
    alternatives?: Array<{ explanation: string; distinction: string }>;
    whatWouldChange?: string[];
    responseOptions?: Array<{ action: string; when: string; tradeoff: string; wording: string }>;
    checks?: Array<{ category?: 'data' | 'applicability' | 'reality'; condition: string; status: string; factRefs: string[]; sourceIds: string[]; userRefs?: Array<{ id: string; quote: string }> }> }>;
}
export interface ContextUsage {
  used: number; limit: number; percent: number | null; reserve: number; safety: number;
  estimated: boolean; needsCompression: boolean; compressedMessages?: number;
}
export interface ContextEvent {
  sessionId: string; usage?: ContextUsage; compression?: 'running' | 'done' | 'error'; message?: string;
}

export interface AiSettingsInput {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  maxTokensMode?: 'custom' | 'context';
  contextWindow?: number;
  maxOutputTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}

export type AiInitProgress =
  | { phase: 'preparing'; total?: number }
  | { phase: 'model'; percent?: number; file?: string }
  | { phase: 'indexing'; done: number; total: number }
  | { phase: 'ready'; docs: number; chunks?: number; fromCache?: boolean }
  | { phase: 'error'; message: string };

export interface WesternChartAiContext {
  kind: 'western-chart';
  route: ChartRoute;
  resultId: string;
  chartType: ChartType;
  activeProfile: { id: string; displayName: string } | null;
  successfulFilters: {
    type: ChartType;
    primary: { id: string; displayName: string };
    secondary: { id: string; displayName: string } | null;
    settings: ChartSettings;
    options: ChartRequest['options'];
  };
  lastChartData: NormalizedChartResult;
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
  selectedRows?: Array<{
    id: string;
    values: Record<string, string | number | boolean | null>;
  }>;
}

export interface ChineseChartAiContext {
  kind: 'chinese-chart'; route: 'chinese'; chartType: 'bazi'; resultId: string | null;
  activeProfile: Pick<Profile, 'id' | 'nameZh' | 'nameEn' | 'gender' | 'birthData'> & { displayName: string };
  lastBaziData: import('../features/chinese/contracts').BaziResult | null;
}
export type WorkspaceAiContext = WesternChartAiContext | ChineseChartAiContext;
