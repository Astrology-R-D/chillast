import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';

test('renders the React renderer bootstrap', async () => {
  document.body.innerHTML = '<div id="root"></div>';

  await import('./main');

  expect(await screen.findByRole('main', { name: 'CHILLAST React renderer' })).toHaveTextContent(
    'React renderer bootstrap',
  );
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system');
  expect(document.documentElement).toHaveAttribute('data-density', 'compact');
});
