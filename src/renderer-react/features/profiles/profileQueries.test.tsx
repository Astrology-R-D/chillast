import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import type { Profile } from '../../api/contracts';
import { profileQueryKeys, useProfiles, useRemoveProfile, useSaveProfile } from './profileQueries';

const profile: Profile = {
  id: 'p1', nameZh: '林岚', nameEn: 'Lan Lin', gender: 'female',
  birthData: { year: 1991, month: 2, day: 3, hour: 4, minute: 5, location: { label: '上海', latitude: 31.23, longitude: 121.47 } },
  notes: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

test('uses the single profiles key and awaits an active refetch after save and remove', async () => {
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [profile] })
    .mockResolvedValueOnce({ ok: true, data: [{ ...profile, updatedAt: '2026-02-01T00:00:00.000Z' }] })
    .mockResolvedValueOnce({ ok: true, data: [] });
  vi.stubGlobal('mystApi', {
    profiles: {
      list,
      save: vi.fn().mockResolvedValue({ ok: true, data: profile }),
      remove: vi.fn().mockResolvedValue({ ok: true, data: true }),
    },
  });
  const { client, wrapper } = setup();
  const query = renderHook(() => useProfiles(), { wrapper });
  const save = renderHook(() => useSaveProfile(), { wrapper });
  const remove = renderHook(() => useRemoveProfile(), { wrapper });
  await waitFor(() => expect(query.result.current.isSuccess).toBe(true));

  await save.result.current.mutateAsync({ ...profile });
  expect(list).toHaveBeenCalledTimes(2);
  expect(client.getQueryData<Profile[]>(['profiles'])?.[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
  await remove.result.current.mutateAsync('p1');
  expect(list).toHaveBeenCalledTimes(3);
  expect(client.getQueryData(['profiles'])).toEqual([]);
  expect(profileQueryKeys.all).toEqual(['profiles']);
});

test('retains mutation errors without changing the profile cache optimistically', async () => {
  vi.stubGlobal('mystApi', {
    profiles: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [profile] }),
      save: vi.fn().mockResolvedValue({ ok: false, error: '保存失败' }),
      remove: vi.fn().mockResolvedValue({ ok: false, error: '删除失败' }),
    },
  });
  const { client, wrapper } = setup();
  const query = renderHook(() => useProfiles(), { wrapper });
  const save = renderHook(() => useSaveProfile(), { wrapper });
  await waitFor(() => expect(query.result.current.isSuccess).toBe(true));

  await expect(save.result.current.mutateAsync({ ...profile, nameZh: '改名' })).rejects.toThrow('保存失败');
  await waitFor(() => expect(save.result.current.error).toEqual(new Error('保存失败')));
  expect(client.getQueryData(['profiles'])).toEqual([profile]);
});
