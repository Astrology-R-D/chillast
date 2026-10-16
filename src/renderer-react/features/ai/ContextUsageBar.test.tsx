import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import type { ContextEvent, ContextUsage } from '../../api/contracts';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { I18nProvider } from '../../i18n/I18nProvider';
import locale from '../../../../locale/zh.json';
import { ContextUsageBar } from './ContextUsageBar';

const usage = (percent: number): ContextUsage => ({ used: percent * 100, limit: 10000, percent, reserve: 1000, safety: 1024, estimated: true, needsCompression: false });
test('shows manual compression above 70%, passes draft, refreshes usage and shows the result', async () => {
  resetAiStreamStoreForTests(); aiStreamStore.setState({ activeSessionId: 's1' });
  const getUsage = vi.fn().mockResolvedValue({ ok: true, data: usage(75) });
  const compress = vi.fn().mockResolvedValue({ ok: true, data: { usage: usage(35), changed: true, message: '完整记录与引用已保留' } });
  vi.stubGlobal('mystApi', { ai: { contextUsage: getUsage, compressContext: compress, onContextChanged: () => () => {}, onStatusChanged: () => () => {} } });
  render(<QueryClientProvider client={new QueryClient()}><I18nProvider dictionary={locale}><ContextUsageBar draft="尚未发送的问题" /></I18nProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('≈ 75%')).toBeInTheDocument());
  expect(getUsage).toHaveBeenCalledWith('s1', '尚未发送的问题');
  getUsage.mockResolvedValue({ ok: true, data: usage(35) });
  fireEvent.click(screen.getByRole('button', { name: '压缩上下文' }));
  await waitFor(() => expect(screen.getByText('≈ 35%')).toBeInTheDocument());
  expect(compress).toHaveBeenCalledWith('s1');
  expect(screen.getByText('完整记录与引用已保留')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '压缩上下文' })).not.toBeInTheDocument();
});
test('filters notifications by session and blocks manual compression during generation', () => {
  resetAiStreamStoreForTests(); aiStreamStore.setState({ activeSessionId: 's1', active: true });
  let handler: (event: ContextEvent) => void = () => {};
  vi.stubGlobal('mystApi', { ai: { onContextChanged: (fn: typeof handler) => { handler = fn; return () => {}; }, onStatusChanged: () => () => {} } });
  render(<QueryClientProvider client={new QueryClient()}><I18nProvider dictionary={locale}><ContextUsageBar draft="" /></I18nProvider></QueryClientProvider>);
  act(() => handler({ sessionId: 'other', usage: usage(90), message: '不属于当前会话' }));
  expect(screen.queryByText('不属于当前会话')).not.toBeInTheDocument();
  act(() => handler({ sessionId: 's1', usage: usage(90), compression: 'done', message: '已自动压缩' }));
  expect(screen.getByRole('button', { name: '压缩上下文' })).toBeDisabled();
  expect(screen.getByText('已自动压缩')).toBeInTheDocument();
});

test('a new reply clears the previous context notice while new compression events remain visible', () => {
  resetAiStreamStoreForTests(); aiStreamStore.setState({ activeSessionId: 's1' });
  let handler: (event: ContextEvent) => void = () => {};
  vi.stubGlobal('mystApi', { ai: { onContextChanged: (fn: typeof handler) => { handler = fn; return () => {}; }, onStatusChanged: () => () => {} } });
  render(<QueryClientProvider client={new QueryClient()}><I18nProvider dictionary={locale}><ContextUsageBar draft="" /></I18nProvider></QueryClientProvider>);
  act(() => handler({ sessionId: 's1', compression: 'error', message: '上一轮错误' }));
  expect(screen.getByText('上一轮错误')).toBeInTheDocument();
  act(() => aiStreamStore.setState({ active: true }));
  expect(screen.queryByText('上一轮错误')).not.toBeInTheDocument();
  act(() => handler({ sessionId: 's1', compression: 'running', message: '本轮正在压缩' }));
  expect(screen.getByText('本轮正在压缩')).toBeInTheDocument();
});

test('a compression finishing after switching sessions does not replace the new session usage', async () => {
  resetAiStreamStoreForTests(); aiStreamStore.setState({ activeSessionId: 's1' });
  let release: (value: unknown) => void = () => {};
  vi.stubGlobal('mystApi', { ai: {
    contextUsage: vi.fn(async (id: string) => ({ ok: true, data: usage(id === 's1' ? 75 : 45) })),
    compressContext: vi.fn(() => new Promise((resolve) => { release = resolve; })),
    onContextChanged: () => () => {}, onStatusChanged: () => () => {},
  } });
  render(<QueryClientProvider client={new QueryClient()}><I18nProvider dictionary={locale}><ContextUsageBar draft="" /></I18nProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('≈ 75%')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '压缩上下文' }));
  act(() => aiStreamStore.setState({ activeSessionId: 's2' }));
  await waitFor(() => expect(screen.getByText('≈ 45%')).toBeInTheDocument());
  await act(async () => release({ ok: true, data: { usage: usage(10), changed: true, message: '旧会话压缩完成' } }));
  expect(screen.getByText('≈ 45%')).toBeInTheDocument();
  expect(screen.queryByText('旧会话压缩完成')).not.toBeInTheDocument();
});
