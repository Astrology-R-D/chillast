import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { MarkdownMessage } from './MarkdownMessage';
import { MessageItem } from './MessageItem';

const dictionary = {
  ai: {
    copy: '复制', quote: '引用', editResend: '编辑重发', resend: '重发', cancelEdit: '取消',
    fork: '从此处分支', regenerate: '重新生成', editMessage: '编辑消息',
  },
};

function renderItem(props: Partial<Parameters<typeof MessageItem>[0]> = {}) {
  return render(<I18nProvider dictionary={dictionary}>
    <MessageItem
      index={0}
      message={{ role: 'user', content: '原问题' }}
      onCopy={vi.fn()} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()}
      {...props}
    />
  </I18nProvider>);
}

test('user message shows copy, quote, edit-resend, and fork actions and forwards callbacks', async () => {
  const user = userEvent.setup();
  const onCopy = vi.fn(); const onQuote = vi.fn(); const onEditResend = vi.fn(); const onFork = vi.fn();
  renderItem({ onCopy, onQuote, onEditResend, onFork });
  await user.click(screen.getByRole('button', { name: '复制' }));
  expect(onCopy).toHaveBeenCalledWith('原问题');
  await user.click(screen.getByRole('button', { name: '引用' }));
  expect(onQuote).toHaveBeenCalledWith('原问题');
  await user.click(screen.getByRole('button', { name: '从此处分支' }));
  expect(onFork).toHaveBeenCalledWith(0);
  await user.click(screen.getByRole('button', { name: '编辑重发' }));
  const editor = screen.getByRole('textbox', { name: '编辑消息' });
  await user.clear(editor);
  await user.type(editor, '改写后');
  await user.click(screen.getByRole('button', { name: '重发' }));
  expect(onEditResend).toHaveBeenCalledWith(0, '改写后');
});

test('edit can be cancelled and keeps the original render', async () => {
  const user = userEvent.setup();
  renderItem();
  await user.click(screen.getByRole('button', { name: '编辑重发' }));
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('textbox', { name: '编辑消息' })).not.toBeInTheDocument();
  expect(screen.getByText('原问题')).toBeInTheDocument();
});

test('assistant message renders markdown, shows regenerate only when provided, and disables actions while streaming', async () => {
  const user = userEvent.setup();
  const onRegenerate = vi.fn();
  const onCopy = vi.fn();
  render(<I18nProvider dictionary={dictionary}>
    <MessageItem index={1} message={{ role: 'ai', content: '**加粗**回复' }}
      onCopy={onCopy} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()} onRegenerate={onRegenerate} />
  </I18nProvider>);
  expect(screen.getByText('加粗').tagName).toBe('STRONG');
  await user.click(screen.getByRole('button', { name: '重新生成' }));
  expect(onRegenerate).toHaveBeenCalledTimes(1);
});

test('attachments render as name chips', () => {
  renderItem({ message: { role: 'user', content: '见附件', attachments: [{ name: 'notes.txt', content: 'A' }] } });
  expect(screen.getByText('notes.txt')).toBeInTheDocument();
});
