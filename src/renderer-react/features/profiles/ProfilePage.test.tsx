import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import locale from '../../../../locale/zh.json';
import { expect, test, vi } from 'vitest';
import type { Profile } from '../../api/contracts';
import { I18nProvider } from '../../i18n/I18nProvider';
import { createProfileWorkspaceStore, PROFILE_WORKSPACE_KEY } from '../../stores/profileWorkspace';
import { ProfilePage } from './ProfilePage';
import { DirtyNavigationProvider } from '../../shell/DirtyNavigationProvider';
import '../../styles/density.css';

const alpha: Profile = {
  id: 'a', nameZh: '王晓明', nameEn: 'Alex Wang', gender: 'male',
  birthData: { year: 1987, month: 2, day: 3, hour: 4, minute: 5, location: { label: '北京 / Beijing', latitude: 39.9042, longitude: 116.4074 } },
  notes: '第一行\n第二行', tags: ['贵宾', '事业'], createdAt: '2025-01-02T03:04:05.000Z', updatedAt: '2026-06-07T08:09:10.000Z',
};
const beta: Profile = {
  ...alpha, id: 'b', nameZh: '', nameEn: 'Beatrice Longname', gender: 'female',
  birthData: { ...alpha.birthData, year: 1992, month: 11, location: { label: 'London', latitude: 51.5074, longitude: -0.1278 } },
  tags: [], notes: '', updatedAt: '2026-07-07T08:09:10.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

function setup(
  list = vi.fn().mockResolvedValue({ ok: true, data: [alpha, beta] }),
  storage = memoryStorage(),
) {
  const api = { profiles: { list, save: vi.fn(), remove: vi.fn() }, locations: { resolve: vi.fn().mockResolvedValue({ ok: true, data: { timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', instantUtc: '1987-02-02T20:05:00.000Z' } }) } };
  Object.assign(api, { app: { onCloseRequested: vi.fn(() => () => {}), decideClose: vi.fn().mockResolvedValue({ ok: true, data: true }) } });
  vi.stubGlobal('mystApi', api);
  const store = createProfileWorkspaceStore(storage, Date.now);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onNavigate = vi.fn();
  const view = render(
    <QueryClientProvider client={client}><I18nProvider dictionary={locale}><DirtyNavigationProvider>
      <ProfilePage workspaceStore={store} onNavigate={onNavigate} />
    </DirtyNavigationProvider></I18nProvider></QueryClientProvider>,
  );
  return { ...view, api, store, client, onNavigate };
}

test('guards dirty profile selection and leaves the draft in place when canceled', async () => {
  setup();
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  await userEvent.type(screen.getByRole('textbox', { name: '备注' }), '未保存');
  await userEvent.click(screen.getByRole('button', { name: /^选择档案：Beatrice Longname/ }));
  const dialog = screen.getByRole('alertdialog', { name: locale.dirty.title });
  expect(screen.getByRole('form', { name: '编辑档案' })).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: locale.dirty.cancel }));
  expect((screen.getByRole('textbox', { name: '备注' }) as HTMLTextAreaElement).value).toContain('未保存');
  await userEvent.click(screen.getByRole('button', { name: /^选择档案：Beatrice Longname/ }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: locale.dirty.discard }));
  expect(await screen.findByRole('heading', { name: 'Beatrice Longname' })).toBeInTheDocument();
});

test('selects a persisted valid primary initially and after refetch while retaining valid selection', async () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_WORKSPACE_KEY, JSON.stringify({ primaryProfileId: 'b', recentUses: {} }));
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [alpha, beta] })
    .mockResolvedValueOnce({ ok: true, data: [alpha, beta] })
    .mockResolvedValueOnce({ ok: true, data: [beta, alpha] });
  const { client } = setup(list, storage);

  expect(await screen.findByRole('heading', { name: 'Beatrice Longname' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '选择档案：王晓明' }));
  await client.refetchQueries({ queryKey: ['profiles'] });
  expect(screen.getByRole('heading', { name: '王晓明' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /^选择档案：Beatrice Longname，主档案/ }));
  await client.refetchQueries({ queryKey: ['profiles'] });
  expect(screen.getByRole('heading', { name: 'Beatrice Longname' })).toBeInTheDocument();
});

test('loads, retries errors, and distinguishes an empty library from filtered results', async () => {
  const list = vi.fn().mockResolvedValueOnce({ ok: false, error: '网络中断' }).mockResolvedValueOnce({ ok: true, data: [] });
  const failedView = setup(list);
  expect(screen.getByRole('status')).toHaveTextContent('正在加载档案');
  expect(await screen.findByRole('alert')).toHaveTextContent('网络中断');
  await userEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('档案库为空')).toBeInTheDocument();
  failedView.unmount();

  const populated = vi.fn().mockResolvedValue({ ok: true, data: [alpha] });
  setup(populated);
  const search = await screen.findByRole('searchbox', { name: '搜索档案' });
  await userEvent.type(search, '不存在');
  expect(screen.getByText('没有符合筛选条件的档案')).toBeInTheDocument();
});

test('keeps marked controls density-aware and row text inside its scroll container contract', async () => {
  setup();
  await screen.findByRole('heading', { name: '王晓明' });
  for (const [density, height] of [['compact', '32px'], ['comfortable', '36px']] as const) {
    document.documentElement.dataset.density = density;
    expect(getComputedStyle(document.documentElement).getPropertyValue('--control-height').trim()).toBe(height);
    expect(document.querySelectorAll('[data-profile-control]').length).toBeGreaterThan(0);
  }
  for (const field of document.querySelectorAll('.profile-row__name, .profile-row__secondary, .profile-row__location')) {
    expect(field.clientWidth === 0 || field.scrollWidth <= field.clientWidth).toBe(true);
  }
});

test('keeps the primary marker separate and accessible for a very long bilingual name', async () => {
  const longName = '司马'.repeat(30);
  const longProfile = { ...alpha, nameZh: longName, nameEn: 'Extremely Long English Profile Name '.repeat(5) };
  setup(vi.fn().mockResolvedValue({ ok: true, data: [longProfile] }));

  const row = await screen.findByRole('button', { name: new RegExp(`选择档案：${longName}.*主档案.*1987-02-03 04:05.*北京`) });
  const name = row.querySelector('.profile-row__name');
  const marker = row.querySelector('.profile-row__marker');
  expect(name).toBeInTheDocument();
  expect(marker).toBeInTheDocument();
  expect(name).not.toContainElement(marker as HTMLElement);
  expect(name?.parentElement).toHaveClass('profile-row__identity');
  expect(marker?.parentElement).toBe(name?.parentElement);
});

test('supports directory search, sorting, selection, recent filtering, and primary state', async () => {
  const { store } = setup();
  const directory = await screen.findByRole('complementary', { name: '档案目录' });
  const rows = within(directory).getAllByRole('button', { name: /选择档案/ });
  expect(rows[0]).toHaveTextContent('Beatrice Longname');
  await userEvent.selectOptions(within(directory).getByRole('combobox', { name: '排序方式' }), 'name-asc');
  expect(within(directory).getAllByRole('button', { name: /选择档案/ })[0]).toHaveTextContent('Beatrice Longname');
  await userEvent.click(within(directory).getByRole('button', { name: /选择档案：Beatrice/ }));
  expect(store.getState().recentUses.b).toBeDefined();
  expect(screen.getByRole('heading', { name: 'Beatrice Longname' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '设为主档案' }));
  expect(store.getState().primaryProfileId).toBe('b');
  expect(screen.getByText('主档案', { selector: '.profile-detail__primary' })).toBeInTheDocument();
  await userEvent.selectOptions(within(directory).getByRole('combobox', { name: '最近使用' }), '7d');
  expect(within(directory).getAllByRole('button', { name: /选择档案/ })).toHaveLength(1);
});

test('publishes chart intent and route together through one supplied shell transition', async () => {
  const { store, onNavigate } = setup();
  await screen.findByRole('heading', { name: '王晓明' });
  const detail = screen.getByRole('article', { name: '档案详情' });
  expect(within(detail).getByText('Alex Wang', { selector: '.profile-detail__secondary' })).toBeInTheDocument();
  expect(within(detail).getByText('男')).toBeInTheDocument();
  expect(within(detail).getByText('1987-02-03 04:05')).toBeInTheDocument();
  expect(within(detail).getByText('39.9042, 116.4074')).toBeInTheDocument();
  expect(within(detail).getByText(/第一行/).textContent).toBe('第一行\n第二行');
  expect(within(detail).getByRole('list', { name: '标签' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '打开本命盘' }));
  expect(store.getState().chartIntent).toBeNull();
  expect(onNavigate).toHaveBeenCalledTimes(1);
  expect(onNavigate).toHaveBeenCalledWith('personal', expect.any(Function));
  act(() => onNavigate.mock.calls[0][1]());
  expect(store.getState().chartIntent).toEqual({ route: 'personal', chartType: 'natal', primaryProfileId: 'a' });
  await userEvent.click(screen.getByRole('button', { name: '打开比较盘' }));
  expect(onNavigate).toHaveBeenCalledTimes(2);
  act(() => onNavigate.mock.calls[1][1]());
  expect(store.getState().chartIntent?.chartType).toBe('synastry');
  expect(onNavigate).toHaveBeenLastCalledWith('relationship', expect.any(Function));
});

test('duplicates with a clean payload, mandatory refetch, localized nonblank name, and canonical selection', async () => {
  const copied = { ...beta, id: 'copy', nameEn: 'Beatrice Longname（副本）', updatedAt: '2026-08-02T12:00:00.000Z' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [beta] }).mockResolvedValueOnce({ ok: true, data: [beta, copied] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: { ...copied, updatedAt: beta.updatedAt } });
  await screen.findByRole('heading', { name: 'Beatrice Longname' });
  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(api.profiles.save).toHaveBeenCalledWith(expect.objectContaining({ nameZh: '', nameEn: 'Beatrice Longname（副本）' }));
  expect(api.profiles.save.mock.calls[0][0]).not.toHaveProperty('id');
  expect(api.profiles.save.mock.calls[0][0]).not.toHaveProperty('createdAt');
  expect(api.profiles.save.mock.calls[0][0]).not.toHaveProperty('updatedAt');
  expect(await screen.findByRole('heading', { name: 'Beatrice Longname（副本）' })).toBeInTheDocument();
});

test('retries only duplicate refresh and selects only the authoritative returned ID among identical profiles', async () => {
  const identical = { ...beta, id: 'existing', nameEn: 'Beatrice Longname（副本）' };
  const saved = { ...identical, id: 'authoritative-copy' };
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [beta, identical] })
    .mockResolvedValueOnce({ ok: false, error: '刷新断开' })
    .mockResolvedValueOnce({ ok: true, data: [beta, identical, saved] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: saved });
  await screen.findByRole('heading', { name: 'Beatrice Longname' });

  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  expect(await screen.findByText(/档案已保存，但刷新失败：刷新断开/)).toBeInTheDocument();
  expect(api.profiles.save).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-profile-id="existing"]')).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(screen.getByRole('button', { name: '重试刷新档案' }));

  await waitFor(() => expect(document.querySelector('[data-profile-id="authoritative-copy"]')).toHaveAttribute('aria-pressed', 'true'));
  expect(api.profiles.save).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(3);
});

test('does not select an identical profile when the authoritative saved ID is absent after refresh', async () => {
  const identical = { ...beta, id: 'existing', nameEn: 'Beatrice Longname（副本）' };
  const saved = { ...identical, id: 'missing-copy' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [beta, identical] }).mockResolvedValueOnce({ ok: true, data: [beta, identical] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: saved });
  await screen.findByRole('heading', { name: 'Beatrice Longname' });

  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('刷新后未找到已保存的档案');
  expect(document.querySelector('[data-profile-id="existing"]')).toHaveAttribute('aria-pressed', 'false');
  expect(api.profiles.save).toHaveBeenCalledTimes(1);
});

test('serializes duplicate save and canonical refresh across double clicks', async () => {
  const copied = { ...beta, id: 'copy', nameEn: 'Beatrice Longname（副本）' };
  const saveResult = deferred<{ ok: true; data: Profile }>();
  const refreshResult = deferred<{ ok: true; data: Profile[] }>();
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [beta] })
    .mockReturnValueOnce(refreshResult.promise);
  const { api } = setup(list);
  api.profiles.save.mockReturnValue(saveResult.promise);
  await screen.findByRole('heading', { name: 'Beatrice Longname' });
  const copy = screen.getByRole('button', { name: '复制档案' });

  fireEvent.click(copy);
  fireEvent.click(copy);
  expect(copy).toBeDisabled();
  await waitFor(() => expect(api.profiles.save).toHaveBeenCalledTimes(1));
  await act(async () => saveResult.resolve({ ok: true, data: copied }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(copy).toBeDisabled();
  fireEvent.click(copy);
  expect(api.profiles.save).toHaveBeenCalledTimes(1);

  await act(async () => refreshResult.resolve({ ok: true, data: [beta, copied] }));
  expect(await screen.findByRole('heading', { name: copied.nameEn })).toBeInTheDocument();
});

test('serializes refresh retry and ignores a stale first retry completion', async () => {
  const copied = { ...beta, id: 'copy', nameEn: 'Beatrice Longname（副本）' };
  const retryResult = deferred<{ ok: true; data: Profile[] }>();
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [beta] })
    .mockResolvedValueOnce({ ok: false, error: '刷新断开' })
    .mockReturnValueOnce(retryResult.promise);
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: copied });
  await screen.findByRole('heading', { name: 'Beatrice Longname' });
  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  const retry = await screen.findByRole('button', { name: '重试刷新档案' });

  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(retry).toBeDisabled();
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  expect(api.profiles.save).toHaveBeenCalledTimes(1);
  await act(async () => retryResult.resolve({ ok: true, data: [beta, copied] }));

  expect(await screen.findByRole('heading', { name: copied.nameEn })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a new duplicate save clears a prior saved ID before its own failure retry', async () => {
  const copied = { ...beta, id: 'copy', nameEn: 'Beatrice Longname（副本）' };
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [beta] })
    .mockResolvedValueOnce({ ok: false, error: '刷新断开' })
    .mockResolvedValueOnce({ ok: true, data: [beta, copied] });
  const { api } = setup(list);
  api.profiles.save
    .mockResolvedValueOnce({ ok: true, data: copied })
    .mockResolvedValueOnce({ ok: false, error: '第二次保存失败' })
    .mockResolvedValueOnce({ ok: true, data: copied });
  await screen.findByRole('heading', { name: 'Beatrice Longname' });
  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  expect(await screen.findByRole('button', { name: '重试刷新档案' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('第二次保存失败');
  const retrySave = screen.getByRole('button', { name: '重试' });
  expect(screen.queryByRole('button', { name: '重试刷新档案' })).not.toBeInTheDocument();
  await userEvent.click(retrySave);

  expect(api.profiles.save).toHaveBeenCalledTimes(3);
  expect(list).toHaveBeenCalledTimes(3);
});

test('keeps duplicate failure inline without an unhandled rejection and retries the same payload', async () => {
  const copied = { ...alpha, id: 'copy', nameZh: '王晓明（副本）' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: true, data: [alpha, copied] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValueOnce({ ok: false, error: '磁盘繁忙' }).mockResolvedValueOnce({ ok: true, data: copied });
  const unhandled = vi.fn();
  window.addEventListener('unhandledrejection', unhandled);

  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '复制档案' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('磁盘繁忙');
  expect(screen.getByRole('heading', { name: '王晓明' })).toBeInTheDocument();
  expect(unhandled).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '重试' }));

  expect(await screen.findByRole('heading', { name: '王晓明（副本）' })).toBeInTheDocument();
  expect(api.profiles.save).toHaveBeenCalledTimes(2);
  expect(api.profiles.save.mock.calls[1][0]).toEqual(api.profiles.save.mock.calls[0][0]);
  expect(list).toHaveBeenCalledTimes(2);
  window.removeEventListener('unhandledrejection', unhandled);
});

test('uses an accessible delete dialog with cancel, trapped focus, failure, and retry', async () => {
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha, beta] }).mockResolvedValueOnce({ ok: true, data: [beta] });
  const { api, store } = setup(list);
  api.profiles.remove.mockResolvedValueOnce({ ok: false, error: '占用中' }).mockResolvedValueOnce({ ok: true, data: true });
  await screen.findByRole('heading', { name: '王晓明' });
  const trigger = screen.getByRole('button', { name: '删除档案' });
  await userEvent.click(trigger);
  let dialog = screen.getByRole('alertdialog', { name: '删除档案' });
  expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(within(dialog).getByRole('button', { name: '确认删除' })).toHaveFocus();
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
  dialog = screen.getByRole('alertdialog', { name: '删除档案' });
  await userEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('占用中');
  await userEvent.click(within(dialog).getByRole('button', { name: '重试删除' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(store.getState().recentUses.a).toBeUndefined();
  expect(api.profiles.remove).toHaveBeenCalledTimes(2);
});

test('retries only delete refresh and restores focus to the next canonical row after the trigger is removed', async () => {
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [alpha, beta] })
    .mockResolvedValueOnce({ ok: false, error: '刷新断开' })
    .mockResolvedValueOnce({ ok: true, data: [beta] });
  const { api } = setup(list);
  api.profiles.remove.mockResolvedValue({ ok: true, data: true });
  await screen.findByRole('heading', { name: '王晓明' });
  const trigger = screen.getByRole('button', { name: '删除档案' });
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('档案已删除，但刷新失败：刷新断开');
  expect(api.profiles.remove).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole('button', { name: '重试刷新档案' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  const nextRow = document.querySelector<HTMLElement>('[data-profile-id="b"]');
  await waitFor(() => expect(nextRow).toHaveFocus());
  expect(trigger.isConnected).toBe(false);
  expect(api.profiles.remove).toHaveBeenCalledTimes(1);
});

test('restores delete focus to create when the canonical library becomes empty', async () => {
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: true, data: [] });
  const { api } = setup(list);
  api.profiles.remove.mockResolvedValue({ ok: true, data: true });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '删除档案' }));
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }));

  await waitFor(() => expect(screen.getByRole('button', { name: '新建档案' })).toHaveFocus());
});

test('keeps focus trapped on dialog status while delete and refresh are unresolved', async () => {
  const removeResult = deferred<{ ok: true; data: true }>();
  const refreshResult = deferred<{ ok: false; error: string }>();
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [alpha, beta] })
    .mockReturnValueOnce(refreshResult.promise);
  const { api } = setup(list);
  api.profiles.remove.mockReturnValue(removeResult.promise);
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '删除档案' }));
  const dialog = screen.getByRole('alertdialog', { name: '删除档案' });
  await userEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  const status = within(dialog).getByRole('status');

  expect(status).toHaveFocus();
  expect(status).toHaveAttribute('aria-busy', 'true');
  fireEvent.keyDown(status, { key: 'Tab' });
  expect(status).toHaveFocus();
  fireEvent.keyDown(status, { key: 'Tab', shiftKey: true });
  expect(status).toHaveFocus();

  await act(async () => removeResult.resolve({ ok: true, data: true }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(status).toHaveFocus();
  fireEvent.keyDown(status, { key: 'Tab' });
  expect(status).toHaveFocus();

  await act(async () => refreshResult.resolve({ ok: false, error: '刷新断开' }));
  const retry = await within(dialog).findByRole('button', { name: '重试刷新档案' });
  await waitFor(() => expect(retry).toHaveFocus());
});

test('opens create and edit modes inside the page while keeping the directory visible', async () => {
  setup();
  await screen.findByRole('heading', { name: '王晓明' });
  const create = screen.getByRole('button', { name: '新建档案' });
  create.focus();
  await userEvent.click(create);
  expect(screen.getByRole('form', { name: '新建档案' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '中文名字' })).toHaveFocus();
  expect(screen.getByRole('complementary', { name: '档案目录' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('heading', { name: '王晓明' })).toBeInTheDocument();
  expect(create).toHaveFocus();
  const edit = screen.getByRole('button', { name: '编辑档案' });
  edit.focus();
  await userEvent.click(edit);
  expect(screen.getByRole('form', { name: '编辑档案' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '中文名字' })).toHaveValue('王晓明');
  expect(screen.getByRole('textbox', { name: '中文名字' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('button', { name: /^选择档案：王晓明/ })).toHaveFocus();
});

test('retains the authoritative saved edit after refresh failure and retries refresh without saving twice', async () => {
  const saved = { ...alpha, nameZh: '王晓明更新', updatedAt: '2026-08-02T13:00:00.000Z' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: false, error: '刷新断开' }).mockResolvedValueOnce({ ok: true, data: [saved] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: saved });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name);
  await userEvent.type(name, '王晓明更新');
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('档案已保存，但刷新失败：刷新断开');
  expect(screen.getByRole('textbox', { name: '中文名字' })).toHaveValue('王晓明更新');
  expect(api.profiles.save).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
  expect(await screen.findByRole('heading', { name: '王晓明更新' })).toBeInTheDocument();
  expect(api.profiles.save).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(3);
});

test('saves changed draft content again after a committed save has a refresh failure', async () => {
  const firstSaved = { ...alpha, nameZh: '王晓明更新', updatedAt: '2026-08-02T13:00:00.000Z' };
  const secondSaved = { ...firstSaved, notes: '刷新失败后的新备注', updatedAt: '2026-08-02T13:05:00.000Z' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: false, error: '刷新断开' }).mockResolvedValueOnce({ ok: true, data: [secondSaved] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValueOnce({ ok: true, data: firstSaved }).mockResolvedValueOnce({ ok: true, data: secondSaved });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name); await userEvent.type(name, '王晓明更新');
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('刷新断开');
  const notes = screen.getByRole('textbox', { name: '备注' });
  await userEvent.clear(notes); await userEvent.type(notes, '刷新失败后的新备注');
  await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
  expect(await screen.findByRole('heading', { name: '王晓明更新' })).toBeInTheDocument();
  expect(api.profiles.save).toHaveBeenCalledTimes(2);
  expect(api.profiles.save.mock.calls[1][0].notes).toBe('刷新失败后的新备注');
});

test('cancel after committed save failure displays overlay until equivalent canonical data arrives', async () => {
  const committed = { ...alpha, nameZh: '已提交姓名', notes: '已提交备注', updatedAt: '2026-08-02T13:10:00.000Z' };
  const canonical = { ...committed, updatedAt: '2026-08-02T13:15:00.000Z' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: false, error: '刷新断开' }).mockResolvedValueOnce({ ok: true, data: [canonical] });
  const { api, client } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: committed });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  fireEvent.change(screen.getByRole('textbox', { name: '中文名字' }), { target: { value: '已提交姓名' } });
  fireEvent.change(screen.getByRole('textbox', { name: '备注' }), { target: { value: '已提交备注' } });
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('heading', { name: '已提交姓名' })).toBeInTheDocument();
  expect(screen.getByText('已提交备注')).toBeInTheDocument();
  expect(client.getQueryData<Profile[]>(['profiles'])?.[0]).toEqual(alpha);
  await client.refetchQueries({ queryKey: ['profiles'] });
  expect(await screen.findByText('2026-08-02T13:15:00.000Z')).toBeInTheDocument();
  expect(screen.queryByText('2026-08-02T13:10:00.000Z')).not.toBeInTheDocument();
});

test('confirmed delete removes a committed overlay before successful canonical refresh', async () => {
  const committed = { ...alpha, nameZh: '待删除已保存档案', updatedAt: '2026-08-02T13:20:00.000Z' };
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: [alpha] })
    .mockResolvedValueOnce({ ok: false, error: '刷新断开' })
    .mockResolvedValueOnce({ ok: true, data: [] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: committed });
  api.profiles.remove.mockResolvedValue({ ok: true, data: true });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name); await userEvent.type(name, committed.nameZh);
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('刷新断开');
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('heading', { name: committed.nameZh })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '删除档案' }));
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(document.querySelector('[data-profile-id="a"]')).not.toBeInTheDocument();
  expect(document.querySelector('[data-profile-id][aria-pressed="true"]')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: committed.nameZh })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '新建档案' })).toHaveFocus());
});

test('focuses the authoritative profile row after a successful create save', async () => {
  const created = { ...alpha, id: 'created', nameZh: '新建已保存档案', updatedAt: '2026-08-02T13:25:00.000Z' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: true, data: [alpha, created] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: created });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '新建档案' }));
  fireEvent.change(screen.getByRole('textbox', { name: '中文名字' }), { target: { value: created.nameZh } });
  fireEvent.change(screen.getByRole('textbox', { name: '地点名称' }), { target: { value: '北京 / Beijing' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '纬度' }), { target: { value: '39.9042' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '经度' }), { target: { value: '116.4074' } });
  await userEvent.click(screen.getByRole('button', { name: '创建档案' }));

  expect(await screen.findByRole('heading', { name: created.nameZh })).toBeInTheDocument();
  expect(document.querySelector('[data-profile-id="created"]')).toHaveFocus();
  expect(document.body).not.toHaveFocus();
});

test('focuses the saved profile row after a successful edit save', async () => {
  const saved = { ...alpha, nameZh: '编辑已保存档案', updatedAt: '2026-08-02T13:30:00.000Z' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha] }).mockResolvedValueOnce({ ok: true, data: [saved] });
  const { api } = setup(list);
  api.profiles.save.mockResolvedValue({ ok: true, data: saved });
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  const name = screen.getByRole('textbox', { name: '中文名字' });
  await userEvent.clear(name); await userEvent.type(name, saved.nameZh);
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));

  expect(await screen.findByRole('heading', { name: saved.nameZh })).toBeInTheDocument();
  expect(document.querySelector('[data-profile-id="a"]')).toHaveFocus();
  expect(document.body).not.toHaveFocus();
});

test('waits for a direct save completion before selecting out of the editor', async () => {
  const pending = deferred<{ ok: true; data: Profile }>();
  const saved = { ...alpha, nameZh: '迟到结果' };
  const list = vi.fn().mockResolvedValueOnce({ ok: true, data: [alpha, beta] }).mockResolvedValueOnce({ ok: true, data: [saved, beta] });
  const { api } = setup(list);
  api.profiles.save.mockReturnValue(pending.promise);
  await screen.findByRole('heading', { name: '王晓明' });
  await userEvent.click(screen.getByRole('button', { name: '编辑档案' }));
  await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await userEvent.click(screen.getByRole('button', { name: /^选择档案：Beatrice Longname/ }));
  const dialog = screen.getByRole('alertdialog');
  for (const button of within(dialog).getAllByRole('button')) expect(button).toBeDisabled();
  expect(screen.queryByRole('heading', { name: 'Beatrice Longname' })).not.toBeInTheDocument();
  await act(async () => pending.resolve({ ok: true, data: saved }));
  expect(await screen.findByRole('heading', { name: 'Beatrice Longname' })).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: '编辑档案' })).not.toBeInTheDocument();
});
