import { describe, expect, test } from 'vitest';
import { buildChatMessageContent, lastUserMessageIndex } from './chatMessage';

describe('buildChatMessageContent', () => {
  test('appends attachments as markdown quote blocks after the user text', () => {
    expect(buildChatMessageContent('帮我分析', [
      { name: 'notes.txt', content: '第一行\n第二行' },
    ])).toBe('帮我分析\n\n> **附件：notes.txt**\n> 第一行\n> 第二行');
  });

  test('numbers multiple attachments and handles empty text', () => {
    expect(buildChatMessageContent('', [
      { name: 'a.txt', content: 'A' },
      { name: 'b.txt', content: 'B' },
    ])).toBe('> **附件 1：a.txt**\n> A\n\n> **附件 2：b.txt**\n> B');
  });

  test('plain text passes through unchanged', () => {
    expect(buildChatMessageContent('只有文字', [])).toBe('只有文字');
  });
});

describe('lastUserMessageIndex', () => {
  const messages = [
    { role: 'user', content: '一' },
    { role: 'ai', content: '答一' },
    { role: 'user', content: '二' },
    { role: 'ai', content: '答二' },
  ];
  test('finds the last user message', () => {
    expect(lastUserMessageIndex(messages)).toBe(2);
  });
  test('returns -1 when there is none', () => {
    expect(lastUserMessageIndex([{ role: 'ai', content: 'x' }])).toBe(-1);
  });
  test('an ai message after the last user still points at the user message', () => {
    expect(lastUserMessageIndex([
      { role: 'user', content: '一' },
      { role: 'ai', content: '答' },
      { role: 'ai', content: '补' },
    ])).toBe(0);
  });
});
