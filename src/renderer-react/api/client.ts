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
} from './contracts';

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

function validBirthData(value: unknown): value is BirthData {
  if (!isRecord(value) || !isRecord(value.location)) return false;
  const { year, month, day, hour, minute } = value;
  const integerInRange = (candidate: unknown, minimum: number, maximum: number) =>
    Number.isInteger(candidate) && Number(candidate) >= minimum && Number(candidate) <= maximum;
  if (!integerInRange(year, 1, 9999) || !integerInRange(month, 1, 12)
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
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id
    || typeof value.nameZh !== 'string'
    || typeof value.nameEn !== 'string'
    || typeof value.gender !== 'string' || !['male', 'female', 'other'].includes(value.gender)
    || !validBirthData(value.birthData)
    || typeof value.notes !== 'string'
    || !Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string')
    || !isCanonicalIsoInstant(value.createdAt)
    || !isCanonicalIsoInstant(value.updatedAt)) {
    throw new Error('档案数据无效');
  }
  return value as unknown as Profile;
}

export function parseLocationResolution(value: unknown): LocationResolution {
  const offsetMatch = isRecord(value) && typeof value.utcOffset === 'string'
    ? /^UTC([+-])(\d{2}):(\d{2})$/.exec(value.utcOffset)
    : null;
  const parsedOffset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : Number.NaN;
  if (!isRecord(value)
    || typeof value.timeZone !== 'string' || !value.timeZone
    || !Number.isInteger(value.offsetMinutes) || Math.abs(Number(value.offsetMinutes)) > 24 * 60
    || !offsetMatch || Number(offsetMatch[3]) > 59 || parsedOffset !== value.offsetMinutes
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
      const names = nameEn && nameZh && nameEn !== nameZh ? `${nameEn} / ${nameZh}` : nameEn || nameZh;
      const suffix = raw.country?.trim() ? ` (${raw.country.trim()})` : '';
      return [{ label: `${names}${suffix}`, name: nameEn || nameZh, latitude: raw.latitude, longitude: raw.longitude, source }];
    }

    const raw = entry as unknown as ChineseCityRaw;
    if (typeof raw.nameZh !== 'string' || !raw.nameZh.trim()
      || (raw.province !== undefined && typeof raw.province !== 'string')) throw new Error('城市数据无效');
    const province = raw.province?.trim();
    const name = raw.nameZh.trim();
    return [{ label: province ? `${name} (${province})` : name, name, latitude: raw.latitude, longitude: raw.longitude, source }];
  });
}

async function searchCities(query: string): Promise<CitySearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const [western, chinese] = await Promise.allSettled([
    invoke<unknown>((api) => api.searchCities(trimmed)).then((value) => parseCityArray(value, 'western')),
    invoke<unknown>((api) => api.chinese.searchCities(trimmed)).then((value) => parseCityArray(value, 'chinese')),
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
    const key = `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => (left.source === right.source ? 0 : left.source === 'western' ? -1 : 1)
    || left.label.localeCompare(right.label, 'en')
    || left.latitude - right.latitude
    || left.longitude - right.longitude);
}

export const apiClient = {
  getConfig: (): Promise<AppConfig> => invoke((api) => api.getConfig()),
  getLocale: (): Promise<LocaleDictionary> => invoke((api) => api.getLocale()),
  getAiStatus: async (): Promise<AiStatus> =>
    parseAiStatus(await invoke<unknown>((api) => api.ai.status())),
  profiles: {
    list: async (): Promise<Profile[]> => {
      const value = await invoke<unknown>((api) => api.profiles.list());
      if (!Array.isArray(value)) throw new Error('档案数据无效');
      return value.map(parseProfile);
    },
    get: async (id: string): Promise<Profile | null> => {
      const value = await invoke<unknown>((api) => api.profiles.get(id));
      return value === null ? null : parseProfile(value);
    },
    save: async (profile: ProfileSaveInput): Promise<Profile> =>
      parseProfile(await invoke<unknown>((api) => api.profiles.save(profile))),
    remove: async (id: string): Promise<boolean> => {
      const value = await invoke<unknown>((api) => api.profiles.remove(id));
      if (typeof value !== 'boolean') throw new Error('档案删除结果无效');
      return value;
    },
  },
  searchCities,
  locations: {
    resolve: async (input: ResolveLocationInput): Promise<LocationResolution> =>
      parseLocationResolution(await invoke<unknown>((api) => api.locations.resolve(input))),
  },
  app: {
    onCloseRequested: (callback: () => void): (() => void) => window.mystApi.app.onCloseRequested(callback),
    decideClose: async (decision: CloseDecision): Promise<void> => {
      await invoke<unknown>((api) => api.app.decideClose(decision));
    },
  },
};
