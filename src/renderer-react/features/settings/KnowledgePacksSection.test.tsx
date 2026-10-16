import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { KnowledgePacksSection } from './KnowledgePacksSection';
import type { AiInitProgress } from '../../api/contracts';

const version = (v: string, active = false) => ({ id: 'bazi-library', version: v, name: '八字知识库', description: '整理后的八字原文', corpora: ['bazi'], documentCount: 2,
  fingerprint: v, createdAt: '', installedAt: '', active, ready: true, error: null });
function setup(initialError = false) {
  let progress: ((value: AiInitProgress) => void) | undefined;
  let state = { builtinEnabled: true, busy: false, legacyDocuments: 224, packs: [version('1.0.0', true), version('2.0.0')] };
  const api = {
    list: vi.fn(async () => ({ ok: true, data: state })),
    choose: vi.fn(async () => ({ ok: true, data: { token: 'selected-file', manifest: version('3.0.0') } })),
    install: vi.fn(async () => { state = { ...state, packs: [...state.packs, version('3.0.0')] }; return { ok: true, data: version('3.0.0') }; }),
    activate: vi.fn(async (_id, v) => { state = { ...state, packs: state.packs.map((p) => ({ ...p, active: p.version === v })) }; return { ok: true, data: state }; }),
    disable: vi.fn(async () => { state = { ...state, packs: state.packs.map((p) => ({ ...p, active: false })) }; return { ok: true, data: state }; }),
    remove: vi.fn(async () => ({ ok: true, data: state })),
    setBuiltinEnabled: vi.fn(async (enabled) => { state = { ...state, builtinEnabled: enabled }; return { ok: true, data: state }; }),
  };
  if (initialError) api.list.mockRejectedValueOnce(new Error('知识库仍在初始化，请稍候'));
  vi.stubGlobal('mystApi', { ai: { onInitProgress: (callback: (value: AiInitProgress) => void) => { progress = callback; return () => { progress = undefined; }; }, knowledge: { packs: api } } });
  const onChanged = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KnowledgePacksSection onChanged={onChanged} /></QueryClientProvider>);
  return { api, onChanged, emitProgress: (value: AiInitProgress) => progress?.(value) };
}
test('previews a chosen package, installs without auto activation, and switches or rolls back versions', async () => {
  const { api } = setup();
  await screen.findByText(/已启用 v1.0.0/);
  await userEvent.click(screen.getByRole('button', { name: '导入知识包' }));
  await screen.findByText('八字知识库 · v3.0.0');
  expect(api.install).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '安装知识包' }));
  await waitFor(() => expect(api.install).toHaveBeenCalledWith('selected-file'));
  expect(api.activate).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByLabelText('八字知识库版本'), '2.0.0');
  await userEvent.click(screen.getByRole('button', { name: '切换版本' }));
  await screen.findByText(/已启用 v2.0.0/);
  expect(api.activate).toHaveBeenLastCalledWith('bazi-library', '2.0.0');
  await userEvent.selectOptions(screen.getByLabelText('八字知识库版本'), '1.0.0');
  await userEvent.click(screen.getByRole('button', { name: '切换版本' }));
  await screen.findByText(/已启用 v1.0.0/);
  expect(api.activate).toHaveBeenLastCalledWith('bazi-library', '1.0.0');
});
test('failed activation leaves the displayed selection active and surfaces the error', async () => {
  const { api } = setup();
  await screen.findByText(/已启用 v1.0.0/);
  api.activate.mockResolvedValueOnce({ ok: false, error: '嵌入模型连接失败' } as never);
  await userEvent.selectOptions(screen.getByLabelText('八字知识库版本'), '2.0.0');
  await userEvent.click(screen.getByRole('button', { name: '切换版本' }));
  expect(await screen.findByRole('status')).toHaveTextContent('嵌入模型连接失败');
  expect(screen.getByText(/已启用 v1.0.0/)).toBeInTheDocument();
});
test('default library can be disabled independently and the active version cannot be removed', async () => {
  const { api } = setup();
  await screen.findByText(/已启用 v1.0.0/);
  expect(screen.getByRole('button', { name: '移除此版本' })).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(api.setBuiltinEnabled).toHaveBeenCalledWith(false));
  await userEvent.click(screen.getByRole('button', { name: '停用' }));
  await screen.findByText(/未启用 ·/);
  expect(api.disable).toHaveBeenCalledWith('bazi-library');
});

test('shows live indexing progress and keeps controls disabled until installation finishes', async () => {
  const { api, emitProgress } = setup();
  await screen.findByText(/已启用 v1.0.0/);
  await userEvent.click(screen.getByRole('button', { name: '导入知识包' }));
  await screen.findByText('八字知识库 · v3.0.0');
  let finish!: (value: unknown) => void;
  api.install.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve as typeof finish; }) as never);
  await userEvent.click(screen.getByRole('button', { name: '安装知识包' }));
  act(() => emitProgress({ phase: 'indexing', done: 32, total: 120 }));
  expect(screen.getByRole('progressbar', { name: '知识包索引进度' })).toHaveAttribute('value', '32');
  expect(screen.getByText('正在建立检索索引：32 / 120')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导入知识包' })).toBeDisabled();
  await act(async () => finish({ ok: true, data: version('3.0.0') }));
  await waitFor(() => expect(screen.getByRole('button', { name: '导入知识包' })).toBeEnabled());
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});


test('initialization error refreshes when startup becomes ready without restarting', async () => {
  const { api, emitProgress } = setup(true);
  expect(await screen.findByText('知识库仍在初始化，请稍候')).toBeInTheDocument();
  act(() => emitProgress({ phase: 'ready', docs: 2 }));
  expect(await screen.findByText(/已启用 v1.0.0/)).toBeInTheDocument();
  expect(screen.queryByText('知识库仍在初始化，请稍候')).not.toBeInTheDocument();
  expect(api.list.mock.calls.length).toBeGreaterThan(1);
});
