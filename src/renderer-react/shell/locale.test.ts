import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { ROUTES } from './routes';

const source = readFileSync(resolve(process.cwd(), 'locale/zh.json'), 'utf8');
const dictionary = JSON.parse(source) as Record<string, unknown>;

function resolveKey(key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined,
  dictionary);
}

test('parses the locale and resolves every route metadata key without fallback', () => {
  expect(() => JSON.parse(source)).not.toThrow();
  for (const route of ROUTES) {
    for (const key of [route.labelKey, route.titleKey, route.groupKey]) {
      expect(resolveKey(key), key).toEqual(expect.any(String));
      expect(resolveKey(key), key).not.toBe(key);
    }
  }
});

test('contains the complete shell appearance vocabulary and localized settings label', () => {
  expect(resolveKey('nav.settings')).toBe('设置');
  for (const key of [
    'shell.loading', 'shell.placeholder', 'shell.theme', 'shell.density', 'shell.aiConfigured',
    'shell.aiNotConfigured', 'shell.retry', 'shell.knowledgeCount', 'appearance.system',
    'appearance.light', 'appearance.dark', 'appearance.compact', 'appearance.comfortable',
  ]) {
    expect(resolveKey(key), key).toEqual(expect.any(String));
  }
});
