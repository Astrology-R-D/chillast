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

test('places the primary marker in a stable nonshrinking cell outside clamped overflow', () => {
  expect(css).toMatch(/\.profile-row__identity\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
  const marker = [...css.matchAll(/\.profile-row__marker[^\{]*\{([^}]*)\}/g)].map((match) => match[1]).join(' ');
  expect(marker).toContain('flex-shrink: 0');
  expect(marker).toContain('overflow: visible');
});

test('keeps profile forms dense, tokenized, wrapping, and responsive without nested cards', () => {
  expect(css).toMatch(/\.profile-form\s*\{[^}]*max-width:[^;}]+;[^}]*padding:/s);
  expect(css).toMatch(/\.profile-form__segments\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s);
  expect(css).toMatch(/\.profile-field__error[^{]*\{[^}]*overflow-wrap:\s*anywhere/s);
  expect(css).toMatch(/\.profile-form input[^{]*\{[^}]*background:\s*var\(--surface-base\)/s);
  expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.profile-form__segments\s*\{[^}]*grid-template-columns:/s);
  expect(css).not.toMatch(/\.profile-form[^,{]*\.\w*card/);
});

test('uses token-sized segmented steppers and a two-column coordinate row', () => {
  expect(css).toMatch(/\.profile-segment__steppers button\s*\{[^}]*height:\s*calc\(var\(--control-height\)\s*\/\s*2\)/s);
  expect(css).toMatch(/\.profile-segment__control\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--control-height\)/s);
  expect(css).toMatch(/\.location-picker__coordinates\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  const mobile = css.match(/@media \(max-width:\s*760px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? '';
  expect(mobile).toMatch(/\.location-picker__coordinates\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
