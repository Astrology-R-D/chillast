import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { apiClient } from '../../api/client';
import type { CitySearchResult } from '../../api/contracts';
import { I18nProvider } from '../../i18n/I18nProvider';
import { LocationPicker, type BirthMomentValue, type LocationPickerValue } from './LocationPicker';

const beijing: CitySearchResult = { key: 'bj', label: '北京 / Beijing', nameZh: '北京', nameEn: 'Beijing', region: '', country: 'CN', latitude: 39.9, longitude: 116.4, source: 'western' };
const moment: BirthMomentValue = { year: '2000', month: '01', day: '02', hour: '03', minute: '04' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function Wrapper({ initial = { locationLabel: '', latitude: '', longitude: '' }, birthMoment = moment }: { initial?: LocationPickerValue; birthMoment?: BirthMomentValue }) {
  const [value, setValue] = useState(initial);
  return <I18nProvider dictionary={locale}><LocationPicker value={value} birthMoment={birthMoment} errors={{}} onChange={(patch) => setValue((current) => ({ ...current, ...patch }))} /></I18nProvider>;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('uses 200ms debounce, clears prior results immediately, and suppresses stale success and failure', async () => {
  vi.useFakeTimers();
  const staleSuccess = deferred<CitySearchResult[]>();
  const staleFailure = deferred<CitySearchResult[]>();
  const search = vi.spyOn(apiClient, 'searchCities').mockResolvedValueOnce([beijing]).mockReturnValueOnce(staleSuccess.promise).mockReturnValueOnce(staleFailure.promise);
  render(<Wrapper />);
  const input = screen.getByRole('combobox', { name: '搜索出生地' });
  fireEvent.change(input, { target: { value: '北京' } });
  await act(() => vi.advanceTimersByTimeAsync(199));
  expect(search).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  await act(async () => Promise.resolve());
  expect(screen.getByRole('option', { name: /北京/ })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '上海' } });
  expect(screen.queryByRole('option', { name: /北京/ })).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(200));
  fireEvent.change(input, { target: { value: '深圳' } });
  await act(async () => staleSuccess.resolve([beijing]));
  expect(screen.queryByRole('option', { name: /北京/ })).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(200));
  fireEvent.change(input, { target: { value: '广州' } });
  await act(async () => staleFailure.reject(new Error('stale failure')));
  expect(screen.queryByText(/stale failure/)).not.toBeInTheDocument();
});

test('supports keyboard and click selection while manual location fields remain editable', async () => {
  vi.useFakeTimers();
  vi.spyOn(apiClient, 'searchCities').mockResolvedValue([beijing]);
  render(<Wrapper />);
  const search = screen.getByRole('combobox', { name: '搜索出生地' });
  fireEvent.change(search, { target: { value: '北京' } });
  await act(() => vi.advanceTimersByTimeAsync(200));
  await act(async () => Promise.resolve());
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.focus(search);
  fireEvent.click(screen.getByRole('option', { name: /北京/ }));
  expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveValue('北京 / Beijing');
  expect(screen.getByRole('spinbutton', { name: '纬度' })).toHaveValue(39.9);
  fireEvent.change(screen.getByRole('textbox', { name: '地点名称' }), { target: { value: '手动地点' } });
  expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveValue('手动地点');
});

test('resolves canonical historical fields and invalidates old resolution on dependency change', async () => {
  vi.useFakeTimers();
  const resolve = vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '2000-01-01T19:04:00.000Z' });
  const { rerender } = render(<I18nProvider dictionary={locale}><LocationPicker value={{ locationLabel: '北京', latitude: '39.9', longitude: '116.4' }} birthMoment={moment} errors={{}} onChange={() => {}} /></I18nProvider>);
  await act(() => vi.advanceTimersByTimeAsync(350));
  expect(screen.getByText(/Asia\/Shanghai.*UTC\+08:00/)).toBeInTheDocument();
  expect(resolve).toHaveBeenCalledWith({ year: 2000, month: 1, day: 2, hour: 3, minute: 4, latitude: 39.9, longitude: 116.4 });
  rerender(<I18nProvider dictionary={locale}><LocationPicker value={{ locationLabel: '北京', latitude: '40', longitude: '116.4' }} birthMoment={moment} errors={{}} onChange={() => {}} /></I18nProvider>);
  expect(screen.queryByText(/Asia\/Shanghai/)).not.toBeInTheDocument();
});
