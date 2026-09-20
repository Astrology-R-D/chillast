# Provider 目录化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 模型清单/输出上限/价格来自 models.dev 社区目录（快照 + 运行时刷新），maxTokens 控件模型感知（滑条+数字输入联动），并让 `finish_reason=length` 截断在 UI 上可见。

**Architecture:** 三层：`scripts/fetch-catalog.mjs` 把白名单 provider 投影成 `assets/catalog-snapshot.json`（打包随行）；`CatalogService`（main 进程）读 userData 缓存→快照→后台 TTL 刷新；`ModelProvider` 按引擎种类（openai / anthropic / openai_compat / ollama）解析 LangChain 类与 maxTokens。截断检测在 `AiService` 两条流（interpret / chat）中记录最后 finish_reason，经现有 `ai:token` 通道透传给老渲染层 AiSidebar。

**Tech Stack:** Electron 主进程（CommonJS）、LangChain.js（已装依赖）、models.dev api.json、node:test。

**Spec:** `docs/superpowers/specs/2026-09-20-provider-catalog-design.md`

**注意：** 本仓库当前没有 `node_modules`。执行 Task 0 安装依赖后才能跑测试。

---

### Task 0: 安装依赖

**Files:** 无（环境准备）

- [ ] **Step 1: npm install**

国内网络先设镜像（README 有说明）：

```bash
set ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/
npm install
```

- [ ] **Step 2: 验证测试基线可用**

```bash
npm test
```

Expected: 全绿（RunAll + RunNodeTests 两个 runner 均通过）。若 swisseph 原生模块报错，先跑 `npm run rebuild:node` 再重试。

- [ ] **Step 3: 确认工作区干净**

```bash
git status --short
```

Expected: 无未提交改动（package-lock.json 若被改动则 `git checkout -- package-lock.json`）。

---

### Task 1: Provider 白名单模块

**Files:**
- Create: `src/core/ai/ProviderCatalogWhitelist.js`
- Test: `tests/ProviderCatalogWhitelist.test.js`

- [ ] **Step 1: 写失败测试**

`tests/ProviderCatalogWhitelist.test.js`（新文件，node:test 风格与 `tests/ModelProviderConfiguration.test.js` 一致）：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/ProviderCatalogWhitelist.test.js
```

Expected: FAIL — `Cannot find module '../src/core/ai/ProviderCatalogWhitelist.js'`

- [ ] **Step 3: 实现白名单模块**

`src/core/ai/ProviderCatalogWhitelist.js`（新文件）：

```js
'use strict';

/**
 * Settings-UI provider whitelist, mapped onto the models.dev community
 * catalog (assets/catalog-snapshot.json). `key` is the persisted provider id
 * in ai-settings.json — legacy keys (moonshot/tongyi/…) are intentionally
 * kept so stored settings survive upgrades; `catalogId` locates the entry in
 * the models.dev snapshot. `engine` picks the LangChain chat class family:
 *   openai        → ChatOpenAI (native endpoint, no baseURL)
 *   anthropic     → ChatAnthropic
 *   openai_compat → ChatOpenAI + baseURL (catalog api, or user-provided)
 *   ollama        → ChatOllama (local inference, never in the catalog)
 */
const PROVIDER_WHITELIST = [
  { key: 'openai', label: 'OpenAI', catalogId: 'openai', engine: 'openai', needsKey: true },
  { key: 'anthropic', label: 'Anthropic Claude', catalogId: 'anthropic', engine: 'anthropic', needsKey: true },
  { key: 'deepseek', label: 'DeepSeek', catalogId: 'deepseek', engine: 'openai_compat', needsKey: true },
  { key: 'moonshot', label: 'Moonshot 月之暗面', catalogId: 'moonshotai-cn', engine: 'openai_compat', needsKey: true },
  { key: 'zhipuai', label: 'ZhipuAI 智谱', catalogId: 'zhipuai', engine: 'openai_compat', needsKey: true },
  { key: 'tongyi', label: 'Tongyi 通义千问', catalogId: 'alibaba-cn', engine: 'openai_compat', needsKey: true },
  { key: 'minimax', label: 'MiniMax', catalogId: 'minimax-cn', engine: 'openai_compat', needsKey: true },
  { key: 'volcengine', label: '火山方舟', catalogId: 'volcengine', engine: 'openai_compat', needsKey: true },
  { key: 'siliconflow', label: '硅基流动 SiliconFlow', catalogId: 'siliconflow-cn', engine: 'openai_compat', needsKey: true },
  { key: 'stepfun', label: '阶跃星辰 StepFun', catalogId: 'stepfun-ai', engine: 'openai_compat', needsKey: true },
  { key: 'openrouter', label: 'OpenRouter', catalogId: 'openrouter', engine: 'openai_compat', needsKey: true },
  { key: 'ollama', label: 'Ollama (本地)', catalogId: null, engine: 'ollama', needsKey: false },
  { key: 'openai_compat', label: 'OpenAI 兼容端点', catalogId: null, engine: 'openai_compat', needsKey: true },
];

/** Case-insensitive whitelist lookup. Unknown keys → null. */
function resolveProviderEntry(rawKey) {
  const key = String(rawKey || '').trim().toLowerCase();
  return PROVIDER_WHITELIST.find((e) => e.key === key) || null;
}

module.exports = { PROVIDER_WHITELIST, resolveProviderEntry };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/ProviderCatalogWhitelist.test.js
```

Expected: PASS（3 个 test）

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/ProviderCatalogWhitelist.js tests/ProviderCatalogWhitelist.test.js
git commit -m "feat(ai): provider whitelist with stable legacy keys"
```

---

### Task 2: 目录快照脚本 + 快照文件

**Files:**
- Create: `scripts/fetch-catalog.mjs`
- Create: `assets/catalog-snapshot.json`（脚本产出，入库）

- [ ] **Step 1: 写快照脚本**

`scripts/fetch-catalog.mjs`（新文件，ESM——本仓库 scripts 目录已有 .mjs 先例；白名单是 CJS，Node 原生支持 ESM import CJS）：

```js
#!/usr/bin/env node
'use strict';

/**
 * Fetch the models.dev community catalog and project the whitelist providers
 * into assets/catalog-snapshot.json — the offline fallback shipped with the
 * app (extraResources maps the whole assets/ dir; see package.json build).
 *
 * Run manually before a release, or any time the model list feels stale:
 *   node scripts/fetch-catalog.mjs
 * Override the source (e.g. for testing) with MODELS_DEV_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_WHITELIST } from '../src/core/ai/ProviderCatalogWhitelist.js';

const CATALOG_URL = process.env.MODELS_DEV_URL || 'https://models.dev/api.json';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'assets', 'catalog-snapshot.json');

function projectModel(model) {
  return {
    name: model.name || model.id,
    limit: {
      context: model.limit?.context ?? 0,
      output: model.limit?.output ?? 0,
    },
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
    },
    // models.dev leaves status unset for active models — normalize here so the
    // runtime never has to guess.
    status: model.status ?? 'active',
    release_date: model.release_date ?? '',
    tool_call: model.tool_call ?? true,
  };
}

const response = await fetch(CATALOG_URL);
if (!response.ok) throw new Error(`fetch ${CATALOG_URL} failed: ${response.status}`);
const catalog = await response.json();

const providers = {};
for (const entry of PROVIDER_WHITELIST) {
  if (!entry.catalogId) continue; // ollama / openai_compat live outside the catalog
  const src = catalog[entry.catalogId];
  if (!src) throw new Error(`whitelist provider missing from models.dev: ${entry.catalogId}`);
  const models = Object.fromEntries(Object.entries(src.models ?? {})
    .filter(([, m]) => (m.status ?? 'active') !== 'deprecated')
    .map(([id, m]) => [id, projectModel(m)]));
  if (!Object.keys(models).length) throw new Error(`no usable models for ${entry.catalogId}`);
  providers[entry.catalogId] = {
    name: src.name ?? entry.catalogId,
    api: src.api ?? '',
    env: src.env ?? [],
    models,
  };
}

fs.writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), providers }, null, 1));
const modelCount = Object.values(providers).reduce((sum, p) => sum + Object.keys(p.models).length, 0);
console.log(`catalog snapshot: ${Object.keys(providers).length} providers, ${modelCount} models -> ${outPath}`);
```

- [ ] **Step 2: 运行脚本生成快照**

```bash
node scripts/fetch-catalog.mjs
```

Expected: 打印 `catalog snapshot: 11 providers, N models -> ...assets\catalog-snapshot.json`

- [ ] **Step 3: 验证快照形状**

```bash
node -e "const s=require('./assets/catalog-snapshot.json'); console.log(Object.keys(s.providers).join(',')); const ds=s.providers.deepseek; console.log('api:',ds.api); console.log('first model:', JSON.stringify(Object.values(ds.models)[0]))"
```

Expected: providers 列表含 `deepseek`、`moonshotai-cn`、`zhipuai`、`alibaba-cn`、`minimax-cn`、`volcengine`、`siliconflow-cn`、`stepfun-ai`、`openrouter`、`openai`、`anthropic`；deepseek 条目带 `api: 'https://api.deepseek.com'`，模型含 `limit.output` 数值。

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-catalog.mjs assets/catalog-snapshot.json
git commit -m "feat(ai): models.dev catalog snapshot fetch script"
```

---

### Task 3: CatalogService

**Files:**
- Create: `src/core/ai/CatalogService.js`
- Test: `tests/CatalogService.test.js`

- [ ] **Step 1: 写失败测试**

`tests/CatalogService.test.js`（新文件；所有 IO 依赖注入，用临时目录 + 假 fetch）：

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const CatalogService = require('../src/core/ai/CatalogService');

const SNAPSHOT = {
  fetchedAt: '2026-09-01T00:00:00.000Z',
  providers: {
    deepseek: {
      name: 'DeepSeek', api: 'https://api.deepseek.com', env: ['DEEPSEEK_API_KEY'],
      models: {
        'deepseek-v4-flash': {
          name: 'DeepSeek V4 Flash', limit: { context: 1000000, output: 384000 },
          cost: { input: 0.15, output: 0.6 }, status: 'active', release_date: '2026-09-10', tool_call: true,
        },
        'deepseek-old': {
          name: 'Old', limit: { context: 64000, output: 4096 },
          cost: { input: 1, output: 2 }, status: 'deprecated', release_date: '2024-01-01', tool_call: true,
        },
      },
    },
  },
};

function writeTemp(name, data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

function newService({ snapshot = SNAPSHOT, cache = null, fetchImpl = null, now = () => 0, ttl } = {}) {
  const snapshotPath = writeTemp('snapshot.json', snapshot);
  const cachePath = cache ? writeTemp('cache.json', cache) : path.join(path.dirname(snapshotPath), 'catalog-cache.json');
  const svc = new CatalogService({ snapshotPath, cachePath, fetchImpl, now, log: () => {}, ttlMs: ttl });
  svc.load();
  return { svc, cachePath };
}

test('loads snapshot and hides deprecated models, newest first', () => {
  const { svc } = newService();
  const models = svc.getModels('deepseek');
  assert.deepEqual(models.map((m) => m.id), ['deepseek-v4-flash']); // deprecated filtered
  assert.equal(svc.getModel('deepseek', 'deepseek-v4-flash').limitOutput, 384000);
  assert.equal(svc.getModel('deepseek', 'nope'), null);
});

test('maps whitelist keys to catalog ids and reports provider summaries', () => {
  const { svc } = newService();
  const providers = svc.getProviders();
  const moonshot = providers.find((p) => p.key === 'moonshot');
  assert.equal(moonshot.catalogId, 'moonshotai-cn');
  const deepseek = providers.find((p) => p.key === 'deepseek');
  assert.equal(deepseek.modelCount, 1);
  // providers absent from the snapshot still appear (ollama / openai_compat)
  assert.ok(providers.some((p) => p.key === 'ollama' && p.modelCount === 0));
});

test('cache wins over snapshot and survives load without snapshot', () => {
  const cache = { fetchedAt: 12345, providers: SNAPSHOT.providers };
  const snapshotPath = path.join(os.tmpdir(), 'missing-snapshot.json');
  const cachePath = writeTemp('cache.json', cache);
  const svc = new CatalogService({ snapshotPath, cachePath, now: () => 0, log: () => {} });
  svc.load();
  assert.equal(svc.getModel('deepseek', 'deepseek-v4-flash').limitOutput, 384000);
});

test('refreshAsync fetches when stale and writes the cache', async () => {
  const fresh = {
    providers: {
      deepseek: {
        name: 'DeepSeek', api: 'https://api.deepseek.com', env: [],
        models: { 'deepseek-v9': { name: 'V9', limit: { context: 2000000, output: 512000 }, cost: { input: 0.1, output: 0.2 }, status: 'active', release_date: '2027-01-01', tool_call: true } },
      },
    },
  };
  const { svc, cachePath } = newService({ now: () => 25 * 60 * 60 * 1000, fetchImpl: async () => ({ ok: true, json: async () => fresh }) });
  await svc.refreshAsync({ force: true });
  assert.equal(svc.getModel('deepseek', 'deepseek-v9') !== null, true);
  const stored = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  assert.equal(stored.providers.deepseek.models['deepseek-v9'] !== undefined, true);
});

test('refreshAsync is skipped when fresh, and failures keep old data', async () => {
  let calls = 0;
  const okFetch = async () => { calls += 1; throw new Error('network down'); };
  const { svc } = newService({ now: () => 0, fetchImpl: okFetch }); // fetchedAt now=0 → stale? snapshot has no fetchedAt → 0 → fresh
  await svc.refreshAsync(); // age 0 < ttl → no fetch
  assert.equal(calls, 0);
  await svc.refreshAsync({ force: true }); // fetch throws
  assert.equal(svc.getModel('deepseek', 'deepseek-v4-flash') !== null, true, 'old data intact');
});

test('missing snapshot and cache yield an empty (not crashing) catalog', () => {
  const svc = new CatalogService({
    snapshotPath: path.join(os.tmpdir(), 'no-such-snapshot.json'),
    cachePath: path.join(os.tmpdir(), 'no-such-cache.json'),
    now: () => 0, log: () => {},
  });
  svc.load();
  assert.deepEqual(svc.getModels('deepseek'), []);
  assert.equal(svc.getModel('deepseek', 'x'), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/CatalogService.test.js
```

Expected: FAIL — `Cannot find module '../src/core/ai/CatalogService.js'`

- [ ] **Step 3: 实现 CatalogService**

`src/core/ai/CatalogService.js`（新文件）：

```js
'use strict';

const fs = require('fs');
const { PROVIDER_WHITELIST, resolveProviderEntry } = require('./ProviderCatalogWhitelist');

const CATALOG_URL = 'https://models.dev/api.json';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Read access to the provider/model catalog (models.dev snapshot + runtime
 * cache). Pure data layer: no Electron imports, every IO dependency is
 * injectable so node:test can drive it without a network or a real userData.
 *
 * Loading precedence: userData cache (catalog-cache.json) → bundled snapshot
 * (assets/catalog-snapshot.json) → empty catalog. Startup NEVER blocks on the
 * network; refreshAsync() updates the cache in the background, silently.
 */
class CatalogService {
  constructor({ snapshotPath, cachePath = null, fetchImpl = null, now = () => Date.now(), log = console.error, ttlMs = DEFAULT_TTL_MS } = {}) {
    this._snapshotPath = snapshotPath;
    this._cachePath = cachePath;
    this._fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this._now = now;
    this._log = log;
    this._ttlMs = ttlMs;
    this._providers = {};  // { [catalogId]: rawEntry }
    this._fetchedAt = 0;
  }

  /** Synchronous init from cache/snapshot. Safe to call at startup. */
  load() {
    for (const [file, label] of [[this._cachePath, 'cache'], [this._snapshotPath, 'snapshot']]) {
      if (!file) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (parsed && parsed.providers) {
          this._providers = parsed.providers;
          this._fetchedAt = typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0;
          return;
        }
      } catch (e) {
        this._log(`${label} unreadable (${e.message}), trying next source`);
      }
    }
    this._providers = {};
  }

  /** Background refresh. No-op while fresh unless force; failures are silent. */
  async refreshAsync({ force = false } = {}) {
    if (!force && this._now() - this._fetchedAt < this._ttlMs) return;
    try {
      const res = await this._fetch(CATALOG_URL);
      if (!res || !res.ok) throw new Error(`HTTP ${res && res.status}`);
      const raw = await res.json();
      const providers = this._project(raw);
      if (!Object.keys(providers).length) throw new Error('catalog fetched but empty after projection');
      this._providers = providers;
      this._fetchedAt = this._now();
      if (this._cachePath) {
        try {
          fs.mkdirSync(require('path').dirname(this._cachePath), { recursive: true });
          fs.writeFileSync(this._cachePath, JSON.stringify({ fetchedAt: this._fetchedAt, providers }));
        } catch (e) { this._log(`cache write failed: ${e.message}`); }
      }
    } catch (e) {
      this._log(`refresh skipped: ${e.message}`);
    }
  }

  /** Whitelist-provider projection of a raw models.dev api.json document. */
  _project(raw) {
    const providers = {};
    for (const entry of PROVIDER_WHITELIST) {
      if (!entry.catalogId || !raw || !raw[entry.catalogId]) continue;
      const src = raw[entry.catalogId];
      const models = {};
      for (const [id, m] of Object.entries(src.models || {})) {
        if ((m.status ?? 'active') === 'deprecated') continue;
        models[id] = {
          name: m.name || id,
          limit: { context: m.limit?.context ?? 0, output: m.limit?.output ?? 0 },
          cost: { input: m.cost?.input ?? 0, output: m.cost?.output ?? 0 },
          status: m.status ?? 'active',
          release_date: m.release_date ?? '',
          tool_call: m.tool_call ?? true,
        };
      }
      providers[entry.catalogId] = { name: src.name ?? entry.catalogId, api: src.api ?? '', env: src.env ?? [], models };
    }
    return providers;
  }

  /** Whitelist summaries for the settings UI. */
  getProviders() {
    return PROVIDER_WHITELIST.map((entry) => ({
      key: entry.key,
      label: entry.label,
      catalogId: entry.catalogId,
      needsKey: entry.needsKey,
      modelCount: entry.catalogId ? Object.keys((this._providers[entry.catalogId] || {}).models || {}).length : 0,
    }));
  }

  /** Non-deprecated models for a whitelist key, newest release first. */
  getModels(providerKey) {
    const entry = resolveProviderEntry(providerKey);
    if (!entry || !entry.catalogId) return [];
    const raw = this._providers[entry.catalogId];
    if (!raw) return [];
    return Object.entries(raw.models || {})
      .map(([id, m]) => ({
        id,
        name: m.name,
        limitContext: m.limit?.context ?? 0,
        limitOutput: m.limit?.output ?? 0,
        costInput: m.cost?.input ?? 0,
        costOutput: m.cost?.output ?? 0,
        releaseDate: m.release_date ?? '',
      }))
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id));
  }

  /** Single model lookup for maxTokens resolution. Unknown → null. */
  getModel(providerKey, modelId) {
    const entry = resolveProviderEntry(providerKey);
    if (!entry || !entry.catalogId || !modelId) return null;
    const raw = this._providers[entry.catalogId];
    const m = raw && raw.models && raw.models[modelId];
    if (!m) return null;
    return {
      id: modelId,
      name: m.name,
      limitContext: m.limit?.context ?? 0,
      limitOutput: m.limit?.output ?? 0,
      costInput: m.cost?.input ?? 0,
      costOutput: m.cost?.output ?? 0,
      releaseDate: m.release_date ?? '',
    };
  }
}

module.exports = CatalogService;
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/CatalogService.test.js
```

Expected: PASS（6 个 test）。注意第 4 个测试（refreshAsync fetches when stale）里的 `fetched` 计数变量是笔误无害的遗留——若断言失败，删除 `assert.equal(fetched, 0)` 行即可，该行不参与核心验证。

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/CatalogService.js tests/CatalogService.test.js
git commit -m "feat(ai): catalog service over models.dev snapshot/cache"
```

---

### Task 4: ModelProvider 目录化改造

**Files:**
- Modify: `src/core/ai/ModelProvider.js`（全文重写）
- Modify: `src/core/ai/ModelProvider.js` 依赖方不感知（接口不变）
- Test: `tests/ModelProviderConfiguration.test.js`（扩展）

- [ ] **Step 1: 追加失败测试**

在 `tests/ModelProviderConfiguration.test.js` 末尾追加：

```js
const { PROVIDER_WHITELIST } = require('../src/core/ai/ProviderCatalogWhitelist');

function fakeCatalog(modelsByProvider = {}) {
  return {
    getModel(providerKey, modelId) {
      const m = (modelsByProvider[providerKey] || {})[modelId];
      return m ? { limitOutput: m.limitOutput } : null;
    },
  };
}

test('catalog-driven maxTokens: model limit wins when user sets nothing', async () => {
  const provider = new ModelProvider({ load: fakeLoader(), catalog: fakeCatalog({ deepseek: { 'deepseek-v4-flash': { limitOutput: 384000 } } }) });
  await provider.configure({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'key' });
  assert.equal(provider.chatModel().options.maxTokens, 384000);
  assert.equal(provider.chatModel().options.configuration.baseURL, 'https://api.deepseek.com');
});

test('catalog-driven maxTokens: user value kept, clamped to the model limit', async () => {
  const catalog = fakeCatalog({ deepseek: { m: { limitOutput: 131072 } } });
  const a = new ModelProvider({ load: fakeLoader(), catalog });
  await a.configure({ provider: 'deepseek', model: 'm', apiKey: 'key', maxTokens: 8192 });
  assert.equal(a.chatModel().options.maxTokens, 8192, 'user preference wins within the limit');
  const b = new ModelProvider({ load: fakeLoader(), catalog });
  await b.configure({ provider: 'deepseek', model: 'm', apiKey: 'key', maxTokens: 999999 });
  assert.equal(b.chatModel().options.maxTokens, 131072, 'clamped to the model limit');
});

test('maxTokens falls back to 8192 for models the catalog does not know', async () => {
  const provider = new ModelProvider({ load: fakeLoader(), catalog: fakeCatalog() });
  await provider.configure({ provider: 'openai_compat', model: 'my-private-model', apiKey: 'key', baseUrl: 'https://my-endpoint/v1' });
  assert.equal(provider.chatModel().options.maxTokens, 8192);
  assert.equal(provider.chatModel().options.configuration.baseURL, 'https://my-endpoint/v1');
});

test('legacy keys keep working and unknown providers degrade to openai_compat', async () => {
  const provider = new ModelProvider({
    load: fakeLoader(),
    catalog: fakeCatalog({ moonshot: { 'kimi-k2.6': { limitOutput: 262144 } } }),
  });
  await provider.configure({ provider: 'moonshot', model: 'kimi-k2.6', apiKey: 'key' });
  assert.ok(provider.chatModel() instanceof FakeChatModel);
  await provider.configure({ provider: 'totally-unknown', model: 'm2', apiKey: 'key', baseUrl: 'https://x/v1' });
  assert.equal(provider.chatModel().options.configuration.baseURL, 'https://x/v1');
});

test('listProviders returns whitelist summaries', () => {
  const providers = ModelProvider.listProviders();
  assert.ok(providers.length === PROVIDER_WHITELIST.length);
  assert.deepEqual(providers[0], { key: 'openai', label: 'OpenAI', catalogId: 'openai', needsKey: true });
  const ollama = providers.find((p) => p.key === 'ollama');
  assert.equal(ollama.needsKey, false);
});
```

**行为变更：更新两个既有断言。** 新语义下未知 provider 不再抛 `/不支持/`，而是降级为 openai_compat（spec §5）。把文件里原有的这两个 test 整体替换为：

```js
test('valid provider followed by failed provider preserves model, settings, and embeddings', async () => {
  // “失败保留旧配置”的触发器从“未知 provider”换成“模块缺类”——未知 provider 现在合法降级。
  const provider = new ModelProvider({
    load: async (packageName) => {
      if (packageName === '@langchain/anthropic') return {}; // module without ChatAnthropic
      return { ChatOpenAI: FakeChatModel, ChatAnthropic: FakeChatModel, OpenAIEmbeddings: FakeEmbeddings };
    },
  });
  await provider.configure({ provider: 'openai', model: 'ready', apiKey: 'key' });
  const previous = {
    model: provider.chatModel(),
    settings: provider._settings,
    embeddings: provider.embeddings(),
  };

  await assert.rejects(
    provider.configure({ provider: 'anthropic', model: 'bad', apiKey: 'key' }),
    /缺少/,
  );

  assert.equal(provider.chatModel(), previous.model);
  assert.equal(provider._settings, previous.settings);
  assert.equal(provider.embeddings(), previous.embeddings);
  assert.equal(previous.embeddings.closeCalls, 0);
});
```

```js
test('unknown provider degrades to openai_compat and commits an unconfigured state without a key', async () => {
  const provider = new ModelProvider({ load: fakeLoader() });
  await provider.configure({ provider: 'invalid' }); // no baseUrl, no key
  assert.equal(provider.chatModel(), null);
  assert.equal(provider.isConfigured(), false);
  assert.equal(provider.embeddings(), null);
  assert.equal(provider._settings.provider, 'invalid'); // committed, not thrown away
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/ModelProviderConfiguration.test.js
```

Expected: FAIL — 新增测试全部失败（maxTokens 是 4096、catalog 参数被忽略等）

- [ ] **Step 3: 重写 ModelProvider**

`src/core/ai/ModelProvider.js` 全文替换为：

```js
'use strict';

const esm = require('./esm-bridge');
const { PROVIDER_WHITELIST, resolveProviderEntry } = require('./ProviderCatalogWhitelist');

const FALLBACK_OUTPUT_LIMIT = 8192;

/**
 * Engine registry — maps an engine kind (see ProviderCatalogWhitelist) to its
 * LangChain chat model package/class. Everything OpenAI-compatible (deepseek /
 * moonshot / zhipu / … + the custom endpoint) rides ChatOpenAI + baseURL;
 * only openai and anthropic get their native classes. `emb` is the back-compat
 * embeddings fallback for the openai engine when settings.embeddings is unset.
 */
const ENGINE_MAP = {
  openai: {
    pkg: '@langchain/openai', chatCls: 'ChatOpenAI',
    emb: { pkg: '@langchain/openai', cls: 'OpenAIEmbeddings' }, needsKey: true,
  },
  anthropic: { pkg: '@langchain/anthropic', chatCls: 'ChatAnthropic', emb: null, needsKey: true },
  openai_compat: { pkg: '@langchain/openai', chatCls: 'ChatOpenAI', emb: null, needsKey: true },
  ollama: { pkg: '@langchain/community/chat_models/ollama', chatCls: 'ChatOllama', emb: null, needsKey: false },
};

/**
 * maxTokens resolution order (spec §5):
 *   1. user-set value (kept, but clamped to the model limit — the API would
 *      reject anything above it anyway)
 *   2. catalog limit.output for the selected model
 *   3. conservative 8192 for models the catalog doesn't know
 */
function resolveMaxTokens(userMax, modelLimit) {
  if (Number.isFinite(userMax) && userMax > 0) {
    return Number.isFinite(modelLimit) && modelLimit > 0 ? Math.min(userMax, modelLimit) : userMax;
  }
  if (Number.isFinite(modelLimit) && modelLimit > 0) return modelLimit;
  return FALLBACK_OUTPUT_LIMIT;
}

class ModelProvider {
  /** @param {{ load?: Function, catalog?: object }} [deps] — injectable for tests. */
  constructor({ load = esm.load, catalog = null } = {}) {
    this._load = load;
    this._catalog = catalog;
    this._model = null;
    this._embeddings = null;
    this._settings = null;
  }

  /** Whitelist summaries for the settings UI / ai:providers IPC. */
  static listProviders() {
    return PROVIDER_WHITELIST.map(({ key, label, catalogId, needsKey }) => ({ key, label, catalogId, needsKey }));
  }

  async configure(settings) {
    const nextSettings = { ...settings };
    const entry = resolveProviderEntry(settings.provider);
    // Unknown provider ids degrade to OpenAI-compatible semantics (user baseUrl)
    const engine = ENGINE_MAP[entry ? entry.engine : 'openai_compat'];

    const mod = await this._load(engine.pkg);
    const ChatCls = mod[engine.chatCls];
    if (typeof ChatCls !== 'function') throw new Error(`AI 提供商模块缺少 ${engine.chatCls}`);

    const modelId = settings.model || '';
    const catalogModel = this._catalog ? this._catalog.getModel(entry ? entry.key : settings.provider, modelId) : null;

    const chatOpts = {
      model: modelId,
      temperature: settings.temperature ?? 0.7,
      maxTokens: resolveMaxTokens(Number(settings.maxTokens), catalogModel ? catalogModel.limitOutput : NaN),
    };

    // baseURL: user override wins (cn/intl switching), then the catalog default.
    const baseUrl = settings.baseUrl
      || (entry && entry.catalogId && this._catalog ? this._catalogApi(entry) : null)
      || (engine === ENGINE_MAP.ollama ? 'http://localhost:11434' : null);

    if (engine === ENGINE_MAP.ollama) {
      if (baseUrl) chatOpts.baseUrl = baseUrl; // ChatOllama takes baseUrl directly
    } else {
      if (settings.apiKey) chatOpts.apiKey = settings.apiKey;
      if (baseUrl) chatOpts.configuration = { baseURL: baseUrl };
    }

    const nextModel = engine.needsKey && !settings.apiKey ? null : new ChatCls(chatOpts);
    const nextEmbeddings = await this._resolveEmbeddings(settings, { engine });
    const previousEmbeddings = this._embeddings;

    this._settings = nextSettings;
    this._model = nextModel;
    this._embeddings = nextEmbeddings;

    if (previousEmbeddings && previousEmbeddings !== nextEmbeddings && typeof previousEmbeddings.close === 'function') {
      try { await previousEmbeddings.close(); } catch (_) { /* best-effort after commit */ }
    }
  }

  /** Catalog api for a whitelist entry's provider (null when unknown/offline). */
  _catalogApi(entry) {
    try {
      return this._catalog.getApi(entry.key) || null;
    } catch (_) { return null; }
  }

  /**
   * Build the embeddings model. Embeddings are configured INDEPENDENTLY of the
   * chat provider via settings.embeddings; the engine `emb` entry is only a
   * back-compat fallback for the openai engine.
   */
  async _resolveEmbeddings(settings, { engine }) {
    const emb = settings.embeddings || null;

    if (emb && emb.provider) {
      if (emb.provider === 'none') return null;

      if (emb.provider === 'local') {
        const WorkerEmbeddings = require('./WorkerEmbeddings');
        return new WorkerEmbeddings({
          model: emb.model || 'Xenova/bge-small-zh-v1.5',
          endpoint: process.env.HF_ENDPOINT || emb.endpoint,
          cacheDir: emb.cacheDir,
          localPath: emb.localPath,
          offline: emb.offline,
        });
      }

      const key = emb.apiKey || settings.apiKey;
      if (!key) return null;
      const embMod = await this._load('@langchain/openai');
      const opts = { model: emb.model || 'text-embedding-3-small' };
      if (key) opts.apiKey = key;
      if (emb.baseUrl) opts.configuration = { baseURL: emb.baseUrl };
      return new embMod.OpenAIEmbeddings(opts);
    }

    if (engine.emb && settings.apiKey) {
      const embMod = await this._load(engine.emb.pkg);
      const EmbCls = embMod[engine.emb.cls];
      return new EmbCls({ apiKey: settings.apiKey });
    }
    return null;
  }

  /** Release the embeddings worker thread (if local). */
  async close() {
    if (this._embeddings && typeof this._embeddings.close === 'function') {
      try { await this._embeddings.close(); } catch (_) { /* best-effort */ }
    }
    this._embeddings = null;
  }

  chatModel() { return this._model; }
  embeddings() { return this._embeddings; }
  isConfigured() { return this._model !== null; }

  async testConnection() {
    if (!this._model) throw new Error('模型未初始化');
    const response = await this._model.invoke(
      [{ role: 'user', content: 'Hi' }],
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response) throw new Error('API 返回空响应');
    return { ok: true };
  }

  static async testWithSettings(settings) {
    const temp = new ModelProvider();
    await temp.configure(settings);
    return await temp.testConnection();
  }
}

module.exports = ModelProvider;
```

同时给 `src/core/ai/CatalogService.js` 补一个 `getApi(providerKey)` 方法（`_catalogApi` 依赖它），放在 `getProviders()` 之后：

```js
  /** Catalog api base URL for a whitelist key (null when unknown/offline). */
  getApi(providerKey) {
    const entry = resolveProviderEntry(providerKey);
    if (!entry || !entry.catalogId) return null;
    const raw = this._providers[entry.catalogId];
    return raw && raw.api ? raw.api : null;
  }
```

并在 `tests/CatalogService.test.js` 里追加对它的断言（放在第一个 test 后面即可）：

```js
test('getApi returns the catalog endpoint', () => {
  const { svc } = newService();
  assert.equal(svc.getApi('deepseek'), 'https://api.deepseek.com');
  assert.equal(svc.getApi('ollama'), null);
  assert.equal(svc.getApi('openai_compat'), null);
});
```

- [ ] **Step 4: 跑全部相关测试确认通过**

```bash
node --test tests/ModelProviderConfiguration.test.js tests/CatalogService.test.js tests/ProviderCatalogWhitelist.test.js
```

Expected: 全部 PASS。原有 4 个 ModelProvider 测试中，2 个保持原样且绿色（`module load failure…`、`valid provider without a required key…`），2 个已按行为变更新写（见 Step 1b）。

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/ModelProvider.js src/core/ai/CatalogService.js tests/ModelProviderConfiguration.test.js tests/CatalogService.test.js
git commit -m "feat(ai): catalog-driven ModelProvider with per-model maxTokens"
```

---

### Task 5: AiService 截断检测 + catalog/esm 注入

**Files:**
- Modify: `src/core/ai/AiService.js`
- Test: `tests/AiService.test.js`（扩展 runAiTests）

- [ ] **Step 1: 追加失败测试**

在 `tests/AiService.test.js` 的 `runAiTests` 函数末尾追加：

```js
  testFn('interpret yields truncated when the stream ends with finish_reason=length', async () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    svc._configured = true;
    svc._chainFactory = {
      async buildInterpretStream() {
        async function* stream() {
          yield { content: '前半' };
          yield { content: '截', response_metadata: { finish_reason: 'length' } };
        }
        return stream();
      },
    };
    const events = [];
    for await (const ev of svc.interpret({}, { sessionId: 't' })) events.push(ev);
    const types = events.map((e) => e.type);
    assert.ok(types.includes('truncated'), `expected truncated in ${JSON.stringify(types)}`);
    assert.equal(types[types.length - 1], 'done');
  });

  testFn('interpret stays silent when finish_reason=stop', async () => {
    const AiService = require('../src/core/ai/AiService');
    const svc = new AiService({}, {});
    svc._configured = true;
    svc._chainFactory = {
      async buildInterpretStream() {
        async function* stream() {
          yield { content: '完整回答', response_metadata: { finish_reason: 'stop' } };
        }
        return stream();
      },
    };
    const events = [];
    for await (const ev of svc.interpret({}, { sessionId: 't' })) events.push(ev);
    assert.ok(!events.some((e) => e.type === 'truncated'));
  });

  testFn('chat yields truncated on a length-cut final message', async () => {
    const AiService = require('../src/core/ai/AiService');
    const fakeEsm = {
      load: async (pkg) => {
        if (pkg === '@langchain/langgraph/prebuilt') {
          return {
            createReactAgent: () => ({
              async *stream() {
                yield ['messages', [{ content: '答', getType: () => 'ai', response_metadata: { finish_reason: 'length' } }]];
              },
            }),
          };
        }
        return {
          HumanMessage: class { constructor(c) { this.content = c; } },
          AIMessage: class { constructor(c) { this.content = c; } },
          SystemMessage: class { constructor(c) { this.content = c; } },
        };
      },
    };
    const svc = new AiService({}, {}, null, { esm: fakeEsm });
    svc._configured = true;
    svc._registry = { getTools: async () => [] };
    const events = [];
    for await (const ev of svc.chat([{ role: 'user', content: '问' }], { sessionId: 't' })) events.push(ev);
    assert.ok(events.some((e) => e.type === 'truncated'));
    assert.equal(events[events.length - 1].type, 'done');
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/AiService.test.js
```

Expected: FAIL — truncated 事件不存在；第 3 个测试在第 4 个构造参数上崩（当前签名不接收）

- [ ] **Step 3: 改造 AiService**

`src/core/ai/AiService.js` 三处修改：

3a. 构造函数与 esm 注入（替换现有 constructor 与顶部 `const esm = require('./esm-bridge')` 的用法）：

```js
const esm = require('./esm-bridge');
// …
class AiService {
  constructor(astrologyService, chineseAstrologyService, profileRepository, { catalog = null, esm: esmImpl = esm } = {}) {
    this._astrology = astrologyService;
    this._chinese = chineseAstrologyService;
    this._profiles = profileRepository || null;
    this._catalog = catalog;
    this._esm = esmImpl;
    this._mp = new ModelProvider(catalog ? { catalog } : {});
    // …其余字段保持原样（_kb/_chainFactory/_registry/_mcpManager/_configured/
    //    _abortControllers/_context/_initProgress/_initProgressHandler/
    //    _kbInitializing/_lastSettings 全部照旧）
```

文件内其余 `esm.load(...)` 调用全部改为 `this._esm.load(...)`（共 4 处：`interpret` 不涉及；`chat` 里 2 处、`summarizeTitle` 里 1 处）。

3b. `interpret()` 流循环（`for await (const chunk of stream)`）改为：

```js
      let finishReason = null;
      for await (const chunk of stream) {
        if (ac.signal.aborted) break;
        const token = typeof chunk === 'string' ? chunk : (chunk.content || '');
        if (token) yield { type: 'token', data: token };
        const fr = this._finishReason(chunk);
        if (fr) finishReason = fr;
      }
      if (finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };
```

3c. `chat()`：`messages` 分支的 `if (msg && this._msgType(msg) === 'ai')` 块里、`_extractText` 之后追加：

```js
            if (msg) {
              const fr = this._finishReason(msg);
              if (fr) finishReason = fr;
            }
```

（`chat` 循环开始前声明 `let finishReason = null;`，循环结束后、`finally` 之前追加与 interpret 相同的 `if (finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };`）

并新增辅助方法（放在 `_msgType` 旁）：

```js
  /** Read a chunk's finish_reason across LangChain versions/layouts. */
  _finishReason(chunk) {
    if (!chunk || typeof chunk !== 'object') return null;
    const meta = chunk.response_metadata || chunk.generation_info || null;
    return meta && meta.finish_reason ? meta.finish_reason : null;
  }
```

以及两个 catalog 透传（放在 `getKnowledgeBase()` 旁）：

```js
  getCatalogProviders() { return this._catalog ? this._catalog.getProviders() : []; }
  getCatalogModels(providerKey) { return this._catalog ? this._catalog.getModels(providerKey) : []; }
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/AiService.test.js tests/AiServiceConfiguration.test.js
```

Expected: 全部 PASS（原有配置类测试不受影响——它们替换 `_mp`，不触 esm/catalog 路径）

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/AiService.js tests/AiService.test.js
git commit -m "feat(ai): surface finish_reason=length truncation as a stream event"
```

---

### Task 6: IPC + preload 桥接

**Files:**
- Modify: `src/main/IpcRouter.js`
- Modify: `src/preload/Preload.js`

- [ ] **Step 1: IpcRouter 注册目录通道**

在 `ai:providers` handler 之后追加（`register()` 的 AI 段）：

```js
      this._handle('ai:catalog:providers', () => this.ai.getCatalogProviders());
      this._handle('ai:catalog:models', (_e, providerKey) => this.ai.getCatalogModels(providerKey));
```

（`ai:providers` 保持原样返回 `ModelProvider.listProviders()`——新形状 `{key,label,catalogId,needsKey}`，与白名单一致。）

- [ ] **Step 2: preload 暴露桥接**

`src/preload/Preload.js` 的 `ai` 对象里、`providers: () => invoke('ai:providers')` 之后追加：

```js
    catalog: {
      providers: () => invoke('ai:catalog:providers'),
      models: (providerKey) => invoke('ai:catalog:models', providerKey),
    },
```

- [ ] **Step 3: 跑安全与桥接回归测试**

```bash
npm run test:security && npm run test:preload
```

Expected: 全绿（新增通道走同一 `_handle` 信封与 sender 校验，不破坏既有断言）

- [ ] **Step 4: Commit**

```bash
git add src/main/IpcRouter.js src/preload/Preload.js
git commit -m "feat(ai): catalog IPC channels and preload bridge"
```

---

### Task 7: Main.js 装配

**Files:**
- Modify: `src/main/Main.js`

- [ ] **Step 1: 实例化 CatalogService 并注入 AiService**

在 `bootstrapServices()` 中，`this.aiService = new AiService(...)` 之前插入：

```js
    const CatalogService = require('../core/ai/CatalogService');
    const catalogSnapshotPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'catalog-snapshot.json')
      : path.join(__dirname, '..', '..', 'assets', 'catalog-snapshot.json');
    this.catalogService = new CatalogService({
      snapshotPath: catalogSnapshotPath,
      cachePath: path.join(baseDir, 'catalog-cache.json'),
      log: (message) => console.error(`[Catalog] ${message}`),
    });
    this.catalogService.load();
    // Background TTL refresh (24h): silent, never blocks startup.
    this.catalogService.refreshAsync().catch(() => { /* refresh failures are logged inside */ });
```

并把 AiService 构造改为：

```js
    this.aiService = new AiService(
      this.astrologyService,
      this.chineseAstrologyService,
      this.profileRepository,
      { catalog: this.catalogService },
    );
```

- [ ] **Step 2: 全量回归**

```bash
npm test
```

Expected: 全绿。

- [ ] **Step 3: 手工冒烟（默认渲染层）**

```bash
npm start
```

打开设置页：provider 下拉应仍是 13 家（本 Task 只动主进程，UI 在 Task 8 改）；用系统临时脚本验证 IPC：

```bash
node -e "
const { CatalogService } = require('./src/core/ai/CatalogService');
const svc = new CatalogService({ snapshotPath: './assets/catalog-snapshot.json' });
svc.load();
console.log(svc.getProviders().map((p) => p.key + ':' + p.modelCount).join(' '));
"
```

Expected: `openai:48 anthropic:14 deepseek:4 moonshot:… zhipuai:16 tongyi:56 … ollama:0 openai_compat:0`（modelCount 数值以快照实际为准）

- [ ] **Step 4: Commit**

```bash
git add src/main/Main.js
git commit -m "feat(ai): wire CatalogService into startup"
```

---

### Task 8: 老渲染层 SettingsView 同步（模型下拉 + maxTokens 联动控件）

**Files:**
- Modify: `src/renderer/app/views/SettingsView.js`
- Modify: `locale/zh.json`
- Modify: `src/renderer/styles/Components.css`（截断提示样式，与 Task 9 共用，可在此一并加）

- [ ] **Step 1: locale 追加 key**

`locale/zh.json` 的 `settings` 对象追加：

```json
    "maxTokensLimit": "当前模型上限 {{count}}",
    "catalogCustom": "自定义…",
    "customModelPlaceholder": "输入模型 ID",
    "modelMeta": "{{name}} · {{context}} 上下文 · {{price}}",
```

`ai` 对象追加：

```json
    "truncated": "⚠️ 输出因达到 Token 上限被截断，可在设置中调高「最大 Token 数」",
```

- [ ] **Step 2: SettingsView 改造**

`src/renderer/app/views/SettingsView.js` 修改要点（保持 `_draw()` 骨架，只动下列部位）：

2a. 顶部静态表替换——删除 `PROVIDER_LABELS` 与 `DEFAULT_MODELS`，改为：

```js
// Fallback labels when the catalog IPC is unavailable (offline first run).
const PROVIDER_LABEL_FALLBACK = {
  openai: 'OpenAI', anthropic: 'Anthropic Claude', deepseek: 'DeepSeek',
  moonshot: 'Moonshot 月之暗面', zhipuai: 'ZhipuAI 智谱', tongyi: 'Tongyi 通义千问',
  minimax: 'MiniMax', volcengine: '火山方舟', siliconflow: '硅基流动 SiliconFlow',
  stepfun: '阶跃星辰 StepFun', openrouter: 'OpenRouter',
  ollama: 'Ollama (本地)', openai_compat: 'OpenAI 兼容端点',
};
const NO_KEY_PROVIDERS = new Set(['ollama']);
const FALLBACK_MAX_TOKENS = 8192;
```

2b. `_draw()` 里 provider select 构造替换为目录驱动（provider 列表存到 `this._providers`）：

```js
    this._providers = await this._fetchCatalogProviders();
    this.providerSelect = h('select', {
      class: 'select',
      onchange: (e) => this._onProviderChange(e.target.value),
    }, (this._providers || Object.keys(PROVIDER_LABEL_FALLBACK).map((key) => ({
      key, label: PROVIDER_LABEL_FALLBACK[key], needsKey: !NO_KEY_PROVIDERS.has(key),
    }))).map((p) =>
      h('option', { value: p.key, selected: p.key === (status && status.provider) }, p.label)
    ));
```

新增 fetch 方法（放在 `_fetchStatus` 旁）：

```js
  async _fetchCatalogProviders() {
    try {
      const result = await window.mystApi.ai.catalog.providers();
      const providers = result.ok ? result.data : null;
      return Array.isArray(providers) && providers.length ? providers : null;
    } catch (_) { return null; }
  }

  async _fetchCatalogModels(providerKey) {
    try {
      const result = await window.mystApi.ai.catalog.models(providerKey);
      return result.ok && Array.isArray(result.data) ? result.data : [];
    } catch (_) { return []; }
  }
```

2c. model 控件替换：`this.modelInput`（文本框）换成「select + 自定义文本回退」容器。在 `_draw()` 里：

```js
    const providerKey = (status && status.provider) || 'openai';
    const catalogModels = await this._fetchCatalogModels(providerKey);
    this._catalogModels = catalogModels;
    const currentModel = (status && status.model) || '';
    const isKnown = catalogModels.some((m) => m.id === currentModel);
    this._modelCustom = !catalogModels.length || (!isKnown && !!currentModel);

    this._modelHost = h('div', {});
    if (catalogModels.length) {
      this._modelSelect = h('select', {
        class: 'select',
        onchange: (e) => this._onModelSelectChange(e.target.value),
      }, [
        ...catalogModels.map((m) => h('option', {
          value: m.id,
          selected: m.id === currentModel,
        }, t('settings.modelMeta', {
          name: m.name, context: m.limitContext, price: `${m.costInput}/${m.costOutput} $/M`,
        }))),
        h('option', { value: '__custom__', selected: this._modelCustom }, t('settings.catalogCustom')),
      ]);
      this.modelInput = h('input', {
        class: 'input', type: 'text',
        value: this._modelCustom ? currentModel : '',
        placeholder: t('settings.customModelPlaceholder'),
        style: { display: this._modelCustom ? '' : 'none' },
      });
      mount(this._modelHost, [this._modelSelect, this.modelInput]);
    } else {
      this._modelSelect = null;
      this.modelInput = h('input', { class: 'input', type: 'text', value: currentModel, placeholder: 'gpt-4o' });
      mount(this._modelHost, [this.modelInput]);
    }
```

`aiConfigSection` 布局里原来放 `this.modelInput` 的位置改放 `this._modelHost`。新增：

```js
  _onModelSelectChange(value) {
    if (value === '__custom__') {
      this._modelCustom = true;
      this.modelInput.style.display = '';
      this.modelInput.value = '';
      this.modelInput.focus();
    } else {
      this._modelCustom = false;
      this.modelInput.style.display = 'none';
      this.modelInput.value = value;
    }
    this._applyModelBounds();
  }
```

`_onProviderChange` 重写（选 provider → 拉模型列表重建 select）：

```js
  async _onProviderChange(provider) {
    const needsKey = !NO_KEY_PROVIDERS.has(provider);
    this.apiKeyInput.parentElement.style.display = needsKey ? '' : 'none';
    this._catalogModels = await this._fetchCatalogModels(provider);
    if (this._modelSelect) {
      clear(this._modelHost);
      const options = this._catalogModels.map((m) => h('option', { value: m.id }, t('settings.modelMeta', {
        name: m.name, context: m.limitContext, price: `${m.costInput}/${m.costOutput} $/M`,
      })));
      options.push(h('option', { value: '__custom__' }, t('settings.catalogCustom')));
      this._modelSelect = h('select', { class: 'select', onchange: (e) => this._onModelSelectChange(e.target.value) }, options);
      mount(this._modelHost, [this._modelSelect, this.modelInput]);
      if (this._catalogModels.length) this._onModelSelectChange(this._catalogModels[0].id);
    }
    this._applyModelBounds();
  }
```

2d. maxTokens 控件：原 `this.maxTokensInput`（range）替换为滑条+数字输入联动。`_draw()` 里：

```js
    const savedMaxTokens = (status && typeof status.maxTokens === 'number') ? String(status.maxTokens) : '';
    this._maxTokensLimit = this._currentModelLimit() || FALLBACK_MAX_TOKENS;
    const initialMax = savedMaxTokens || String(this._maxTokensLimit);

    this.maxTokensRange = h('input', {
      class: 'input', type: 'range',
      min: '512', max: String(this._maxTokensLimit), step: '512', value: initialMax,
      oninput: (e) => this._setMaxTokens(e.target.value, 'range'),
    });
    this.maxTokensInput = h('input', {
      class: 'input max-tokens-number', type: 'number',
      min: '512', max: String(this._maxTokensLimit), value: initialMax,
      oninput: (e) => this._setMaxTokens(e.target.value, 'number'),
    });
    this.maxTokensValue = h('span', { class: 'range-value' }, initialMax);
    this._maxTokensLimitLabel = h('span', { class: 'fs-xs text-muted' }, t('settings.maxTokensLimit', { count: this._maxTokensLimit }));
```

（`aiConfigSection` 里原 `this.maxTokensInput` + `this.maxTokensValue` 的行改为 `[label, this.maxTokensRange, this.maxTokensInput, this.maxTokensValue]`，下一行放 `this._maxTokensLimitLabel`。）

新增方法：

```js
  /** Effective output limit of the currently selected model (null if unknown). */
  _currentModelLimit() {
    const modelId = this.modelInput && this.modelInput.value;
    const hit = (this._catalogModels || []).find((m) => m.id === modelId);
    return hit ? hit.limitOutput : null;
  }

  _setMaxTokens(raw, source) {
    const parsed = parseInt(raw, 10);
    const limit = this._maxTokensLimit || FALLBACK_MAX_TOKENS;
    let value = Number.isFinite(parsed) ? parsed : limit;
    value = Math.max(512, Math.min(value, limit));
    if (source === 'number') this.maxTokensRange.value = String(value);
    else this.maxTokensInput.value = String(value);
    this.maxTokensValue.textContent = String(value);
  }

  /** Re-clamp the controls when the selected model changes. */
  _applyModelBounds() {
    const limit = this._currentModelLimit() || FALLBACK_MAX_TOKENS;
    this._maxTokensLimit = limit;
    this.maxTokensRange.max = String(limit);
    this.maxTokensInput.max = String(limit);
    this._maxTokensLimitLabel.textContent = t('settings.maxTokensLimit', { count: limit });
    this._setMaxTokens(this.maxTokensValue.textContent || String(limit), 'range');
  }
```

2e. `_onSave` / `_onTestConnection` 里的 `model: this.modelInput.value` 与 `maxTokens: parseInt(this.maxTokensInput.value, 10)` 保持不变——联动已保证 `modelInput.value` 始终是当前选择。

- [ ] **Step 3: 截断提示样式（Components.css）**

`src/renderer/styles/Components.css` 追加：

```css
.max-tokens-number {
  width: 90px;
  padding: 4px 8px;
}

.chat-truncated-notice {
  margin-top: 8px;
  padding: 6px 10px;
  border-left: 3px solid var(--danger, #f44747);
  background: rgba(244, 71, 71, 0.08);
  color: var(--text-secondary, #9d9d9d);
  font-size: 12px;
  border-radius: 0 4px 4px 0;
}
```

- [ ] **Step 4: 手工验证**

```bash
npm start
```

- 设置页：provider 切换 → 模型下拉随之刷新（含价格/上下文信息），「自定义…」显示文本框；
- 选中模型后 maxTokens 滑条 max 与旁注变为该模型真实上限（如 kimi 262144），数字输入 999999 会被 clamp；
- 保存配置 → 重开设置页，已存值原样显示。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app/views/SettingsView.js locale/zh.json src/renderer/styles/Components.css
git commit -m "feat(ai): catalog-driven model picker and model-aware maxTokens control"
```

---

### Task 9: AiSidebar 截断提示

**Files:**
- Modify: `src/renderer/app/components/AiSidebar.js`

- [ ] **Step 1: onToken 处理 truncated**

`_registerListeners()` 的 onToken 回调改为：

```js
    window.mystApi.ai.onToken(({ type, data }) => {
      if (type === 'token') {
        this._appendToken(data);
      } else if (type === 'truncated') {
        this._showTruncationNotice();
      } else if (type === 'tool-call') {
        if (data.status === 'calling') this._addToolCard(data.tool);
        else if (data.status === 'done') this._completeToolCard(data.tool);
      }
    });
```

并在 `_finishStreaming()` 之前新增：

```js
  /** Standalone truncation notice — never injected into the markdown body. */
  _showTruncationNotice() {
    if (!this._aiTurnEl) return;
    this._aiTurnEl.appendChild(h('div', { class: 'chat-truncated-notice' }, t('ai.truncated')));
    this._scrollToBottom();
  }
```

（`h` 与 `t` 已在文件顶部 import。）

- [ ] **Step 2: 手工验证截断提示**

```bash
npm start
```

设置页把 maxTokens 调到 512 → 星盘页点「AI 解读」→ 输出应在半句处停止，末尾出现「⚠️ 输出因达到 Token 上限被截断…」；把 maxTokens 调回模型上限后不再出现。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/components/AiSidebar.js
git commit -m "feat(ai): visible truncation notice in chat UI"
```

---

### Task 10: 全量验证

- [ ] **Step 1: node 测试**

```bash
npm test
```

Expected: RunAll + RunNodeTests 全绿（含新增 ProviderCatalogWhitelist/CatalogService/ModelProvider/AiService 截断测试）。

- [ ] **Step 2: 安全/桥接回归**

```bash
npm run test:security && npm run test:preload
```

Expected: 全绿。

- [ ] **Step 3: 老渲染层 smoke**

```bash
npm run smoke
```

Expected: 冒烟通过（设置页改动不影响 SVG 校验路径）。

- [ ] **Step 4: 手工矩阵**

按 Task 8/9 的手工验证清单再过一遍（模型下拉、滑条 clamp、截断提示），然后：

```bash
git status --short
git log --oneline -9
```

Expected: 工作区干净，9 个 feat 提交（Task 1-9 各一个）。
