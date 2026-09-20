'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PROVIDER_WHITELIST, resolveProviderEntry } = require('../src/core/ai/ProviderCatalogWhitelist');

test('whitelist keeps legacy keys stable and lists all 13 providers', () => {
  const keys = PROVIDER_WHITELIST.map((e) => e.key);
  assert.deepEqual(keys, [
    'openai', 'anthropic', 'deepseek', 'moonshot', 'zhipuai', 'tongyi',
    'minimax', 'volcengine', 'siliconflow', 'stepfun', 'openrouter',
    'ollama', 'openai_compat',
  ]);
  // 老用户 ai-settings.json 里存的 key 一个都不能变，升级才无感
  for (const legacy of ['openai', 'anthropic', 'deepseek', 'moonshot', 'zhipuai', 'tongyi', 'ollama', 'openai_compat']) {
    assert.ok(PROVIDER_WHITELIST.some((e) => e.key === legacy), legacy);
  }
});

test('every entry has a unique key and an engine', () => {
  const seen = new Set();
  for (const entry of PROVIDER_WHITELIST) {
    assert.ok(!seen.has(entry.key), `duplicate key ${entry.key}`);
    seen.add(entry.key);
    assert.ok(['openai', 'anthropic', 'openai_compat', 'ollama'].includes(entry.engine), entry.key);
    assert.equal(typeof entry.label, 'string');
    assert.equal(typeof entry.needsKey, 'boolean');
    // catalogId 为 null 表示不接入目录（本地 ollama / 自定义端点）
    assert.ok(entry.catalogId === null || typeof entry.catalogId === 'string', entry.key);
  }
});

test('resolveProviderEntry finds keys case-insensitively and returns null for unknown', () => {
  assert.equal(resolveProviderEntry('Moonshot').key, 'moonshot');
  assert.equal(resolveProviderEntry('tongyi').catalogId, 'alibaba-cn');
  assert.equal(resolveProviderEntry('no-such-provider'), null);
});
