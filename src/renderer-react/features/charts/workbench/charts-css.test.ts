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

test('keeps the interactive wheel square, nonzero, and clear of fixed density controls', () => {
  expect(css).toMatch(/\.interactive-chart\s*\{[^}]*min-height:\s*320px[^}]*padding-top:/s);
  expect(css).toMatch(/\.interactive-chart\s*\{[^}]*container-type:\s*size/s);
  expect(css).toMatch(/\.interactive-chart__svg\s*\{[^}]*width:\s*min\(100%,\s*100cqh\)/s);
  expect(css).toMatch(/\.interactive-chart__svg\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0/s);
  expect(css).toMatch(/\.interactive-chart__svg\s+svg\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*aspect-ratio:\s*1/s);
  expect(css).toMatch(/data-density='compact'[^}]*--chart-control-size:\s*32px/s);
  expect(css).toMatch(/data-density='comfortable'[^}]*--chart-control-size:\s*36px/s);
  expect(css).toMatch(/\.chart-toolbar__button\s*\{[^}]*width:\s*var\(--chart-control-size\)[^}]*height:\s*var\(--chart-control-size\)/s);
  expect(css).toMatch(/\.chart-result__chart-pane[^}]*overflow:\s*hidden/s);
});

test('uses distinct non-color hover, focus, and ring encodings', () => {
  expect(css).toMatch(/data-hovered='true'[^}]*opacity:/s);
  expect(css).toMatch(/data-focused='true'[^}]*filter:/s);
  expect(css).toMatch(/data-ring-style='1'[^}]*stroke-dasharray:/s);
  expect(css).toMatch(/data-theme='light'[^}]*data-focused/s);
  expect(css).toMatch(/data-theme='dark'[^}]*data-focused/s);
});

test('defines a dense stable virtual explorer with confined overflow and non-color states', () => {
  expect(css).toMatch(/\.chart-data-explorer\s*\{[^}]*grid-template-rows:[^}]*minmax\(0,\s*1fr\)/s);
  expect(css).toMatch(/\.chart-data-grid\s*\{[^}]*height:\s*100%[^}]*overflow:\s*auto/s);
  expect(css).toMatch(/\.chart-data-grid__header\s*\{[^}]*position:\s*sticky[^}]*height:\s*var\(--grid-header-height\)/s);
  expect(css).toMatch(/\.chart-data-grid__row\s*\{[^}]*height:\s*var\(--row-height\)/s);
  expect(css).toMatch(/data-pinned[^}]*box-shadow:/s);
  expect(css).toMatch(/data-active[^}]*outline:/s);
  expect(css).toMatch(/data-selected[^}]*border-inline-start:/s);
  expect(css).toMatch(/data-focused[^}]*text-decoration:/s);
  expect(css).toMatch(/\.chart-data-explorer__toolbar\s*\{[^}]*flex-wrap:\s*wrap/s);
  expect(css).toMatch(/\.chart-result__data-pane\s*\{[^}]*overflow:\s*hidden/s);
});
