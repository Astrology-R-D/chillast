import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';

const bootstrapScript = readFileSync(
  resolve(process.cwd(), 'src/renderer-react/public/theme-bootstrap.js'),
  'utf8',
);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-preference');
  document.documentElement.removeAttribute('data-density');
  document.documentElement.style.colorScheme = '';
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
});

test('normalizes and persists invalid theme preferences and density', () => {
  localStorage.setItem('chillast.theme', 'sepia');
  localStorage.setItem('chillast.density', 'spacious');

  window.eval(bootstrapScript);

  expect(localStorage.getItem('chillast.theme')).toBe('system');
  expect(localStorage.getItem('chillast.density')).toBe('compact');
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system');
  expect(document.documentElement).toHaveAttribute('data-density', 'compact');
  expect(document.documentElement.style.colorScheme).toBe('dark');
});

test('persists defaults when theme preferences are missing', () => {
  window.eval(bootstrapScript);

  expect(localStorage.getItem('chillast.theme')).toBe('system');
  expect(localStorage.getItem('chillast.density')).toBe('compact');
});
