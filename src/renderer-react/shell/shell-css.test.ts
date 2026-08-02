import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer-react/shell/shell.css'), 'utf8');
const dirtyCss = readFileSync(resolve(process.cwd(), 'src/renderer-react/shell/dirty-navigation.css'), 'utf8');

test('keeps the dirty-navigation background fitted to and clipped by the root', () => {
  const background = dirtyCss.match(/\.dirty-navigation__background\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(background).toMatch(/width:\s*100%/);
  expect(background).toMatch(/height:\s*100%/);
  expect(background).toMatch(/min-width:\s*0/);
  expect(background).toMatch(/min-height:\s*0/);
  expect(background).toMatch(/overflow:\s*hidden/);
});

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

test('styles shell navigation, stable controls, placeholder, and AI status without gradients', () => {
  expect(css).toMatch(/\.shell-nav__button\[data-active='true'\]/);
  expect(css).toMatch(/\.workspace__appearance\s+select\s*\{[^}]*height:\s*var\(--control-height\)/s);
  expect(css).toMatch(/\.workspace__header\s*\{[^}]*flex-wrap:\s*wrap/s);
  expect(css).toMatch(/\.ai-status__state\[data-configured='true'\]/);
  expect(css).toContain('.workspace__placeholder');
  expect(css).not.toMatch(/gradient\s*\(/i);
  expect(css).not.toMatch(/letter-spacing:\s*-/);
});

test('hides rail text while route buttons retain accessible names', () => {
  expect(css).toMatch(/\.shell__navigation--rail \.shell-nav__label[^{]*\{[^}]*display:\s*none/s);
  expect(css).toMatch(/\.shell__navigation--rail \.shell-nav__group[^{]*\{[^}]*display:\s*none/s);
});
