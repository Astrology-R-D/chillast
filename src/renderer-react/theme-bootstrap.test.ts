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

test('applies defaults when localStorage access is denied', () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access denied', 'SecurityError');
    },
  });

  try {
    expect(() => window.eval(bootstrapScript)).not.toThrow();
  } finally {
    if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
  }

  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system');
  expect(document.documentElement).toHaveAttribute('data-density', 'compact');
});

test('applies defaults when localStorage methods throw', () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const throwingStorage = {
    getItem() {
      throw new DOMException('Access denied', 'SecurityError');
    },
    setItem() {
      throw new DOMException('Quota denied', 'QuotaExceededError');
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: throwingStorage,
  });

  try {
    expect(() => window.eval(bootstrapScript)).not.toThrow();
  } finally {
    if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
  }

  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system');
  expect(document.documentElement).toHaveAttribute('data-density', 'compact');
});
