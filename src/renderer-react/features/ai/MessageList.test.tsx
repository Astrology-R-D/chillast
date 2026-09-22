import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { MessageList } from './MessageList';

const dictionary = {
  ai: {
    copy: '复制', quote: '引用', editResend: '编辑重发', resend: '重发', cancelEdit: '取消',
    fork: '从此处分支', regenerate: '重新生成', editMessage: '编辑消息',
    backToLatest: '↓ 回到最新', truncated: '⚠️ 输出因达到 Token 上限被截断，可在设置中调高「最大 Token 数」',
    retrySend: '重试', streamError: '请求失败',
    messagesRegion: '对话消息', noMessages: '会话暂无消息', toolRunning: '运行中…', toolDone: '完成',
  },
};

function renderList(props: Partial<Parameters<typeof MessageList>[0]> = {}) {
  return render(<I18nProvider dictionary={dictionary}>
    <MessageList
      messages={[
        { role: 'user', content: '第一条' },
        { role: 'ai', content: '回复一' },
      ]}
      onCopy={vi.fn()} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()}
      onRegenerate={vi.fn()} onRetry={vi.fn()}
      {...props}
    />
  </I18nProvider>);
}

beforeEach(() => {
  resetAiStreamStoreForTests();
});

test('renders history through MessageItem and an empty state when there are no messages', () => {
  const { rerender } = renderList({ messages: [] });
  expect(screen.getByText('会话暂无消息')).toBeInTheDocument();
  rerender(<I18nProvider dictionary={dictionary}>
    <MessageList messages={[{ role: 'user', content: '你好' }]}
      onCopy={vi.fn()} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()}
      onRegenerate={vi.fn()} onRetry={vi.fn()} />
  </I18nProvider>);
  expect(screen.getByText('你好')).toBeInTheDocument();
});

test('streams: local user preview, markdown text, tool cards, truncation, and done cleanup', () => {
  aiStreamStore.setState({
    active: true, streamKind: 'chat', localUserMessage: { role: 'user', content: '流中问题', attachments: [] },
    segments: [
      { kind: 'text', content: '正在回答' },
      { kind: 'tool', event: { tool: 'search_knowledge', status: 'calling', argsDigest: 'q=火星', resultExcerpt: '', requiresConfirmation: false } },
      { kind: 'tool', event: { tool: 'search_knowledge', status: 'done', argsDigest: 'q=火星', resultExcerpt: '《行星落宫》摘录', requiresConfirmation: false } },
    ],
    truncated: true,
  });
  renderList();
  expect(screen.getByText('流中问题')).toBeInTheDocument();
  expect(screen.getByText('正在回答')).toBeInTheDocument();
  expect(screen.getByText('search_knowledge')).toBeInTheDocument();
  expect(screen.getByText('q=火星')).toBeInTheDocument();
  expect(screen.getByText('《行星落宫》摘录')).toBeInTheDocument();
  expect(screen.getByText(/Token 上限被截断/)).toBeInTheDocument();
});

test('error row offers inline retry', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  aiStreamStore.setState({ error: '网关超时' });
  renderList({ onRetry });
  expect(screen.getByText(/网关超时/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('scroll pause surfaces the back-to-latest button and resumes on click', async () => {
  const user = userEvent.setup();
  renderList();
  expect(screen.queryByRole('button', { name: '↓ 回到最新' })).not.toBeInTheDocument();
  act(() => { aiStreamStore.setState({ autoScrollPaused: true }); });
  expect(screen.getByRole('button', { name: '↓ 回到最新' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '↓ 回到最新' }));
  expect(aiStreamStore.getState().autoScrollPaused).toBe(false);
});

test('scrolling near the bottom keeps follow mode; away from it pauses', () => {
  renderList();
  const scroller = screen.getByRole('log', { name: '对话消息' }) as HTMLElement;
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
  scroller.scrollTop = 480;
  scroller.dispatchEvent(new Event('scroll'));
  expect(aiStreamStore.getState().autoScrollPaused).toBe(false);
  scroller.scrollTop = 100;
  scroller.dispatchEvent(new Event('scroll'));
  expect(aiStreamStore.getState().autoScrollPaused).toBe(true);
});
