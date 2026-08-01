import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer-react/shell/shell.css'), 'utf8');

test('uses an opaque panel fallback and enables translucency only with backdrop support', () => {
  const panelBlock = css.match(
    /\.shell__navigation,\s*\.shell__ai,\s*\.shell__ai-overlay\s*\{([^}]*)\}/,
  )?.[1];

  expect(panelBlock).toContain('background: var(--surface-raised)');
  expect(panelBlock).not.toContain('var(--surface-panel)');
  expect(css).toContain(
    '@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))',
  );
  expect(css).toMatch(/@supports[\s\S]*background:\s*var\(--surface-panel\)/);
  expect(css).toMatch(/@supports[\s\S]*-webkit-backdrop-filter:\s*blur\(8px\)/);
  expect(css).toMatch(/@supports[\s\S]*backdrop-filter:\s*blur\(8px\)/);
});

test('keeps the narrow rail and AI overlay geometry stable', () => {
  expect(css).toMatch(/grid-template-columns:\s*56px minmax\(0, 1fr\)/);
  expect(css).toMatch(/\.shell__navigation--rail\s*\{[^}]*min-width:\s*56px/s);
  expect(css).toMatch(/\.shell__ai-overlay\s*\{[^}]*width:\s*min\(420px, calc\(100vw - 56px\)\)/s);
});
