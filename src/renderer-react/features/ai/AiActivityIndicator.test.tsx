import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import locale from '../../../../locale/zh.json';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { MessageList } from './MessageList';

beforeEach(() => { resetAiStreamStoreForTests(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); resetAiStreamStoreForTests(); });
test('a reply has visible status before any text, shows real tool topics and then the writing phase', () => {
  aiStreamStore.setState({ active: true, stage: 'analysis', startedAt: Date.now(), activity: { phase: 'analysis', topic: '火星与土星的相位问题' } });
  render(<I18nProvider dictionary={locale}><MessageList messages={[]} /></I18nProvider>);
  expect(screen.getByText('正在核对盘面与知识来源')).toBeInTheDocument();
  expect(screen.getByText('火星与土星的相位问题')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getByText('3s')).toBeInTheDocument();
  act(() => aiStreamStore.getState().consumeStreamEvent({ type: 'tool-call', data: { tool: 'search_knowledge', status: 'calling', callId: 'k', args: '{"query":"火星刑土星"}', argsDigest: '', resultExcerpt: '', requiresConfirmation: false } }));
  expect(screen.getByText('正在检索知识库')).toBeInTheDocument();
  expect(screen.getByText('火星刑土星')).toBeInTheDocument();
  expect(screen.getByText('已完成 0 / 1 项工具')).toBeInTheDocument();
  act(() => {
    aiStreamStore.getState().consumeStreamEvent({ type: 'tool-call', data: { tool: 'search_knowledge', status: 'done', callId: 'k', argsDigest: '', resultExcerpt: '', requiresConfirmation: false } });
    aiStreamStore.getState().consumeStreamEvent({ type: 'activity', data: { phase: 'answer' } });
  });
  expect(screen.getByText('正在组织并输出回答')).toBeInTheDocument();
  expect(screen.getByText('已完成 1 / 1 项工具')).toBeInTheDocument();
  act(() => aiStreamStore.setState({ active: false }));
  expect(screen.queryByText('正在组织并输出回答')).not.toBeInTheDocument();
});
