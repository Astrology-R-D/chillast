import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { apiClient } from '../../api/client';
import type { CitySearchResult } from '../../api/contracts';
import { I18nProvider } from '../../i18n/I18nProvider';
import { emptyDraft, type ProfileDraft } from './profileForm';
import { LocationPicker } from './LocationPicker';

const beijing: CitySearchResult = { key: 'bj', label: '北京 / Beijing', nameZh: '北京', nameEn: 'Beijing', region: '', country: 'CN', latitude: 39.9, longitude: 116.4, source: 'western' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function Wrapper({ initial = {} }: { initial?: Partial<ProfileDraft> }) {
  const [draft, setDraft] = useState({ ...emptyDraft(), year: '2000', month: '1', day: '2', hour: '3', minute: '4', ...initial });
  return <I18nProvider dictionary={locale}><LocationPicker draft={draft} onChange={(patch) => setDraft((value) => ({ ...value, ...patch }))} /></I18nProvider>;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('debounces search, suppresses stale success and failure, and supports keyboard selection', async () => {
  vi.useFakeTimers();
  const old = deferred<CitySearchResult[]>();
  const current = deferred<CitySearchResult[]>();
  const search = vi.spyOn(apiClient, 'searchCities').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<Wrapper />);
  const input = screen.getByRole('combobox', { name: '搜索出生地' });
  fireEvent.change(input, { target: { value: '北' } });
  await act(() => vi.advanceTimersByTimeAsync(249));
  expect(search).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByRole('status')).toHaveTextContent('正在搜索地点');
  fireEvent.change(input, { target: { value: '北京' } });
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(search).toHaveBeenCalledTimes(2);
  await act(async () => current.resolve([beijing]));
  expect(screen.getByRole('option', { name: /北京/ })).toBeInTheDocument();
  await act(async () => old.reject(new Error('stale failure')));
  expect(screen.queryByText(/stale failure/)).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveValue('北京 / Beijing');
  expect(screen.getByRole('spinbutton', { name: '纬度' })).toHaveValue(39.9);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('keeps manual fields editable and invalidates derived timezone immediately when a dependency changes', async () => {
  vi.useFakeTimers();
  vi.spyOn(apiClient, 'searchCities').mockResolvedValue([beijing]);
  const resolve = vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '2000-01-01T19:04:00.000Z' });
  render(<Wrapper initial={{ locationLabel: '北京', latitude: '39.9', longitude: '116.4' }} />);
  await act(() => vi.advanceTimersByTimeAsync(400));
  await act(async () => Promise.resolve());
  expect(screen.getByText(/Asia\/Shanghai.*UTC\+08:00/)).toBeInTheDocument();
  expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ year: 2000, latitude: 39.9 }));

  fireEvent.change(screen.getByRole('spinbutton', { name: '纬度' }), { target: { value: '40' } });
  expect(screen.queryByText(/Asia\/Shanghai/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '地点名称' }), { target: { value: '手动地点' } });
  expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveValue('手动地点');
});
