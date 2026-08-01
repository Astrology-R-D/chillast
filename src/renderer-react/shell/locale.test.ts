import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTree, type Node as JsonNode } from 'jsonc-parser';
import { expect, test } from 'vitest';
import { ROUTES } from './routes';

const source = readFileSync(resolve(process.cwd(), 'locale/zh.json'), 'utf8');
const dictionary = JSON.parse(source) as Record<string, unknown>;

function findDuplicateObjectKeys(json: string): string[] {
  const root = parseTree(json);
  const duplicates: string[] = [];

  function visit(node: JsonNode | undefined, path: string): void {
    if (!node) return;
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key = String(property.children?.[0]?.value);
        const propertyPath = path ? `${path}.${key}` : key;
        if (keys.has(key)) duplicates.push(propertyPath);
        keys.add(key);
        visit(property.children?.[1], propertyPath);
      }
      return;
    }
    for (const child of node.children ?? []) visit(child, path);
  }

  visit(root, '');
  return duplicates;
}

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

test('contains the exact shell localization contract', () => {
  expect(Object.fromEntries([
    'nav.settings', 'shell.loading', 'shell.placeholder', 'shell.theme', 'shell.density',
    'shell.aiConfigured', 'shell.aiNotConfigured', 'shell.retry', 'shell.knowledgeCount',
    'shell.openAi', 'shell.closeAi', 'shell.resizeNavigation', 'shell.resizeAi',
    'shell.navigationRegion', 'shell.workspaceRegion', 'shell.aiRegion',
    'appearance.system', 'appearance.light', 'appearance.dark', 'appearance.compact',
    'appearance.comfortable',
  ].map((key) => [key, resolveKey(key)]))).toEqual({
    'nav.settings': '设置',
    'shell.loading': '正在读取状态…',
    'shell.placeholder': '{{title}}将在后续迁移阶段启用',
    'shell.theme': '主题',
    'shell.density': '密度',
    'shell.aiConfigured': 'AI 已配置',
    'shell.aiNotConfigured': 'AI 未配置',
    'shell.retry': '重试',
    'shell.knowledgeCount': '知识库：{{count}} 篇文档',
    'shell.openAi': '打开 AI 助手',
    'shell.closeAi': '关闭 AI 助手',
    'shell.resizeNavigation': '调整导航栏宽度',
    'shell.resizeAi': '调整 AI 栏宽度',
    'shell.navigationRegion': '主导航',
    'shell.workspaceRegion': '工作区',
    'shell.aiRegion': 'AI 助手',
    'appearance.system': '跟随系统',
    'appearance.light': '亮色',
    'appearance.dark': '深色',
    'appearance.compact': '紧凑',
    'appearance.comfortable': '均衡',
  });
});

test('detects duplicate keys structurally and keeps the locale duplicate-free', () => {
  expect(findDuplicateObjectKeys('{"outer":{"value":1,"value":2}}')).toEqual(['outer.value']);
  expect(findDuplicateObjectKeys(source)).toEqual([]);
});

test('contains the exact profile management localization contract', () => {
  const keys = [
    'profiles.directory', 'profiles.search', 'profiles.recent', 'profiles.recentAll',
    'profiles.recent7d', 'profiles.recent30d', 'profiles.sort', 'profiles.sortUpdated',
    'profiles.sortName', 'profiles.sortBirth', 'profiles.sortRecent', 'profiles.primary',
    'profiles.setPrimary', 'profiles.copy', 'profiles.deleteTitle', 'profiles.deleteConfirm',
    'profiles.openNatal', 'profiles.openTransit', 'profiles.openSynastry', 'profiles.loading',
    'profiles.retryLoad', 'profiles.noResults', 'profiles.tags', 'profiles.coordinates',
    'profiles.createdAt', 'profiles.updatedAt', 'profiles.genderMale', 'profiles.genderFemale',
    'profiles.genderOther',
  ];
  for (const key of keys) expect(resolveKey(key), key).toEqual(expect.any(String));
});

test('profile React source never uses the native confirm dialog', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer-react/features/profiles/ProfilePage.tsx'), 'utf8');
  expect(source).not.toMatch(/window\.confirm|\bconfirm\s*\(/);
});
