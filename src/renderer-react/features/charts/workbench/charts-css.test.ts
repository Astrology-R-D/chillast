import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer-react/features/charts/workbench/charts.css'), 'utf8');

test('sizes workbench from its parent grid without percentage height', () => {
  const rule = css.match(/\.chart-workbench\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(rule).toContain('grid-template-rows: auto minmax(0, 1fr)');
  expect(rule).toContain('min-height: 0');
  expect(rule).toContain('overflow: hidden');
  expect(rule).not.toContain('height: 100%');
});

test('bounds relocation results and popovers to viewport-safe scrolling blocks', () => {
  expect(css).toMatch(/\.relocation-picker__list\s*\{[^}]*max-block-size:\s*min\([^}]*overflow:\s*auto/s);
  expect(css).toMatch(/\.chart-popover\s*\{[^}]*max-block-size:\s*min\([^}]*overflow:\s*auto/s);
});
