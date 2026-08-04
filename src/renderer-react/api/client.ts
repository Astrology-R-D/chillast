import type {
  AiStatus,
  AppConfig,
  BirthData,
  ChineseCityRaw,
  CitySearchResult,
  CloseDecision,
  IpcResult,
  LocaleDictionary,
  LocationResolution,
  Profile,
  ProfileSaveInput,
  ResolveLocationInput,
  WesternCityRaw,
  WesternChartAiContext,
} from './contracts';
import { assertCatalogMatchesDescriptors } from '../features/charts/catalog';
import type {
  ChartCatalogDefinition,
  ChartReferenceData,
  ChartRequest,
  NormalizedChartResult,
} from '../features/charts/contracts';
import { normalizeChartResult } from '../features/charts/normalizeChartResult';
import {
  chartReferenceDataSchema,
  chartCatalogDefinitionSchema,
  parseChartReferenceData,
} from '../features/charts/schemas';
import { z } from 'zod';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCanonicalIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function foldProfileTag(value: string): string {
  return Array.from(value, (character) =>
    character === '\u0131' ? character : character.toUpperCase().toLowerCase()).join('');
}

function validBirthData(value: unknown): value is BirthData {
  if (!isRecord(value) || !isRecord(value.location)) return false;
  const { year, month, day, hour, minute } = value;
  const integerInRange = (candidate: unknown, minimum: number, maximum: number) =>
    Number.isInteger(candidate) && Number(candidate) >= minimum && Number(candidate) <= maximum;
  if (!integerInRange(year, 1, 3000) || !integerInRange(month, 1, 12)
    || !integerInRange(day, 1, 31) || !integerInRange(hour, 0, 23)
    || !integerInRange(minute, 0, 59)) return false;
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const location = value.location;
  return Number(day) <= days[Number(month) - 1]
    && typeof location.label === 'string' && location.label.trim().length > 0
    && isFiniteNumber(location.latitude) && location.latitude >= -90 && location.latitude <= 90
    && isFiniteNumber(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
}

export function parseProfile(value: unknown): Profile {
  const validTags = isRecord(value) && Array.isArray(value.tags)
    && value.tags.length <= 20
    && value.tags.every((tag) => typeof tag === 'string'
      && tag.length > 0
      && tag === tag.trim()
      && tag === tag.normalize('NFC')
      && Array.from(tag).length <= 32)
    && new Set(value.tags.map((tag) => foldProfileTag(String(tag)))).size === value.tags.length;
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id
    || typeof value.nameZh !== 'string'
    || typeof value.nameEn !== 'string'
    || typeof value.gender !== 'string' || !['male', 'female', 'other'].includes(value.gender)
    || !validBirthData(value.birthData)
    || typeof value.notes !== 'string'
    || !validTags
    || !isCanonicalIsoInstant(value.createdAt)
    || !isCanonicalIsoInstant(value.updatedAt)) {
    throw new Error('档案数据无效');
  }
  return value as unknown as Profile;
}

export function parseLocationResolution(value: unknown): LocationResolution {
  const offsetMatch = isRecord(value) && typeof value.utcOffsetLabel === 'string'
    ? /^UTC([+-])(\d{2}):(\d{2})$/.exec(value.utcOffsetLabel)
    : null;
  const parsedOffset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : Number.NaN;
  if (!isRecord(value)
    || typeof value.timeZone !== 'string' || !value.timeZone
    || !Number.isInteger(value.utcOffsetMinutes) || Math.abs(Number(value.utcOffsetMinutes)) > 24 * 60
    || !offsetMatch || Number(offsetMatch[3]) > 59 || parsedOffset !== value.utcOffsetMinutes
    || !isCanonicalIsoInstant(value.instantUtc)) {
    throw new Error('时区解析数据无效');
  }
  return value as unknown as LocationResolution;
}

export function parseAiStatus(value: unknown): AiStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI 状态数据无效');
  }

  const status = value as Record<string, unknown>;
  const optionalNumberIsValid = (field: string) =>
    status[field] === undefined
    || (typeof status[field] === 'number' && Number.isFinite(status[field]));
  if (
    typeof status.configured !== 'boolean'
    || typeof status.provider !== 'string'
    || typeof status.model !== 'string'
    || typeof status.baseUrl !== 'string'
    || typeof status.knowledgeDocCount !== 'number'
    || !Number.isFinite(status.knowledgeDocCount)
    || status.knowledgeDocCount < 0
    || !optionalNumberIsValid('temperature')
    || !optionalNumberIsValid('maxTokens')
  ) {
    throw new Error('AI 状态数据无效');
  }

  return {
    configured: status.configured,
    provider: status.provider,
    model: status.model,
    baseUrl: status.baseUrl,
    temperature: status.temperature,
    maxTokens: status.maxTokens,
    knowledgeDocCount: status.knowledgeDocCount,
  } as AiStatus;
}

export function unwrap<T>(result: unknown): T {
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error('未知错误');
  }

  if (result.ok === true && 'data' in result) {
    return result.data as T;
  }

  if (result.ok === false) {
    const error = 'error' in result && typeof result.error === 'string' ? result.error : '';
    throw new Error(error || '未知错误');
  }

  throw new Error('未知错误');
}

async function invoke<T>(request: (api: MystApi) => Promise<IpcResult<T>>): Promise<T> {
  return unwrap<T>(await request(window.mystApi));
}

export type ChartBoundaryFailureKind = 'ipc' | 'domain' | 'parser';

export class ChartBoundaryError extends Error {
  constructor(readonly kind: ChartBoundaryFailureKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChartBoundaryError';
  }
}

const chartIpcEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }).strict(),
  z.object({ ok: z.literal(false), error: z.string() }).strict(),
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function chartBoundary<T>(
  request: (api: MystApi) => Promise<IpcResult<unknown>>,
  parse: (value: unknown) => T,
): Promise<T> {
  let envelope: unknown;
  try {
    envelope = await request(window.mystApi);
  } catch (error) {
    throw new ChartBoundaryError('ipc', errorMessage(error), { cause: error });
  }

  const prototype = envelope && typeof envelope === 'object' ? Object.getPrototypeOf(envelope) : undefined;
  const parsedEnvelope = (prototype === Object.prototype || prototype === null)
    ? chartIpcEnvelopeSchema.safeParse(envelope)
    : { success: false as const };
  if (!parsedEnvelope.success
    || !Object.hasOwn(envelope as object, 'ok')
    || (parsedEnvelope.data.ok
      ? !Object.hasOwn(envelope as object, 'data')
      : !Object.hasOwn(envelope as object, 'error'))) {
    const cause = new Error('Malformed IPC envelope');
    throw new ChartBoundaryError('parser', cause.message, { cause });
  }
  if (parsedEnvelope.data.ok === false) {
    const cause = new Error(parsedEnvelope.data.error);
    throw new ChartBoundaryError('domain', cause.message, { cause });
  }

  try {
    return parse(parsedEnvelope.data.data);
  } catch (error) {
    throw new ChartBoundaryError('parser', errorMessage(error), { cause: error });
  }
}

function parseCityArray(value: unknown, source: 'western' | 'chinese'): CitySearchResult[] {
  if (!Array.isArray(value)) throw new Error('城市数据无效');
  return value.flatMap((entry): CitySearchResult[] => {
    if (!isRecord(entry)
      || !isFiniteNumber(entry.latitude) || !isFiniteNumber(entry.longitude)) {
      throw new Error('城市数据无效');
    }
    if (entry.latitude < -90 || entry.latitude > 90 || entry.longitude < -180 || entry.longitude > 180) return [];

    if (source === 'western') {
      const raw = entry as unknown as WesternCityRaw;
      if ((raw.nameEn !== undefined && typeof raw.nameEn !== 'string')
        || (raw.nameZh !== undefined && typeof raw.nameZh !== 'string')
        || (raw.country !== undefined && typeof raw.country !== 'string')) throw new Error('城市数据无效');
      const nameEn = raw.nameEn?.trim() || '';
      const nameZh = raw.nameZh?.trim() || '';
      if (!nameEn && !nameZh) throw new Error('城市数据无效');
      return [{
        key: `${raw.latitude.toFixed(4)}:${raw.longitude.toFixed(4)}`,
        label: [nameZh, nameEn].filter(Boolean).join(' / '),
        nameZh,
        nameEn,
        region: '',
        country: raw.country?.trim() || '',
        latitude: raw.latitude,
        longitude: raw.longitude,
        source,
      }];
    }

    const raw = entry as unknown as ChineseCityRaw;
    if (typeof raw.nameZh !== 'string' || !raw.nameZh.trim()
      || (raw.province !== undefined && typeof raw.province !== 'string')) throw new Error('城市数据无效');
    const province = raw.province?.trim();
    const nameZh = raw.nameZh.trim();
    return [{
      key: `${raw.latitude.toFixed(4)}:${raw.longitude.toFixed(4)}`,
      label: province ? `${nameZh}, ${province}` : nameZh,
      nameZh,
      nameEn: '',
      region: province || '',
      country: 'CN',
      latitude: raw.latitude,
      longitude: raw.longitude,
      source,
    }];
  });
}

async function searchCities(query: string): Promise<CitySearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const [western, chinese] = await Promise.allSettled([
    invoke<unknown[]>((api) => api.searchCities(trimmed)).then((value) => parseCityArray(value, 'western')),
    invoke<unknown[]>((api) => api.chinese.searchCities(trimmed)).then((value) => parseCityArray(value, 'chinese')),
  ]);
  if (western.status === 'rejected' && chinese.status === 'rejected') {
    const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);
    throw new Error(`城市搜索失败：${message(western.reason)}；${message(chinese.reason)}`);
  }
  const combined = [
    ...(western.status === 'fulfilled' ? western.value : []),
    ...(chinese.status === 'fulfilled' ? chinese.value : []),
  ];
  const seen = new Set<string>();
  return combined.filter((city) => {
    if (seen.has(city.key)) return false;
    seen.add(city.key);
    return true;
  }).sort((left, right) => (left.source === right.source ? 0 : left.source === 'western' ? -1 : 1)
    || left.label.localeCompare(right.label, 'en')
    || left.latitude - right.latitude
    || left.longitude - right.longitude);
}

export const apiClient = {
  getConfig: (): Promise<AppConfig> => invoke((api) => api.getConfig()),
  getLocale: (): Promise<LocaleDictionary> => invoke((api) => api.getLocale()),
  getChartCatalog: (): Promise<ChartCatalogDefinition[]> => chartBoundary(
    (api) => api.getChartTypes(),
    (value) => {
      const catalog = z.array(chartCatalogDefinitionSchema).parse(value) as ChartCatalogDefinition[];
      assertCatalogMatchesDescriptors(catalog);
      return catalog;
    },
  ),
  getChartReference: (): Promise<ChartReferenceData> => chartBoundary(
    (api) => api.getReferenceData(),
    (value) => {
      chartReferenceDataSchema.parse(value);
      const reference = parseChartReferenceData(value);
      assertCatalogMatchesDescriptors(reference.chartTypes);
      return reference;
    },
  ),
  computeChart: (request: ChartRequest): Promise<NormalizedChartResult> => chartBoundary(
    (api) => api.computeChart(request),
    normalizeChartResult,
  ),
  getAiStatus: async (): Promise<AiStatus> =>
    parseAiStatus(await invoke<unknown>((api) => api.ai.status())),
  setAiChartContext: (context: WesternChartAiContext | null): Promise<unknown> =>
    invoke<unknown>((api) => api.ai.setContext(context)),
  listProfiles: async (): Promise<Profile[]> => {
    const value = await invoke<Profile[]>((api) => api.profiles.list());
    if (!Array.isArray(value)) throw new Error('档案数据无效');
    return value.map(parseProfile);
  },
  getProfile: async (id: string): Promise<Profile | null> => {
    const value = await invoke<Profile | null>((api) => api.profiles.get(id));
    return value === null ? null : parseProfile(value);
  },
  saveProfile: async (profile: ProfileSaveInput): Promise<Profile> =>
    parseProfile(await invoke<Profile>((api) => api.profiles.save(profile))),
  removeProfile: async (id: string): Promise<boolean> => {
    const value = await invoke<boolean>((api) => api.profiles.remove(id));
    if (typeof value !== 'boolean') throw new Error('档案删除结果无效');
    return value;
  },
  searchCities,
  resolveLocation: async (input: ResolveLocationInput): Promise<LocationResolution> =>
    parseLocationResolution(await invoke<LocationResolution>((api) => api.locations.resolve(input))),
  onCloseRequested: (callback: () => void): (() => void) => window.mystApi.app.onCloseRequested(callback),
  decideClose: async (decision: CloseDecision): Promise<boolean> => {
    const value = await invoke<boolean>((api) => api.app.decideClose(decision));
    if (typeof value !== 'boolean') throw new Error('关闭决策结果无效');
    return value;
  },
};
