import { afterEach, describe, expect, test } from 'vitest';
import { apiClient, unwrap } from './client';

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
      onStatusChanged: () => ({}),
      onInitProgress: () => ({}),
    },
  };

  await expect(apiClient.getConfig()).resolves.toMatchObject({ locale: 'zh' });
  await expect(apiClient.getLocale()).resolves.toEqual({ common: { save: '保存' } });
  await expect(apiClient.getAiStatus()).resolves.toMatchObject({ configured: true });
});
