import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer-react/features/profiles/profiles.css'), 'utf8');

test('uses the density control token for every marked profile control without fixed control heights', () => {
  expect(css).toMatch(/\[data-profile-control\]\s*\{[^}]*height:\s*var\(--control-height\)/s);
  expect(css).not.toMatch(/(?:profile-icon-button|profile-search__input|profile-search__input input|profile-directory__selects select|profile-state button|profile-dialog button|profile-detail__commands button)[^{]*\{[^}]*\b(?:min-)?height:\s*(?:32|36)px/s);
});

test('clamps row names, secondary names, and locations to two wrapping lines with stable row geometry', () => {
  for (const selector of ['.profile-row__name', '.profile-row__secondary', '.profile-row__location']) {
    const rule = css.match(new RegExp(`${selector.replace('.', '\\\.')}[^\\{]*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule, selector).toContain('overflow-wrap: anywhere');
    expect(rule, selector).toContain('-webkit-line-clamp: 2');
    expect(rule, selector).not.toContain('white-space: nowrap');
  }
  expect(css).toMatch(/\.profile-row\s*\{[^}]*min-height:[^;}]+;[^}]*max-height:/s);
});
