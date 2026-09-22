import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MarkdownMessage } from './MarkdownMessage';

test('renders GFM tables, code fences, and external-safe links', () => {
  render(<MarkdownMessage content={[
    '| 行星 | 星座 |',
    '| --- | --- |',
    '| 太阳 | 白羊 |',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '[文档](https://example.com/docs)',
  ].join('\n')} />);

  const table = screen.getByRole('table');
  expect(table).toHaveTextContent('太阳');
  const code = screen.getByText(/const x = 1;/);
  expect(code.tagName).toBe('CODE');
  const link = screen.getByRole('link', { name: '文档' });
  expect(link).toHaveAttribute('href', 'https://example.com/docs');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
