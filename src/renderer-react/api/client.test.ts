import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiClient, parseAiStatus, parseLocationResolution, parseProfile, unwrap } from './client';
import type { IpcResult } from './contracts';

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
    profiles: {
      list: () => ok([]), get: () => ok(null), save: (value) => ok({ ...profile, ...value }), remove: () => ok(false),
    },
    searchCities: () => ok([]),
    chinese: { searchCities: () => ok([]) },
    locations: { resolve: () => ok({ timeZone: 'UTC', offsetMinutes: 0, utcOffset: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' }) },
    app: { onCloseRequested: () => () => {}, decideClose: () => ok(undefined) },
    ai: {
      status: () => ok({ configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 }),
      initStatus: () => ok(null), onStatusChanged: () => () => {}, onInitProgress: () => () => {},
    },
    ...overrides,
  };
  window.mystApi = api;
  return api;
}

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
  window.mystApi = {
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
      onStatusChanged: () => () => {},
      onInitProgress: () => () => {},
    },
  };

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

    await expect(apiClient.profiles.list()).resolves.toEqual([profile]);
    await expect(apiClient.profiles.get('profile-1')).resolves.toEqual(profile);
    await expect(apiClient.profiles.save(profile)).resolves.toEqual(profile);
    await expect(apiClient.profiles.remove('profile-1')).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith('profile-1');
    expect(save).toHaveBeenCalledWith(profile);
    expect(remove).toHaveBeenCalledWith('profile-1');
  });

  test.each([
    [{ ...profile, tags: ['ok', 2] }],
    [{ ...profile, createdAt: 'yesterday' }],
    [{ ...profile, createdAt: '2025-02-30T00:00:00.000Z' }],
    [{ ...profile, gender: { toString: () => 'other' } }],
    [{ ...profile, birthData: { ...birthData, day: 32 } }],
    [{ ...profile, birthData: { ...birthData, location: { ...birthData.location, latitude: 100 } } }],
  ])('rejects malformed successful profile payload %#', (value) => {
    expect(() => parseProfile(value)).toThrow('档案数据无效');
  });

  test('rejects malformed successful profile lists and nullable get payloads correctly', async () => {
    const api = installApi();
    api.profiles.list = () => ok([{ ...profile, tags: 'friend' }]);
    await expect(apiClient.profiles.list()).rejects.toThrow('档案数据无效');
    api.profiles.get = () => ok(null);
    await expect(apiClient.profiles.get('missing')).resolves.toBeNull();
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
      { label: 'Near New York / 近纽约 (US)', name: 'Near New York', latitude: 40.7133, longitude: -74.006, source: 'western' },
      { label: 'New York / 纽约 (US)', name: 'New York', latitude: 40.7128, longitude: -74.006, source: 'western' },
      { label: '阿尔巴尼 (纽约州)', name: '阿尔巴尼', latitude: 42.6526, longitude: -73.7562, source: 'chinese' },
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
    const resolve = vi.fn(() => ok({ timeZone: 'Asia/Shanghai', offsetMinutes: 480, utcOffset: 'UTC+08:00', instantUtc: '1990-01-15T06:30:00.000Z' }));
    installApi({ locations: { resolve } });
    const input = { ...birthData, latitude: birthData.location.latitude, longitude: birthData.location.longitude };
    Reflect.deleteProperty(input, 'location');
    await expect(apiClient.locations.resolve(input)).resolves.toMatchObject({ timeZone: 'Asia/Shanghai', offsetMinutes: 480 });
    expect(resolve).toHaveBeenCalledWith(input);
    expect(() => parseLocationResolution({ timeZone: 'UTC', offsetMinutes: Infinity, utcOffset: 'UTC+00:00', instantUtc: 'bad' }))
      .toThrow('时区解析数据无效');
    expect(() => parseLocationResolution({ timeZone: 'UTC', offsetMinutes: 60, utcOffset: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' }))
      .toThrow('时区解析数据无效');
  });

  test('forwards close subscription cleanup and strict decisions', async () => {
    const cleanup = vi.fn();
    const onCloseRequested = vi.fn(() => cleanup);
    const decideClose = vi.fn(() => ok(undefined));
    installApi({ app: { onCloseRequested, decideClose } });
    const callback = vi.fn();
    expect(apiClient.app.onCloseRequested(callback)).toBe(cleanup);
    await apiClient.app.decideClose('cancel');
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
  window.mystApi = {
    getConfig: async () => ({ ok: true, data: {} }),
    getLocale: async () => ({ ok: true, data: {} }),
    ai: {
      status: async () => ({ ok: true, data: { configured: true } }),
      initStatus: async () => ({ ok: true, data: null }),
      onStatusChanged: () => () => {},
      onInitProgress: () => () => {},
    },
  };

  await expect(apiClient.getAiStatus()).rejects.toThrow('AI 状态数据无效');
});
