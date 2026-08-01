import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { apiClient } from '../../api/client';
import type { Profile } from '../../api/contracts';
import { I18nProvider } from '../../i18n/I18nProvider';
import { ProfileForm, type ProfileFormRegistration } from './ProfileEditor';

const profile: Profile = {
  id: 'p1', nameZh: '王晓明', nameEn: 'Alex', gender: 'male',
  birthData: { year: 2000, month: 2, day: 29, hour: 8, minute: 5, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  notes: '保留备注', tags: ['贵宾'], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function view({ initial = profile, onSave = vi.fn().mockResolvedValue(undefined), onDraftStateChange = vi.fn() }: {
  initial?: Profile | null;
  onSave?: (input: Parameters<React.ComponentProps<typeof ProfileForm>['onSave']>[0]) => Promise<void>;
  onDraftStateChange?: (registration: ProfileFormRegistration) => void;
} = {}) {
  const onCancel = vi.fn();
  return { onSave, onCancel, onDraftStateChange, ...render(<I18nProvider dictionary={locale}><ProfileForm profile={initial} onSave={onSave} onCancel={onCancel} onDraftStateChange={onDraftStateChange} /></I18nProvider>) };
}

afterEach(() => vi.restoreAllMocks());

test('publishes registration, saves to a clean baseline, and discards later edits', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-02-29T00:05:00.000Z' });
  let registration!: ProfileFormRegistration;
  const onSave = vi.fn().mockResolvedValue(undefined);
  view({ onSave, onDraftStateChange: (value) => { registration = value; } });
  await waitFor(() => expect(registration.dirty).toBe(false));
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name);
  await userEvent.type(name, '王晓明更新');
  await waitFor(() => expect(registration.dirty).toBe(true));
  await expect(registration.save()).resolves.toBe(true);
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nameZh: '王晓明更新', id: 'p1' }));
  await waitFor(() => expect(registration.dirty).toBe(false));
  await userEvent.type(name, '临时');
  registration.discard();
  await waitFor(() => expect(name).toHaveValue('王晓明更新'));
});

test('failed save returns false and retry submits the currently displayed draft', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockRejectedValue(new Error('not relevant'));
  let registration!: ProfileFormRegistration;
  const onSave = vi.fn().mockRejectedValueOnce(new Error('磁盘繁忙')).mockResolvedValue(undefined);
  view({ onSave, onDraftStateChange: (value) => { registration = value; } });
  const notes = screen.getByRole('textbox', { name: '备注' });
  await userEvent.clear(notes);
  await userEvent.type(notes, '第一次');
  await expect(registration.save()).resolves.toBe(false);
  expect(notes).toHaveValue('第一次');
  await userEvent.clear(notes);
  await userEvent.type(notes, '当前显示');
  await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  expect(onSave.mock.calls[1][0].notes).toBe('当前显示');
});

test('disables every editable control while save is pending and retains the submitted value', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-02-29T00:05:00.000Z' });
  const pending = deferred<void>();
  let registration!: ProfileFormRegistration;
  view({ onSave: vi.fn().mockReturnValue(pending.promise), onDraftStateChange: (value) => { registration = value; } });
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name);
  await userEvent.type(name, '提交值');
  const saving = registration.save();
  await waitFor(() => expect(screen.getByRole('status', { name: '' })).toHaveTextContent('正在保存'));
  for (const control of document.querySelectorAll('.profile-form input, .profile-form textarea, .profile-form [role="radio"]')) expect(control).toBeDisabled();
  await act(async () => pending.resolve());
  await expect(saving).resolves.toBe(true);
  expect(name).toHaveValue('提交值');
});

test('increments and clamps compact segmented date-time steppers and pads on blur', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-02-29T00:05:00.000Z' });
  view();
  const hour = screen.getByRole('spinbutton', { name: '时' });
  await userEvent.clear(hour);
  await userEvent.type(hour, '0');
  fireEvent.blur(hour);
  expect(hour).toHaveValue(0);
  await waitFor(() => expect(hour).toHaveAttribute('aria-valuetext', '00'));
  await userEvent.click(screen.getByRole('button', { name: '时增加' }));
  expect(hour).toHaveAttribute('aria-valuetext', '01');
  await userEvent.click(screen.getByRole('button', { name: '时减少' }));
  await userEvent.click(screen.getByRole('button', { name: '时减少' }));
  expect(hour).toHaveAttribute('aria-valuetext', '00');
  await userEvent.clear(hour);
  await userEvent.type(hour, '23');
  fireEvent.blur(hour);
  await userEvent.click(screen.getByRole('button', { name: '时增加' }));
  expect(hour).toHaveAttribute('aria-valuetext', '23');
  const minute = screen.getByRole('spinbutton', { name: '分' });
  await userEvent.clear(minute);
  fireEvent.blur(minute);
  expect(minute).toHaveAttribute('aria-valuetext', '');
});
