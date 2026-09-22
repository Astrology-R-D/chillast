import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { Composer } from './Composer';

const dictionary = {
  ai: {
    inputPlaceholder: '输入问题…', send: '发送', stop: '停止', attach: '添加附件', inputBox: '消息输入',
    attachmentTooLarge: '附件超过 200KB 上限', attachmentReadFailed: '附件读取失败',
    removeAttachment: '移除附件', attachments: '附件', toolRunning: '运行中…',
  },
};

function renderComposer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  return render(<I18nProvider dictionary={dictionary}>
    <Composer onSend={vi.fn()} onStop={vi.fn()} {...props} />
  </I18nProvider>);
}

beforeEach(() => {
  resetAiStreamStoreForTests();
});

test('Enter sends the text; Shift+Enter inserts a newline', async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  renderComposer({ onSend });
  const input = screen.getByRole('textbox', { name: '消息输入' });
  await user.type(input, '第一行{Shift>}{Enter}{/Shift}第二行');
  expect(onSend).not.toHaveBeenCalled();
  await user.type(input, '{Enter}');
  expect(onSend).toHaveBeenCalledWith('第一行\n第二行', []);
  expect(input).toHaveValue('');
});

test('empty input does not send and disabled state blocks typing', async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  const { rerender } = renderComposer({ onSend });
  const input = screen.getByRole('textbox', { name: '消息输入' });
  await user.type(input, '{Enter}');
  expect(onSend).not.toHaveBeenCalled();
  rerender(<I18nProvider dictionary={dictionary}><Composer onSend={onSend} onStop={vi.fn()} disabled /></I18nProvider>);
  expect(screen.getByRole('textbox', { name: '消息输入' })).toBeDisabled();
});

test('stop button replaces send while streaming and calls onStop', async () => {
  const user = userEvent.setup();
  const onStop = vi.fn();
  renderComposer({ onStop });
  act(() => { aiStreamStore.setState({ active: true }); });
  expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '停止' }));
  expect(onStop).toHaveBeenCalledTimes(1);
});

test('text attachments are read, previewed inline, removable, and sent with the message', async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  renderComposer({ onSend });
  const file = new File(['附件内容'], 'notes.txt', { type: 'text/plain' });
  await user.upload(screen.getByLabelText('添加附件'), file);
  expect(await screen.findByText('notes.txt')).toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: '消息输入' });
  await user.type(input, '看看这个{Enter}');
  expect(onSend).toHaveBeenCalledWith('看看这个', [{ name: 'notes.txt', content: '附件内容' }]);
});

test('attachments over 200KB are rejected with an inline error', async () => {
  const user = userEvent.setup();
  renderComposer();
  const big = new File(['x'], 'big.txt', { type: 'text/plain' });
  Object.defineProperty(big, 'size', { value: 200 * 1024 + 1 });
  await user.upload(screen.getByLabelText('添加附件'), big);
  expect(await screen.findByText(/200KB 上限/)).toBeInTheDocument();
  expect(screen.queryByText('big.txt')).not.toBeInTheDocument();
});

test('status chip shows provider·model and gains tool activity while calling', () => {
  renderComposer({ statusChip: 'OpenAI · gpt-test' });
  expect(screen.getByText('OpenAI · gpt-test')).toBeInTheDocument();
  expect(screen.queryByText(/运行中/)).not.toBeInTheDocument();
  act(() => {
    aiStreamStore.setState({ active: true, segments: [{ kind: 'tool', event: { tool: 'x', status: 'calling', argsDigest: '', resultExcerpt: '', requiresConfirmation: false } }] });
  });
  expect(screen.getByText(/运行中…/)).toBeInTheDocument();
});
