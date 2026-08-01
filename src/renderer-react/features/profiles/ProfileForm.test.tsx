import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { apiClient } from '../../api/client';
import type { Profile, ProfileSaveInput } from '../../api/contracts';
import { I18nProvider } from '../../i18n/I18nProvider';
import { ProfileForm, type DraftRegistration } from './ProfileEditor';

const profile: Profile = {
  id: 'p1', nameZh: '王晓明', nameEn: 'Alex', gender: 'male',
  birthData: { year: 2000, month: 2, day: 29, hour: 8, minute: 5, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  notes: '保留备注', tags: ['贵宾'], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function view({ initial = profile, onSave = vi.fn().mockResolvedValue(undefined), onDraftStateChange = vi.fn() }: {
  initial?: Profile | null;
  onSave?: (input: ProfileSaveInput) => Promise<void>;
  onDraftStateChange?: (registration: DraftRegistration) => void;
} = {}) {
  return render(<I18nProvider dictionary={locale}><ProfileForm profile={initial} onSave={onSave} onCancel={vi.fn()} onDraftStateChange={onDraftStateChange} /></I18nProvider>);
}

afterEach(() => vi.restoreAllMocks());

test('publishes canonical DraftRegistration methods and resets the clean baseline after save', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-02-29T00:05:00.000Z' });
  let registration!: DraftRegistration;
  view({ onDraftStateChange: (value) => { registration = value; } });
  await waitFor(() => expect(registration.dirty).toBe(false));
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name); await userEvent.type(name, '王晓明更新');
  await waitFor(() => expect(registration.dirty).toBe(true));
  await expect(registration.save()).resolves.toBe(true);
  await waitFor(() => expect(registration.dirty).toBe(false));
  await userEvent.type(name, '临时'); registration.discard();
  await waitFor(() => expect(name).toHaveValue('王晓明更新'));
});

test('submits an exact validated create payload from segmented fields and native gender select', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2024-02-29T15:05:00.000Z' });
  let registration!: DraftRegistration;
  const onSave = vi.fn().mockResolvedValue(undefined);
  view({ initial: null, onSave, onDraftStateChange: (value) => { registration = value; } });
  fireEvent.change(screen.getByRole('textbox', { name: '中文名字' }), { target: { value: ' 新人 ' } });
  const gender = screen.getByRole('combobox', { name: '性别' });
  gender.focus();
  const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  gender.dispatchEvent(keyEvent);
  expect(keyEvent.defaultPrevented).toBe(false);
  fireEvent.change(gender, { target: { value: 'female' } });
  expect(gender).toHaveValue('female');
  for (const [name, value] of [['年', '2024'], ['月', '02'], ['日', '29'], ['时', '23'], ['分', '05']] as const) {
    fireEvent.change(screen.getByRole('spinbutton', { name }), { target: { value } });
  }
  fireEvent.change(screen.getByRole('textbox', { name: '地点名称' }), { target: { value: ' 上海 ' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '纬度' }), { target: { value: '31.23' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '经度' }), { target: { value: '121.47' } });
  fireEvent.change(screen.getByRole('textbox', { name: '标签' }), { target: { value: 'VIP，vip' } });
  await expect(registration.save()).resolves.toBe(true);
  expect(onSave).toHaveBeenCalledWith({ nameZh: '新人', nameEn: '', gender: 'female', notes: '', tags: ['VIP'], birthData: { year: 2024, month: 2, day: 29, hour: 23, minute: 5, location: { label: '上海', latitude: 31.23, longitude: 121.47 } } });
});

test('associates aggregate name validation and focuses the first name control', async () => {
  let registration!: DraftRegistration;
  view({ initial: null, onDraftStateChange: (value) => { registration = value; } });
  await act(async () => { expect(await registration.save()).toBe(false); });
  const error = await screen.findByText('至少填写中文或英文名字');
  const group = screen.getByRole('group', { name: '姓名' });
  expect(group).toHaveAttribute('aria-describedby', error.id);
  expect(within(group).getByRole('textbox', { name: '中文名字' })).toHaveFocus();
});

test('reflects backend failure through errors.save and retries the currently displayed draft', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-02-29T00:05:00.000Z' });
  let registration!: DraftRegistration;
  const onSave = vi.fn().mockRejectedValueOnce(new Error('磁盘繁忙')).mockResolvedValue(undefined);
  view({ onSave, onDraftStateChange: (value) => { registration = value; } });
  const notes = screen.getByRole('textbox', { name: '备注' });
  await userEvent.clear(notes); await userEvent.type(notes, '第一次');
  await act(async () => { expect(await registration.save()).toBe(false); });
  expect(await screen.findByRole('alert')).toHaveTextContent('磁盘繁忙');
  await userEvent.clear(notes); await userEvent.type(notes, '当前显示');
  await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  expect(onSave.mock.calls[1][0].notes).toBe('当前显示');
});

test('disables all editable controls while save is pending', async () => {
  const pending = deferred<void>(); let registration!: DraftRegistration;
  view({ onSave: vi.fn().mockReturnValue(pending.promise), onDraftStateChange: (value) => { registration = value; } });
  const saving = registration.save();
  await screen.findByRole('status');
  for (const control of document.querySelectorAll('.profile-form input, .profile-form textarea, .profile-form select')) expect(control).toBeDisabled();
  await act(async () => pending.resolve()); await saving;
});

test('preserves typed invalid segments through blur and validates without coercion', async () => {
  let registration!: DraftRegistration;
  view({ onDraftStateChange: (value) => { registration = value; } });
  const hour = screen.getByRole('spinbutton', { name: '时' });
  fireEvent.change(hour, { target: { value: '24' } }); fireEvent.blur(hour);
  expect(hour).toHaveValue(24);
  await act(async () => { expect(await registration.save()).toBe(false); });
  expect(await screen.findByText('小时须为 0 至 23 的整数')).toBeInTheDocument();
  fireEvent.change(hour, { target: { value: '1.9' } }); fireEvent.blur(hour);
  expect(hour).toHaveValue(1.9);
  await act(async () => { expect(await registration.save()).toBe(false); });
  expect(await screen.findByText('小时须为 0 至 23 的整数')).toBeInTheDocument();
});

test('clamps and normalizes segments only through Chevron steppers', async () => {
  view();
  const hour = screen.getByRole('spinbutton', { name: '时' });
  fireEvent.change(hour, { target: { value: '0' } });
  await userEvent.click(screen.getByRole('button', { name: '时增加' })); expect(hour).toHaveAttribute('aria-valuetext', '01');
  fireEvent.change(hour, { target: { value: '24' } });
  await userEvent.click(screen.getByRole('button', { name: '时增加' })); expect(hour).toHaveAttribute('aria-valuetext', '23');
  const minute = screen.getByRole('spinbutton', { name: '分' }); await userEvent.clear(minute); fireEvent.blur(minute); expect(minute).toHaveAttribute('aria-valuetext', '');
});
