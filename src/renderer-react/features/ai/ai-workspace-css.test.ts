import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer-react/features/ai/ai-workspace.css'), 'utf8');

test('workspace fills the ai panel as a column with a bounded message list', () => {
  expect(css).toMatch(/\.ai-workspace\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0/s);
  expect(css).toMatch(/\.ai-workspace__body\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  expect(css).toMatch(/\.message-list\s*\{[^}]*min-height:\s*0/s);
  expect(css).toMatch(/\.message-list__scroller\s*\{[^}]*overflow-y:\s*auto[^}]*min-height:\s*0/s);
});

test('chat fills its column and session history scrolls in an independent drawer', () => {
  expect(css).toMatch(/\.ai-workspace__content\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  expect(css).toMatch(/\.session-drawer\s*\{[^}]*position:\s*fixed[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
  expect(css).toMatch(/\.session-rail\s*\{[^}]*overflow-y:\s*auto/s);
});

test('composer input autogrows inside a capped band and hover actions stay non-layout', () => {
  expect(css).toMatch(/\.composer__input\s*\{[^}]*max-height:\s*120px[^}]*resize:\s*none/s);
  expect(css).toMatch(/\.message-item__actions\s*\{[^}]*opacity:\s*0/s);
  expect(css).toMatch(/\.message-item:hover\s+\.message-item__actions[^{]*\{[^}]*opacity:\s*1/s);
  expect(css).toMatch(/\.message-item__actions\[data-disabled='true'\][^{]*\{[^}]*pointer-events:\s*none/s);
});

test('tool cards, truncation notice, and back-to-latest affordances are visually distinct', () => {
  expect(css).toMatch(/\.tool-card--calling\s*\{[^}]*opacity:/s);
  expect(css).toMatch(/\.tool-card--done\s*\{[^}]*opacity:/s);
  expect(css).toMatch(/\.message-list__truncated\s*\{[^}]*border/s);
  expect(css).toMatch(/\.message-list__back-to-latest\s*\{[^}]*position:\s*absolute/s);
});
