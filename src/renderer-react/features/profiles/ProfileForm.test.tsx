import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { apiClient } from '../../api/client';
import type { Profile } from '../../api/contracts';
import { I18nProvider } from '../../i18n/I18nProvider';
import { ProfileForm } from './ProfileEditor';

const profile: Profile = {
  id: 'p1', nameZh: '王晓明', nameEn: 'Alex', gender: 'male',
  birthData: { year: 2000, month: 2, day: 29, hour: 8, minute: 5, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  notes: '保留备注', tags: ['贵宾'], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
};

function view(props: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue(profile);
  const onCancel = props.onCancel ?? vi.fn();
  return { onSave, onCancel, ...render(<I18nProvider dictionary={locale}><ProfileForm onSave={onSave} onCancel={onCancel} {...props} /></I18nProvider>) };
}

afterEach(() => vi.restoreAllMocks());

test('uses segmented gender keyboard interaction and focuses the first invalid field', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' });
  view();
  const female = screen.getByRole('radio', { name: '女' });
  female.focus();
  fireEvent.keyDown(screen.getByRole('radiogroup', { name: '性别' }), { key: 'ArrowRight' });
  expect(screen.getByRole('radio', { name: '其他' })).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(screen.getByRole('button', { name: '创建档案' }));
  expect(screen.getByRole('textbox', { name: '中文名字' })).toHaveFocus();
  expect(screen.getByText('至少填写中文或英文名字')).toHaveAttribute('id');
});

test('focuses the first invalid manual location control when earlier fields are valid', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00', instantUtc: '2000-01-01T00:00:00.000Z' });
  view({ profile: { ...profile, birthData: { ...profile.birthData, location: { ...profile.birthData.location, label: '' } } } });
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveFocus();
});

test('submits normalized create and edit payloads without derived timezone', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '2000-02-29T00:05:00.000Z' });
  const create = view();
  await userEvent.type(screen.getByRole('textbox', { name: '中文名字' }), ' 新人 ');
  for (const [name, value] of [['年', '2000'], ['月', '2'], ['日', '29'], ['时', '8'], ['分', '5']] as const) await userEvent.type(screen.getByRole('spinbutton', { name }), value);
  await userEvent.type(screen.getByRole('textbox', { name: '地点名称' }), ' 北京 ');
  await userEvent.type(screen.getByRole('spinbutton', { name: '纬度' }), '39.9');
  await userEvent.type(screen.getByRole('spinbutton', { name: '经度' }), '116.4');
  await userEvent.type(screen.getByRole('textbox', { name: '标签' }), 'VIP，vip');
  await userEvent.click(screen.getByRole('button', { name: '创建档案' }));
  await waitFor(() => expect(create.onSave).toHaveBeenCalled());
  expect(create.onSave).toHaveBeenCalledWith(expect.objectContaining({ nameZh: '新人', tags: ['VIP'] }));
  expect(create.onSave.mock.calls[0][0]).not.toHaveProperty('timezone');
  create.unmount();

  const edit = view({ profile });
  await userEvent.clear(screen.getByRole('textbox', { name: '英文名字' }));
  await userEvent.type(screen.getByRole('textbox', { name: '英文名字' }), 'Alexander');
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await waitFor(() => expect(edit.onSave).toHaveBeenCalled());
  expect(edit.onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', createdAt: profile.createdAt, updatedAt: profile.updatedAt, nameEn: 'Alexander' }));
});

test('retains values after backend failure and retries the same edited payload', async () => {
  vi.spyOn(apiClient, 'resolveLocation').mockRejectedValue(new Error('not relevant'));
  const onSave = vi.fn().mockRejectedValueOnce(new Error('磁盘繁忙')).mockResolvedValueOnce({ ...profile, notes: '更新备注' });
  view({ profile, onSave });
  const notes = screen.getByRole('textbox', { name: '备注' });
  await userEvent.clear(notes);
  await userEvent.type(notes, '更新备注');
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByText(/保存失败：磁盘繁忙/)).toBeInTheDocument();
  expect(notes).toHaveValue('更新备注');
  await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  expect(onSave.mock.calls[1][0]).toEqual(onSave.mock.calls[0][0]);
});
