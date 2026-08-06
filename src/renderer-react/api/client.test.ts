import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  apiClient,
  ChartBoundaryError,
  parseAiStatus,
  parseLocationResolution,
  parseProfile,
  unwrap,
} from './client';
import { CHART_DESCRIPTORS } from '../features/charts/catalog';
import type {
  ChineseCityRaw, IpcResult, LocationResolution, Profile, ProfileSaveInput, ResolveLocationInput, WesternCityRaw,
} from './contracts';

const birthData = {
  year: 1990, month: 1, day: 15, hour: 14, minute: 30,
  location: { label: 'Beijing', latitude: 39.9042, longitude: 116.4074 },
};
const profile = {
  id: 'profile-1', nameZh: '测试', nameEn: 'Test', gender: 'other' as const,
  birthData, notes: '', tags: ['friend'],
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
};

function ok<T>(data: T): Promise<IpcResult<T>> {
  return Promise.resolve({ ok: true, data });
}

function installApi(overrides: Partial<MystApi> = {}): MystApi {
  const api: MystApi = {
    getConfig: () => ok({}),
    getLocale: () => ok({}),
    getReferenceData: () => ok({}),
    getChartTypes: () => ok([]),
    computeChart: () => ok({}),
    profiles: {
      list: () => ok([]), get: () => ok(null), save: (value) => ok({ ...profile, ...value }), remove: () => ok(false),
    },
    searchCities: () => ok([]),
    chinese: { searchCities: () => ok([]) },
    locations: { resolve: () => ok({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' }) },
    app: { onCloseRequested: () => () => {}, decideClose: () => ok(false) },
    ai: {
      status: () => ok({ configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 }),
      initStatus: () => ok(null), setContext: () => ok(null), onStatusChanged: () => () => {}, onInitProgress: () => () => {},
    },
    ...overrides,
  };
  window.mystApi = api;
  return api;
}

function assertAmbientContract(api: MystApi, input: ProfileSaveInput, location: ResolveLocationInput) {
  const list: Promise<IpcResult<Profile[]>> = api.profiles.list();
  const get: Promise<IpcResult<Profile | null>> = api.profiles.get('id');
  const save: Promise<IpcResult<Profile>> = api.profiles.save(input);
  const remove: Promise<IpcResult<boolean>> = api.profiles.remove('id');
  const western: Promise<IpcResult<unknown[]>> = api.searchCities('x');
  const chinese: Promise<IpcResult<unknown[]>> = api.chinese.searchCities('x');
  const resolution: Promise<IpcResult<LocationResolution>> = api.locations.resolve(location);
  const close: Promise<IpcResult<boolean>> = api.app.decideClose('cancel');
  return { list, get, save, remove, western, chinese, resolution, close };
}
void assertAmbientContract;

const createInput: ProfileSaveInput = {
  nameZh: profile.nameZh, nameEn: profile.nameEn, gender: profile.gender,
  birthData: profile.birthData, notes: profile.notes, tags: profile.tags,
};
const editInput: ProfileSaveInput = profile;
const profileInputs = [createInput, editInput] satisfies ProfileSaveInput[];
const westernCity: WesternCityRaw = { nameZh: '北京', nameEn: 'Beijing', country: 'CN', latitude: 39.9, longitude: 116.4 };
const chineseCity: ChineseCityRaw = { nameZh: '北京', province: '北京', latitude: 39.9, longitude: 116.4 };
void [profileInputs, westernCity, chineseCity];

afterEach(() => {
  Reflect.deleteProperty(window, 'mystApi');
});

describe('unwrap', () => {
  test('returns data from a successful IPC envelope', () => {
    expect(unwrap({ ok: true, data: { locale: 'zh' } })).toEqual({ locale: 'zh' });
  });

  test('throws the IPC error from a failed envelope', () => {
    expect(() => unwrap({ ok: false, error: '配置加载失败' })).toThrow('配置加载失败');
  });

  test.each([null, undefined, {}, { ok: true }, { ok: false }, { ok: 'yes' }])(
    'throws the fallback error for malformed envelope %#',
    (value) => {
      expect(() => unwrap(value)).toThrow('未知错误');
    },
  );
});

test('accesses mystApi when a request is made rather than at module load', async () => {
  installApi({
    getConfig: async () => ({ ok: true, data: { locale: 'zh' } }),
    getLocale: async () => ({ ok: true, data: { common: { save: '保存' } } }),
    ai: {
      status: async () => ({
        ok: true,
        data: {
          configured: true,
          provider: 'openai',
          model: 'gpt-4o',
          baseUrl: '',
          knowledgeDocCount: 2,
        },
      }),
      initStatus: async () => ({ ok: true, data: null }),
      setContext: () => ok(null),
      onStatusChanged: () => () => {},
      onInitProgress: () => () => {},
    },
  });

  await expect(apiClient.getConfig()).resolves.toMatchObject({ locale: 'zh' });
  await expect(apiClient.getLocale()).resolves.toEqual({ common: { save: '保存' } });
  await expect(apiClient.getAiStatus()).resolves.toMatchObject({ configured: true });
});

test('validates AI status fields at the renderer boundary', () => {
  expect(parseAiStatus({
    configured: false,
    provider: '',
    model: '',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 4096,
    knowledgeDocCount: 0,
  })).toMatchObject({ configured: false, knowledgeDocCount: 0 });
});

describe('profile boundary', () => {
  test('forwards CRUD calls and validates returned profiles', async () => {
    const list = vi.fn(() => ok([profile]));
    const get = vi.fn(() => ok(profile));
    const save = vi.fn(() => ok(profile));
    const remove = vi.fn(() => ok(true));
    installApi({ profiles: { list, get, save, remove } });

    await expect(apiClient.listProfiles()).resolves.toEqual([profile]);
    await expect(apiClient.getProfile('profile-1')).resolves.toEqual(profile);
    await expect(apiClient.saveProfile(profile)).resolves.toEqual(profile);
    await expect(apiClient.removeProfile('profile-1')).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith('profile-1');
    expect(save).toHaveBeenCalledWith(profile);
    expect(remove).toHaveBeenCalledWith('profile-1');
  });

  test.each([
    [{ ...profile, tags: ['ok', 2] }],
    [{ ...profile, createdAt: 'yesterday' }],
    [{ ...profile, createdAt: '2025-02-30T00:00:00.000Z' }],
    [{ ...profile, gender: { toString: (): string => 'other' } }],
    [{ ...profile, birthData: { ...birthData, day: 32 } }],
    [{ ...profile, birthData: { ...birthData, year: 3001 } }],
    [{ ...profile, birthData: { ...birthData, location: { ...birthData.location, latitude: 100 } } }],
    [{ ...profile, tags: [' friend'] }],
    [{ ...profile, tags: ['Friend', 'friend'] }],
    [{ ...profile, tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`) }],
  ])('rejects malformed successful profile payload %#', (value) => {
    expect(() => parseProfile(value)).toThrow('档案数据无效');
  });

  test('accepts normalized tags that Unicode default folding keeps distinct', () => {
    expect(parseProfile({ ...profile, tags: ['i', 'ı'] }).tags).toEqual(['i', 'ı']);
  });

  test('rejects malformed successful profile lists and nullable get payloads correctly', async () => {
    const api = installApi();
    api.profiles.list = () => ok([{ ...profile, tags: 'friend' } as unknown as Profile]);
    await expect(apiClient.listProfiles()).rejects.toThrow('档案数据无效');
    api.profiles.get = () => ok(null);
    await expect(apiClient.getProfile('missing')).resolves.toBeNull();
  });
});

describe('city search', () => {
  test('merges, normalizes, dedupes at four decimals with western priority, and sorts', async () => {
    const western = vi.fn(() => ok([
      { nameZh: '纽约', nameEn: 'New York', country: 'US', latitude: 40.7128, longitude: -74.006 },
      { nameZh: '近纽约', nameEn: 'Near New York', country: 'US', latitude: 40.7133, longitude: -74.006 },
    ]));
    const chinese = vi.fn(() => ok([
      { nameZh: '纽约市', province: '美国', latitude: 40.71281, longitude: -74.00601 },
      { nameZh: '阿尔巴尼', province: '纽约州', latitude: 42.6526, longitude: -73.7562 },
    ]));
    installApi({ searchCities: western, chinese: { searchCities: chinese } });

    await expect(apiClient.searchCities('  纽约  ')).resolves.toEqual([
      { key: '40.7128:-74.0060', label: '纽约 / New York', nameZh: '纽约', nameEn: 'New York', region: '', country: 'US', latitude: 40.7128, longitude: -74.006, source: 'western' },
      { key: '40.7133:-74.0060', label: '近纽约 / Near New York', nameZh: '近纽约', nameEn: 'Near New York', region: '', country: 'US', latitude: 40.7133, longitude: -74.006, source: 'western' },
      { key: '42.6526:-73.7562', label: '阿尔巴尼, 纽约州', nameZh: '阿尔巴尼', nameEn: '', region: '纽约州', country: 'CN', latitude: 42.6526, longitude: -73.7562, source: 'chinese' },
    ]);
    expect(western).toHaveBeenCalledWith('纽约');
    expect(chinese).toHaveBeenCalledWith('纽约');
  });

  test('does not invoke either city source for an empty trimmed query', async () => {
    const western = vi.fn(() => ok([]));
    const chinese = vi.fn(() => ok([]));
    installApi({ searchCities: western, chinese: { searchCities: chinese } });
    await expect(apiClient.searchCities('   ')).resolves.toEqual([]);
    expect(western).not.toHaveBeenCalled();
    expect(chinese).not.toHaveBeenCalled();
  });

  test('uses the successful source when one city source fails and throws when both fail', async () => {
    installApi({
      searchCities: () => Promise.resolve({ ok: false, error: 'western unavailable' }),
      chinese: { searchCities: () => ok([{ nameZh: '北京', province: '北京', latitude: 39.9042, longitude: 116.4074 }]) },
    });
    await expect(apiClient.searchCities('北京')).resolves.toHaveLength(1);

    installApi({
      searchCities: () => Promise.resolve({ ok: false, error: 'western unavailable' }),
      chinese: { searchCities: () => Promise.resolve({ ok: false, error: 'chinese unavailable' }) },
    });
    await expect(apiClient.searchCities('x')).rejects.toThrow(/western unavailable.*chinese unavailable/i);
  });

  test('rejects malformed successful city payloads and discards out-of-bounds entries', async () => {
    installApi({
      searchCities: () => ok([{ nameEn: 4, latitude: 1, longitude: 2 }]),
      chinese: { searchCities: () => ok([{ province: 'missing name', latitude: 1, longitude: 2 }]) },
    });
    await expect(apiClient.searchCities('x')).rejects.toThrow('城市数据无效');
    installApi({
      searchCities: () => ok([{ nameEn: 'Invalid', latitude: 91, longitude: 2 }]),
      chinese: { searchCities: () => ok([]) },
    });
    await expect(apiClient.searchCities('x')).resolves.toEqual([]);
  });
});

describe('location and close lifecycle', () => {
  test('validates location resolutions and forwards requests', async () => {
    const resolve = vi.fn(() => ok({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '1990-01-15T06:30:00.000Z' }));
    installApi({ locations: { resolve } });
    const input = { ...birthData, latitude: birthData.location.latitude, longitude: birthData.location.longitude };
    Reflect.deleteProperty(input, 'location');
    await expect(apiClient.resolveLocation(input)).resolves.toMatchObject({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480 });
    expect(resolve).toHaveBeenCalledWith(input);
    expect(() => parseLocationResolution({ timeZone: 'UTC', utcOffsetMinutes: Infinity, utcOffsetLabel: 'UTC+00:00', instantUtc: 'bad' }))
      .toThrow('时区解析数据无效');
    expect(() => parseLocationResolution({ timeZone: 'UTC', utcOffsetMinutes: 60, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' }))
      .toThrow('时区解析数据无效');
  });

  test('forwards close subscription cleanup and strict decisions', async () => {
    const cleanup = vi.fn();
    const onCloseRequested = vi.fn(() => cleanup);
    const decideClose = vi.fn(() => ok(false));
    installApi({ app: { onCloseRequested, decideClose } });
    const callback = vi.fn();
    expect(apiClient.onCloseRequested(callback)).toBe(cleanup);
    await expect(apiClient.decideClose('cancel')).resolves.toBe(false);
    expect(onCloseRequested).toHaveBeenCalledWith(callback);
    expect(decideClose).toHaveBeenCalledWith('cancel');
  });
});

test.each([
  null,
  {},
  { configured: 'yes', provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 },
  { configured: false, provider: null, model: '', baseUrl: '', knowledgeDocCount: 0 },
  { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: -1 },
  { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: Number.NaN },
  { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0, temperature: 'warm' },
  { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0, maxTokens: Infinity },
])('rejects malformed AI status %#', (status) => {
  expect(() => parseAiStatus(status)).toThrow('AI 状态数据无效');
});

test('getAiStatus rejects malformed successful IPC data', async () => {
  installApi({
    getConfig: async () => ({ ok: true, data: {} }),
    getLocale: async () => ({ ok: true, data: {} }),
    ai: {
      status: async () => ({ ok: true, data: { configured: true } }),
      initStatus: async () => ({ ok: true, data: null }),
      setContext: () => ok(null),
      onStatusChanged: () => () => {},
      onInitProgress: () => () => {},
    },
  });

  await expect(apiClient.getAiStatus()).rejects.toThrow('AI 状态数据无效');
});

const chartCatalog = Object.entries(CHART_DESCRIPTORS).map(([type, descriptor]) => ({
  type,
  nameZh: type,
  nameEn: type,
  category: descriptor.route,
  requiresSecondary: descriptor.requiresSecondary,
  options: [...descriptor.serviceOptions],
}));

function rawChartResult() {
  const point = {
    key: 'sun', kind: 'body', glyph: 'S', nameEn: 'Sun', nameZh: 'Sun', longitude: 10,
    signKey: 'aries', signGlyph: 'A', signNameZh: 'Aries', signIndex: 0, degreeInSign: 10,
    dms: { degrees: 10, minutes: 0, seconds: 0 }, retrograde: false, house: 1,
  };
  return {
    meta: {
      type: 'natal', typeNameZh: 'Natal', title: 'Natal', subtitle: 'Natal',
      settings: { houseSystem: 'placidus', zodiac: 'tropical' },
      generatedAt: '2026-01-01T00:00:00.000Z', instantUtc: '2000-01-01T00:00:00.000Z',
    },
    subjects: [],
    houses: [],
    angles: {},
    rings: [{ id: 'natal', role: 'primary', label: 'Natal', points: [point] }],
    aspects: [],
    distributions: {
      elements: { fire: 1, earth: 0, air: 0, water: 0 },
      modalities: { cardinal: 1, fixed: 0, mutable: 0 },
    },
  };
}

describe('chart API boundary', () => {
  test('parses chart catalog and normalized compute results', async () => {
    installApi({
      getChartTypes: () => ok(chartCatalog),
      computeChart: () => ok(rawChartResult()),
    });

    await expect(apiClient.getChartCatalog()).resolves.toHaveLength(20);
    await expect(apiClient.computeChart({} as never)).resolves.toMatchObject({
      resultId: 'natal:2026-01-01T00:00:00.000Z:natal',
      identities: ['ring:natal', 'natal:sun'],
    });
  });

  test.each([
    ['ipc', () => Promise.reject(new Error('transport unavailable')), 'ipc'],
    ['domain', () => Promise.resolve({ ok: false as const, error: 'domain rejected' }), 'domain'],
    ['malformed envelope', () => Promise.resolve({ bad: true } as never), 'parser'],
    ['malformed domain envelope', () => Promise.resolve({ ok: false } as never), 'parser'],
  ])('classifies %s failures', async (_label, getChartTypes, kind) => {
    installApi({ getChartTypes });
    const error = await apiClient.getChartCatalog().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ChartBoundaryError);
    expect(error).toMatchObject({ kind });
    expect((error as Error & { cause?: unknown }).cause).toBeTruthy();
  });

  test.each([
    ['inherited success fields', () => Object.create({ ok: true, data: chartCatalog })],
    ['inherited success data', () => Object.assign(Object.create({ data: chartCatalog }), { ok: true })],
    ['extra error on success', () => ({ ok: true, data: chartCatalog, error: 'opposite branch' })],
    ['extra data on failure', () => ({ ok: false, error: 'domain rejected', data: chartCatalog })],
  ])('rejects %s as a parser failure', async (_label, makeEnvelope) => {
    installApi({ getChartTypes: () => Promise.resolve(makeEnvelope() as never) });
    await expect(apiClient.getChartCatalog()).rejects.toMatchObject({ kind: 'parser' });
  });

  test('rejects unknown catalog tokens as parser failures', async () => {
    installApi({ getChartTypes: () => ok([{ ...chartCatalog[0], type: 'unknown' }]) });
    await expect(apiClient.getChartCatalog()).rejects.toMatchObject({ kind: 'parser' });
  });

  test.each([
    ['non-finite point', () => {
      const result = rawChartResult();
      result.rings[0].points[0].longitude = Number.NaN;
      return result;
    }],
    ['duplicate ring', () => {
      const result = rawChartResult();
      result.rings.push({ ...result.rings[0] });
      return result;
    }],
  ])('rejects %s result data as a parser failure', async (_label, makeResult) => {
    installApi({ computeChart: () => ok(makeResult()) });
    await expect(apiClient.computeChart({} as never)).rejects.toMatchObject({ kind: 'parser' });
  });
});

describe('AI chart context boundary', () => {
  test('forwards constructed context through the existing bridge and requires a successful data envelope', async () => {
    const api = installApi();
    const context = {
      kind: 'western-chart', route: 'personal', resultId: 'result-a', chartType: 'natal', activeProfile: null,
      successfulFilters: {} as never, lastChartData: {} as never, focusedIdentity: null,
      draftIsStale: false, draftSummary: null,
    } as unknown as import('./contracts').WesternChartAiContext;
    const setContext = vi.fn(() => ok({ accepted: true }));
    api.ai.setContext = setContext;
    await expect(apiClient.setAiChartContext(context)).resolves.toEqual({ accepted: true });
    expect(setContext).toHaveBeenCalledWith(context);
    api.ai.setContext = () => Promise.resolve({ ok: true } as never);
    await expect(apiClient.setAiChartContext(null)).rejects.toThrow('未知错误');
  });
});
