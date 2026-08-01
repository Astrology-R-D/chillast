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

test('contains exact canonical Task 5 profile strings', () => {
  expect(Object.fromEntries([
    'profiles.directory', 'profiles.search', 'profiles.recentFilter', 'profiles.allProfiles',
    'profiles.used7d', 'profiles.used30d', 'profiles.sort', 'profiles.sortUpdated',
    'profiles.sortName', 'profiles.sortBirth', 'profiles.sortRecent', 'profiles.primary',
    'profiles.setPrimary', 'profiles.duplicate', 'profiles.deleteTitle', 'profiles.confirmDelete',
    'profiles.openNatal', 'profiles.openTransit', 'profiles.openRelationship',
    'profiles.loadFailed', 'profiles.retry', 'profiles.noResults', 'profiles.tags',
    'profiles.coordinates', 'profiles.createdAt', 'profiles.updatedAt',
    'profiles.savedRefreshFailed', 'profiles.deletedRefreshFailed',
    'profiles.savedProfileMissing', 'profiles.deletedProfilePresent', 'profiles.retryRefresh',
    'profiles.deletePending',
  ].map((key) => [key, resolveKey(key)]))).toEqual({
    'profiles.directory': '档案目录',
    'profiles.search': '搜索档案',
    'profiles.recentFilter': '最近使用',
    'profiles.allProfiles': '全部档案',
    'profiles.used7d': '最近 7 天',
    'profiles.used30d': '最近 30 天',
    'profiles.sort': '排序方式',
    'profiles.sortUpdated': '最近更新',
    'profiles.sortName': '姓名',
    'profiles.sortBirth': '出生时间',
    'profiles.sortRecent': '最近使用',
    'profiles.primary': '主档案',
    'profiles.setPrimary': '设为主档案',
    'profiles.duplicate': '复制档案',
    'profiles.deleteTitle': '删除档案',
    'profiles.confirmDelete': '确认删除',
    'profiles.openNatal': '打开本命盘',
    'profiles.openTransit': '打开行运盘',
    'profiles.openRelationship': '打开比较盘',
    'profiles.loadFailed': '档案加载失败：{{message}}',
    'profiles.retry': '重试',
    'profiles.noResults': '没有符合筛选条件的档案',
    'profiles.tags': '标签',
    'profiles.coordinates': '坐标',
    'profiles.createdAt': '创建时间',
    'profiles.updatedAt': '更新时间',
    'profiles.savedRefreshFailed': '档案已保存，但刷新失败：{{message}}',
    'profiles.deletedRefreshFailed': '档案已删除，但刷新失败：{{message}}',
    'profiles.savedProfileMissing': '刷新后未找到已保存的档案，请重试刷新。',
    'profiles.deletedProfilePresent': '刷新后仍包含已删除的档案，请重试刷新。',
    'profiles.retryRefresh': '重试刷新档案',
    'profiles.deletePending': '正在删除并同步档案…',
  });
});

test('resolves every profile translation referenced by Task 5 components', () => {
  for (const file of ['ProfileDirectory.tsx', 'ProfileDetail.tsx', 'ProfilePage.tsx']) {
    const component = readFileSync(resolve(process.cwd(), `src/renderer-react/features/profiles/${file}`), 'utf8');
    for (const [, key] of component.matchAll(/t\(['`]((?:profiles|form)\.[A-Za-z0-9]+)['`]/g)) {
      expect(resolveKey(key), `${file}: ${key}`).toEqual(expect.any(String));
    }
  }
});

test('profile React source never uses the native confirm dialog', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer-react/features/profiles/ProfilePage.tsx'), 'utf8');
  expect(source).not.toMatch(/window\.confirm|\bconfirm\s*\(/);
});

test('contains the exact Task 6 profile editor localization contract', () => {
  expect(Object.fromEntries([
    'profiles.createHeading', 'profiles.editHeading', 'form.nameZh', 'form.nameEn', 'form.gender',
    'form.birthDateTime', 'form.birthPlace', 'form.locationSearch', 'form.locationLabel', 'form.latitude',
    'form.longitude', 'form.tags', 'form.tagPreview', 'form.notes', 'form.save', 'form.create', 'form.cancel',
    'form.saving', 'form.retrySave', 'form.timezoneResolving', 'form.timezoneDerived', 'form.retryTimezone',
    'form.errorNameRequired', 'form.errorGender', 'form.errorYear', 'form.errorMonth', 'form.errorDay',
    'form.errorDate', 'form.errorHour', 'form.errorMinute', 'form.errorLocationRequired',
    'form.errorLatitude', 'form.errorLongitude', 'form.errorTags',
  ].map((key) => [key, resolveKey(key)]))).toEqual({
    'profiles.createHeading': '新建档案', 'profiles.editHeading': '编辑档案',
    'form.nameZh': '中文名字', 'form.nameEn': '英文名字', 'form.gender': '性别',
    'form.birthDateTime': '出生日期与时间（公历，精确到分）', 'form.birthPlace': '出生地',
    'form.locationSearch': '搜索出生地', 'form.locationLabel': '地点名称', 'form.latitude': '纬度', 'form.longitude': '经度',
    'form.tags': '标签', 'form.tagPreview': '标签预览', 'form.notes': '备注',
    'form.save': '保存修改', 'form.create': '创建档案', 'form.cancel': '取消', 'form.saving': '正在保存…', 'form.retrySave': '重试保存',
    'form.timezoneResolving': '正在解析历史时区…', 'form.timezoneDerived': '派生时区（不会保存）：{{zone}} · {{offset}} · {{instant}}', 'form.retryTimezone': '重试时区解析',
    'form.errorNameRequired': '至少填写中文或英文名字', 'form.errorGender': '请选择有效性别',
    'form.errorYear': '年份须为 1 至 3000 的整数', 'form.errorMonth': '月份须为 1 至 12 的整数', 'form.errorDay': '日期须为有效整数',
    'form.errorDate': '出生日期不存在', 'form.errorHour': '小时须为 0 至 23 的整数', 'form.errorMinute': '分钟须为 0 至 59 的整数',
    'form.errorLocationRequired': '请填写地点名称', 'form.errorLatitude': '纬度须为 -90 至 90 的有限数字',
    'form.errorLongitude': '经度须为 -180 至 180 的有限数字', 'form.errorTags': '最多 20 个标签，每个不超过 32 个字符',
  });
});

test('resolves every translation referenced by Task 6 profile components', () => {
  for (const file of ['ProfileEditor.tsx', 'LocationPicker.tsx']) {
    const component = readFileSync(resolve(process.cwd(), `src/renderer-react/features/profiles/${file}`), 'utf8');
    for (const [, key] of component.matchAll(/t\(['`]((?:profiles|form)\.[A-Za-z0-9]+)['`]/g)) {
      expect(resolveKey(key), `${file}: ${key}`).toEqual(expect.any(String));
    }
  }
});
