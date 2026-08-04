import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { apiClient } from '../../../api/client';
import type { CitySearchResult } from '../../../api/contracts';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { RelocationPicker } from './RelocationPicker';

const beijing: CitySearchResult = {
  key: 'beijing', label: '北京 / Beijing', nameZh: '北京', nameEn: 'Beijing', region: '', country: 'CN',
  latitude: 39.9042, longitude: 116.4074, source: 'western',
};
const shanghai: CitySearchResult = {
  key: 'shanghai', label: '上海 / Shanghai', nameZh: '上海', nameEn: 'Shanghai', region: '', country: 'CN',
  latitude: 31.2304, longitude: 121.4737, source: 'western',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof RelocationPicker>> = {}) {
  const props = {
    value: beijing, recents: [shanghai], onChange: vi.fn(), onClearRecents: vi.fn(), ...overrides,
  };
  render(<I18nProvider dictionary={dictionary}><RelocationPicker {...props} /></I18nProvider>);
  return props;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('invalidates selected coordinates on any visible text edit and query clear', async () => {
  const user = userEvent.setup();
  const props = renderPicker();
  const input = screen.getByRole('combobox', { name: '迁移地点' });
  await user.type(input, 'x');
  expect(props.onChange).toHaveBeenLastCalledWith(null);
  await user.click(screen.getByRole('button', { name: '清除搜索' }));
  expect(props.onChange).toHaveBeenLastCalledWith(null);
});

test('synchronizes visible text when a trusted value is restored externally', async () => {
  vi.spyOn(apiClient, 'searchCities').mockResolvedValue([]);
  const user = userEvent.setup();
  function ControlledPicker() {
    const [value, setValue] = useState<CitySearchResult | null>(beijing);
    return <I18nProvider dictionary={dictionary}><RelocationPicker value={value} recents={[]}
      onChange={setValue} onClearRecents={() => {}} /><button type="button" onClick={() => setValue(beijing)}>restore</button>
    </I18nProvider>;
  }
  render(<ControlledPicker />);
  const input = screen.getByRole('combobox', { name: '迁移地点' });
  await user.type(input, 'x');
  expect(input).toHaveValue('北京 / Beijingx');
  await user.click(screen.getByRole('button', { name: 'restore' }));
  expect(input).toHaveValue('北京 / Beijing');
});

test('restores a trusted value by click and keyboard listbox selection', async () => {
  const user = userEvent.setup();
  const click = renderPicker({ value: null });
  await user.click(screen.getByRole('option', { name: /上海/ }));
  expect(click.onChange).toHaveBeenLastCalledWith(shanghai);

  vi.mocked(click.onChange).mockClear();
  await user.click(screen.getByRole('button', { name: '清除搜索' }));
  const input = screen.getByRole('combobox', { name: '迁移地点' });
  await user.click(input);
  await user.keyboard('{ArrowDown}');
  expect(input).toHaveAttribute('aria-activedescendant');
  expect(screen.getByRole('option', { name: /上海/ })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{ArrowUp}');
  expect(input).toHaveAttribute('aria-activedescendant');
  await user.keyboard('{Escape}');
  expect(input).toHaveAttribute('aria-expanded', 'false');
  await user.click(input);
  await user.keyboard('{ArrowDown}');
  await user.keyboard('{Enter}');
  expect(click.onChange).toHaveBeenLastCalledWith(shanghai);
});

test('suppresses stale search responses', async () => {
  vi.useFakeTimers();
  const first = deferred<CitySearchResult[]>();
  vi.spyOn(apiClient, 'searchCities').mockReturnValueOnce(first.promise).mockResolvedValueOnce([shanghai]);
  renderPicker({ value: null, recents: [] });
  const input = screen.getByRole('combobox', { name: '迁移地点' });
  fireEvent.change(input, { target: { value: 'Bei' } });
  await act(() => vi.advanceTimersByTimeAsync(200));
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.change(input, { target: { value: 'Sha' } });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(screen.getByRole('option', { name: /上海/ })).toBeInTheDocument();
  await act(async () => first.resolve([beijing]));
  expect(screen.queryByRole('option', { name: /北京/ })).not.toBeInTheDocument();
});

test('links the relocation error to its combobox', () => {
  renderPicker({ error: '请选择已解析的迁移地点' });
  const input = screen.getByRole('combobox', { name: '迁移地点' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  const errorId = input.getAttribute('aria-describedby');
  expect(errorId).toBeTruthy();
  expect(document.getElementById(errorId!)).toHaveTextContent('请选择已解析的迁移地点');
});
