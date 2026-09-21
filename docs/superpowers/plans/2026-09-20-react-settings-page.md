# React SettingsPage Implementation Plan（迁移 Phase 7）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React 渲染层 `settings` 路由从占位变实装——对老 `SettingsView.js` 的 AI 配置 / 工具与 MCP / 知识库 / 对话管理四区块达成 parity，AI 配置区消费 Plan 1 的目录 IPC（模型下拉 + 模型感知 maxTokens 滑条+数字输入联动）。

**Architecture:** 遵循既有 React 模式：TanStack Query 管 IPC 数据（`settingsQueries.ts`），未提交表单态留在组件本地；`SettingsPage` 组合四个 Section 组件；契约类型进 `contracts.ts`，preload 方法进 `myst-api.d.ts`（两渲染层共享 `window.mystApi`）。AiStatusPanel 增加"去设置"跳转。

**Tech Stack:** React 18 + TypeScript + TanStack Query + Vitest/RTL + jsdom；Electron preload（既有）。

**Spec:** `docs/superpowers/specs/2026-09-20-react-settings-page-design.md`
**前置:** Plan 1（`2026-09-20-provider-catalog.md`）已完成——`ai:catalog:*` IPC、preload `ai.catalog.*`、locale key（`settings.modelMeta` / `settings.maxTokensLimit` / `settings.catalogCustom` / `settings.customModelPlaceholder`）已在库。

---

## 实现偏差记录（执行期审查发现，随任务落地）

1. **契约（Task 1）**：`knowledge.remove` 类型修正为 `IpcResult<{ removed: boolean }>`（运行时实际形状，IpcRouter 返回 `{removed}`）；MystAiApi 扩展导致 4 处既有 mock 需补全（第二个提交）。
2. **组件（Task 5）**：CSS 令牌按 React 主题真实名称适配（`--border-subtle`/`--surface-panel`/`--surface-base`，themes.css 明暗双主题均有）；modelList 变量名替代 models.data 直用。
3. **集成（Task 6）**：温度行滑条+数值用 `.settings-field-control` 包裹（2 列网格落位修复）；文件导入后 input 复位（可重复导入同一文件）；provider 切换后**自动选第一个目录模型**（pendingAutoSelect 标志，老层 `_onProviderChange` 的 parity，初始加载不触发）；测试 stub 需补 `app.*`（DirtyNavigationProvider 依赖）；时序敏感断言改 find* 变体。
4. **maxTokens（审查修复）**：MaxTokensControl 数字框用**本地 draft 状态**（聚焦期间显示草稿，逐字输入不被受控回显打断，blur 提交）；切换 provider **保留已存值**并按新上限 clamp（不再清空采用完整上限——成本偏好 parity）。
5. **终审修复（6746417）**：settings.css 补按钮样式（profiles.css 惯例：`--surface-raised` + `--border-strong`）；工具开关只 invalidate `tools` key（不再误清未保存的 MCP 草稿）；`draft()` 显式携带空 baseUrl（可真正清空）；知识库导入/移除错误改为可见行内反馈。
6. **已知遗留**：apiKeyConfigured 徽标未迁移（Task 5 审查记录）；字体清单测试为基线预存失败（与分支无关）；终审曾误报 settings.css 令牌不存在（读的是本计划文档的旧代码块而非提交文件，实际代码正确）。

---

### Task 1: 契约类型 + preload 类型声明

**Files:**
- Modify: `src/renderer-react/api/contracts.ts`
- Modify: `src/renderer-react/types/myst-api.d.ts`

- [ ] **Step 1: contracts.ts 追加类型**

在 `contracts.ts` 的 `AiStatus` 接口之后追加：

```ts
export interface AiCatalogProvider {
  key: string;
  label: string;
  catalogId: string | null;
  needsKey: boolean;
  modelCount: number;
}

export interface AiCatalogModel {
  id: string;
  name: string;
  limitContext: number;
  limitOutput: number;
  costInput: number;
  costOutput: number;
  releaseDate: string;
}

export interface AiToolProviderDescriptor {
  id: string;
  category: string;
  enabled: boolean;
  ready: boolean;
  tools: Array<{ name: string; description: string }>;
}

export interface AiMcpInfo {
  servers: Record<string, {
    enabled?: boolean;
    transport?: string;
    command?: string;
    args?: string[];
    url?: string;
  }>;
  toolCount: number;
  connected: boolean;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  source: string;
  importedAt: string;
}

export interface AiSessionSummary {
  id: string;
  title: string | null;
  messages: Array<{ role: string; content: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiSettingsInput {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}
```

- [ ] **Step 2: myst-api.d.ts 扩展 MystAiApi**

把 `interface MystAiApi` 整体替换为：

```ts
  interface MystAiApi {
    status(): Promise<IpcResult<unknown>>;
    initStatus(): Promise<IpcResult<AiInitProgress | null>>;
    onStatusChanged(callback: (status: unknown) => void): () => void;
    onInitProgress(callback: (progress: AiInitProgress) => void): () => void;
    setContext(context: WesternChartAiContext | null): Promise<IpcResult<unknown>>;
    configure(settings: AiSettingsInput): Promise<IpcResult<unknown>>;
    testWithSettings(settings: AiSettingsInput): Promise<IpcResult<unknown>>;
    catalog: {
      providers(): Promise<IpcResult<AiCatalogProvider[]>>;
      models(providerKey: string): Promise<IpcResult<AiCatalogModel[]>>;
    };
    knowledge: {
      list(): Promise<IpcResult<KnowledgeDoc[]>>;
      import(filePaths: string[]): Promise<IpcResult<{ count: number }>>;
      remove(docId: string): Promise<IpcResult<boolean>>;
    };
    tools: {
      describe(): Promise<IpcResult<AiToolProviderDescriptor[]>>;
      setProviderEnabled(id: string, enabled: boolean): Promise<IpcResult<unknown>>;
    };
    mcp: {
      list(): Promise<IpcResult<AiMcpInfo>>;
      save(servers: AiMcpInfo['servers']): Promise<IpcResult<unknown>>;
    };
    sessions: {
      list(): Promise<IpcResult<AiSessionSummary[]>>;
      rename(id: string, title: string): Promise<IpcResult<unknown>>;
      generateTitle(id: string): Promise<IpcResult<{ title: string }>>;
      delete(id: string): Promise<IpcResult<boolean>>;
    };
  }
```

并在文件顶部的 `import type { ... } from '../api/contracts'` 列表里补进 `AiCatalogModel, AiCatalogProvider, AiMcpInfo, AiSessionSummary, AiSettingsInput, AiToolProviderDescriptor, KnowledgeDoc`。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```

Expected: 通过（纯类型新增，无实现引用）。

- [ ] **Step 4: Commit**

```bash
git add src/renderer-react/api/contracts.ts src/renderer-react/types/myst-api.d.ts
git commit -m "feat(settings): typed contracts for the AI settings surface"
```

---

### Task 2: apiClient 方法 + 解析器

**Files:**
- Modify: `src/renderer-react/api/client.ts`
- Test: `src/renderer-react/api/client.test.ts`

- [ ] **Step 1: 写失败测试**

在 `client.test.ts` 末尾追加（复用文件内已有的 `ok` / `installApi` helper）：

```ts
describe('AI settings client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('catalog providers and models are validated on the way in', async () => {
    installApi({
      ai: {
        ...{} as MystApi['ai'],
        catalog: {
          providers: () => ok([
            { key: 'deepseek', label: 'DeepSeek', catalogId: 'deepseek', needsKey: true, modelCount: 4 },
          ]),
          models: () => ok([
            { id: 'deepseek-v4-flash', name: 'V4 Flash', limitContext: 1000000, limitOutput: 384000, costInput: 0.15, costOutput: 0.6, releaseDate: '2026-09-10' },
          ]),
        },
      } as unknown as MystApi['ai'],
    });
    const providers = await apiClient.getAiCatalogProviders();
    expect(providers[0].key).toBe('deepseek');
    const models = await apiClient.getAiCatalogModels('deepseek');
    expect(models[0].limitOutput).toBe(384000);
  });

  test('malformed catalog data throws instead of leaking to the UI', async () => {
    installApi({
      ai: {
        catalog: { providers: () => ok([{ key: 1 }]), models: () => ok([]) },
      } as unknown as MystApi['ai'],
    });
    await expect(apiClient.getAiCatalogProviders()).rejects.toThrow('目录数据无效');
  });

  test('configure and test pass the draft settings through and unwrap the envelope', async () => {
    const configure = vi.fn(() => ok({}));
    const testWithSettings = vi.fn(() => ok({ ok: true } as never));
    installApi({ ai: { configure, testWithSettings } as unknown as MystApi['ai'] });
    const draft: AiSettingsInput = { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0.7, maxTokens: 4096 };
    await apiClient.configureAi(draft);
    await apiClient.testAiSettings(draft);
    expect(configure).toHaveBeenCalledWith(draft);
    expect(testWithSettings).toHaveBeenCalledWith(draft);
  });

  test('knowledge, tools, mcp and session calls unwrap typed results', async () => {
    const knowledge = {
      list: () => ok([{ id: 'a.md', name: 'a.md', source: 'builtin', importedAt: '2026-01-01T00:00:00.000Z' }]),
      import: () => ok({ count: 2 }),
      remove: () => ok({ removed: true }),
    };
    const tools = {
      describe: () => ok([{ id: 'kb', category: 'knowledge', enabled: true, ready: true, tools: [{ name: 'search_knowledge', description: '检索' }] }]),
      setProviderEnabled: () => ok({ ok: true }),
    };
    const mcp = { list: () => ok({ servers: {}, toolCount: 0, connected: false }), save: () => ok({ ok: true }) };
    const sessions = {
      list: () => ok([{ id: 's1', title: null, messages: [{ role: 'user', content: 'hi' }] }]),
      rename: () => ok({ ok: true }),
      generateTitle: () => ok({ title: '新标题' }),
      delete: () => ok(true),
    };
    installApi({ ai: { knowledge, tools, mcp, sessions } as unknown as MystApi['ai'] });
    expect((await apiClient.listKnowledgeDocs())[0].name).toBe('a.md');
    expect((await apiClient.importKnowledgeDocs(['x.md'])).count).toBe(2);
    expect(await apiClient.removeKnowledgeDoc('a.md')).toBe(true);
    expect((await apiClient.describeAiToolProviders())[0].id).toBe('kb');
    expect((await apiClient.listAiSessions())[0].id).toBe('s1');
    expect((await apiClient.regenerateAiSessionTitle('s1')).title).toBe('新标题');
  });
});
```

顶部 import 需补：`import type { AiSettingsInput } from './contracts';`（并从 vitest import 里确认已有 `afterEach, describe, expect, test, vi`——文件头已有）。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/renderer-react/api/client.test.ts
```

Expected: FAIL — `apiClient.getAiCatalogProviders is not a function`

- [ ] **Step 3: 实现 client.ts 方法**

`client.ts` 追加（import 类型列表补 `AiCatalogModel, AiCatalogProvider, KnowledgeDoc, AiSessionSummary, AiToolProviderDescriptor, AiMcpInfo, AiSettingsInput`）：

```ts
function parseAiCatalogProviders(value: unknown): AiCatalogProvider[] {
  if (!Array.isArray(value)) throw new Error('目录数据无效');
  return value.map((entry): AiCatalogProvider => {
    if (!isRecord(entry)
      || typeof entry.key !== 'string' || !entry.key
      || typeof entry.label !== 'string'
      || typeof entry.needsKey !== 'boolean'
      || typeof entry.modelCount !== 'number') throw new Error('目录数据无效');
    return {
      key: entry.key,
      label: entry.label,
      catalogId: typeof entry.catalogId === 'string' ? entry.catalogId : null,
      needsKey: entry.needsKey,
      modelCount: entry.modelCount,
    };
  });
}

function parseAiCatalogModels(value: unknown): AiCatalogModel[] {
  if (!Array.isArray(value)) throw new Error('目录数据无效');
  return value.map((entry): AiCatalogModel => {
    if (!isRecord(entry)
      || typeof entry.id !== 'string' || !entry.id
      || typeof entry.name !== 'string'
      || !isFiniteNumber(entry.limitContext) || !isFiniteNumber(entry.limitOutput)
      || !isFiniteNumber(entry.costInput) || !isFiniteNumber(entry.costOutput)) throw new Error('目录数据无效');
    return {
      id: entry.id,
      name: entry.name,
      limitContext: entry.limitContext,
      limitOutput: entry.limitOutput,
      costInput: entry.costInput,
      costOutput: entry.costOutput,
      releaseDate: typeof entry.releaseDate === 'string' ? entry.releaseDate : '',
    };
  });
}
```

`apiClient` 对象内追加（放在 `getAiStatus` 之后）：

```ts
  getAiCatalogProviders: async (): Promise<AiCatalogProvider[]> =>
    parseAiCatalogProviders(await invoke<unknown>((api) => api.ai.catalog.providers())),
  getAiCatalogModels: async (providerKey: string): Promise<AiCatalogModel[]> =>
    parseAiCatalogModels(await invoke<unknown>((api) => api.ai.catalog.models(providerKey))),
  configureAi: (settings: AiSettingsInput): Promise<unknown> =>
    invoke<unknown>((api) => api.ai.configure(settings)),
  testAiSettings: (settings: AiSettingsInput): Promise<unknown> =>
    invoke<unknown>((api) => api.ai.testWithSettings(settings)),
  listKnowledgeDocs: async (): Promise<KnowledgeDoc[]> => {
    const value = await invoke<unknown>((api) => api.ai.knowledge.list());
    if (!Array.isArray(value)) throw new Error('知识库数据无效');
    return value as KnowledgeDoc[];
  },
  importKnowledgeDocs: (filePaths: string[]): Promise<{ count: number }> =>
    invoke<{ count: number }>((api) => api.ai.knowledge.import(filePaths)),
  removeKnowledgeDoc: async (docId: string): Promise<boolean> => {
    // 信封 data 实际形状是 { removed: boolean }（myst-api.d.ts 已按运行时修正）
    const value = await invoke<{ removed: boolean }>((api) => api.ai.knowledge.remove(docId));
    return value.removed ?? false;
  },
  describeAiToolProviders: async (): Promise<AiToolProviderDescriptor[]> => {
    const value = await invoke<unknown>((api) => api.ai.tools.describe());
    if (!Array.isArray(value)) throw new Error('工具数据无效');
    return value as AiToolProviderDescriptor[];
  },
  setAiToolProviderEnabled: (id: string, enabled: boolean): Promise<unknown> =>
    invoke<unknown>((api) => api.ai.tools.setProviderEnabled(id, enabled)),
  listAiMcp: (): Promise<AiMcpInfo> => invoke<AiMcpInfo>((api) => api.ai.mcp.list()),
  saveAiMcpServers: (servers: AiMcpInfo['servers']): Promise<unknown> =>
    invoke<unknown>((api) => api.ai.mcp.save(servers)),
  listAiSessions: async (): Promise<AiSessionSummary[]> => {
    const value = await invoke<unknown>((api) => api.ai.sessions.list());
    if (!Array.isArray(value)) throw new Error('会话数据无效');
    return value as AiSessionSummary[];
  },
  renameAiSession: (id: string, title: string): Promise<unknown> =>
    invoke<unknown>((api) => api.ai.sessions.rename(id, title)),
  regenerateAiSessionTitle: (id: string): Promise<{ title: string }> =>
    invoke<{ title: string }>((api) => api.ai.sessions.generateTitle(id)),
  deleteAiSession: (id: string): Promise<boolean> =>
    invoke<boolean>((api) => api.ai.sessions.delete(id)),
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/renderer-react/api/client.test.ts
```

Expected: PASS（新 describe 4 个 test + 既有测试全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer-react/api/client.ts src/renderer-react/api/client.test.ts
git commit -m "feat(settings): apiClient surface for catalog, tools, knowledge, sessions"
```

---

### Task 3: settingsQueries

**Files:**
- Create: `src/renderer-react/features/settings/settingsQueries.ts`

- [ ] **Step 1: 实现（数据层薄，无独立测试——由 Task 6/7 的组件测试覆盖）**

`src/renderer-react/features/settings/settingsQueries.ts`（新文件，模式对照 `profileQueries.ts`）：

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

// 查询 hooks only——mutations 由 Section 组件直接调 apiClient（与 AiStatusPanel 同模式），
// 避免造一层无人使用的包装（YAGNI）。
export const aiQueryKeys = {
  status: ['ai', 'status'] as const,
  catalogProviders: ['ai', 'catalog', 'providers'] as const,
  catalogModels: (providerKey: string) => ['ai', 'catalog', 'models', providerKey] as const,
  knowledge: ['ai', 'knowledge'] as const,
  tools: ['ai', 'tools'] as const,
  mcp: ['ai', 'mcp'] as const,
  sessions: ['ai', 'sessions'] as const,
};

export function useAiStatus() {
  return useQuery({ queryKey: aiQueryKeys.status, queryFn: apiClient.getAiStatus });
}

export function useAiCatalogProviders() {
  return useQuery({ queryKey: aiQueryKeys.catalogProviders, queryFn: apiClient.getAiCatalogProviders });
}

export function useAiCatalogModels(providerKey: string) {
  return useQuery({
    queryKey: aiQueryKeys.catalogModels(providerKey),
    queryFn: () => apiClient.getAiCatalogModels(providerKey),
    enabled: providerKey !== '',
  });
}

export function useKnowledgeDocs() {
  return useQuery({ queryKey: aiQueryKeys.knowledge, queryFn: apiClient.listKnowledgeDocs });
}

export function useAiToolProviders() {
  return useQuery({ queryKey: aiQueryKeys.tools, queryFn: apiClient.describeAiToolProviders });
}

export function useAiMcp() {
  return useQuery({ queryKey: aiQueryKeys.mcp, queryFn: apiClient.listAiMcp });
}

export function useAiSessions() {
  return useQuery({ queryKey: aiQueryKeys.sessions, queryFn: apiClient.listAiSessions });
}
```

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```

Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/renderer-react/features/settings/settingsQueries.ts
git commit -m "feat(settings): query hooks for the settings surface"
```

---

### Task 4: MaxTokensControl（滑条 + 数字输入联动）

**Files:**
- Create: `src/renderer-react/features/settings/MaxTokensControl.tsx`
- Test: `src/renderer-react/features/settings/MaxTokensControl.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/settings/MaxTokensControl.test.tsx`（新文件）：

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MaxTokensControl } from './MaxTokensControl';

function setup(value: number, max: number, onChange = vi.fn()) {
  const view = render(
    <MaxTokensControl value={value} max={max} onChange={onChange} limitLabel="当前模型上限 262144" ariaLabel="最大 Token 数" />,
  );
  return { ...view, onChange };
}

test('slider and number input render the same value; typed input clamps to the model limit', () => {
  const { onChange } = setup(4096, 262144);
  const range = screen.getByRole('slider', { name: '最大 Token 数' }) as HTMLInputElement;
  const number = screen.getByRole('spinbutton', { name: '最大 Token 数' }) as HTMLInputElement;
  expect(range.value).toBe('4096');
  expect(number.value).toBe('4096');
  // 受控组件：用 fireEvent.change 一次性赋值，避免逐键 typing 与父级未回写的冲突
  fireEvent.change(number, { target: { value: '999999' } });
  expect(onChange).toHaveBeenLastCalledWith(262144);
});

test('slider changes clamp into [min, max] and report the value', () => {
  const { onChange } = setup(4096, 262144);
  fireEvent.change(screen.getByRole('slider', { name: '最大 Token 数' }), { target: { value: '1' } });
  expect(onChange).toHaveBeenLastCalledWith(512); // clamped up to min
  fireEvent.change(screen.getByRole('slider', { name: '最大 Token 数' }), { target: { value: '999999' } });
  expect(onChange).toHaveBeenLastCalledWith(262144); // clamped down to max
});

test('blur after invalid input restores the last valid value', () => {
  setup(4096, 262144);
  const number = screen.getByRole('spinbutton', { name: '最大 Token 数' }) as HTMLInputElement;
  fireEvent.change(number, { target: { value: '' } }); // mid-typing: ignored
  fireEvent.blur(number);
  expect(number.value).toBe('4096');
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/renderer-react/features/settings/MaxTokensControl.test.tsx
```

Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/settings/MaxTokensControl.tsx`（新文件）：

```tsx
import { useId } from 'react';

interface MaxTokensControlProps {
  value: number;
  max: number;
  min?: number;
  step?: number;
  limitLabel: string;
  ariaLabel: string;
  onChange(value: number): void;
}

/**
 * Slider + number-input combo for maxTokens (spec §4). Both controls share one
 * value; typed input is clamped to [min, max] on change, and blur restores the
 * last valid value so half-typed or invalid states never reach the form state.
 */
export function MaxTokensControl({ value, max, min = 512, step = 512, limitLabel, ariaLabel, onChange }: MaxTokensControlProps) {
  const id = useId();
  const clamp = (candidate: number) => Math.max(min, Math.min(candidate, max));
  return (
    <div className="maxtokens">
      <label htmlFor={`${id}-range`}>{ariaLabel}</label>
      <input
        id={`${id}-range`} type="range" aria-label={ariaLabel}
        min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <input
        id={`${id}-number`} type="number" aria-label={ariaLabel}
        className="maxtokens__number"
        min={min} max={max} value={value}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === '') return; // mid-typing; normalize on blur
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        onBlur={(event) => { event.target.value = String(value); }}
      />
      <span className="maxtokens__value">{value}</span>
      <span className="maxtokens__limit">{limitLabel}</span>
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/renderer-react/features/settings/MaxTokensControl.test.tsx
```

Expected: PASS（3 个 test）。

- [ ] **Step 5: Commit**

```bash
git add src/renderer-react/features/settings/MaxTokensControl.tsx src/renderer-react/features/settings/MaxTokensControl.test.tsx
git commit -m "feat(settings): maxTokens slider + number input combo"
```

---

### Task 5: 四个 Section 组件

**Files:**
- Create: `src/renderer-react/features/settings/AiConfigSection.tsx`
- Create: `src/renderer-react/features/settings/ToolsAndMcpSection.tsx`
- Create: `src/renderer-react/features/settings/KnowledgeSection.tsx`
- Create: `src/renderer-react/features/settings/SessionsSection.tsx`
- Create: `src/renderer-react/features/settings/settings.css`

本 Task 的行为断言进 Task 7 的 SettingsPage 集成测试；先实现组件，测试在 Task 7 一并落地（表单态组件多、单独 mock 成本高，集成断言性价比更高）。

- [ ] **Step 1: settings.css**

`src/renderer-react/features/settings/settings.css`（新文件；类名沿用 shell 既有 CSS 变量风格）：

```css
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  max-width: 720px;
}

.settings-section {
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 16px;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-section h2 {
  margin: 0;
  font-size: 15px;
}

.settings-field {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: center;
  gap: 12px;
}

.settings-field label {
  font-size: 12px;
  color: var(--text-secondary);
}

.settings-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.settings-input, .settings-select {
  padding: 6px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  color: var(--text-primary);
  border-radius: 4px;
}

.settings-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font-size: 12px;
}

.settings-item-name {
  font-weight: 600;
}

.settings-item-meta {
  color: var(--text-muted);
  margin-left: 8px;
}

.maxtokens {
  display: flex;
  align-items: center;
  gap: 8px;
}

.maxtokens input[type='range'] {
  flex: 1;
}

.maxtokens__number {
  width: 96px;
  padding: 4px 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  color: var(--text-primary);
  border-radius: 4px;
}

.maxtokens__value {
  min-width: 48px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.maxtokens__limit {
  font-size: 12px;
  color: var(--text-muted);
}

.settings-feedback {
  font-size: 12px;
  min-height: 16px;
}

.settings-feedback[data-kind='error'] { color: var(--danger, #f44747); }
.settings-feedback[data-kind='success'] { color: var(--success, #4ec9b0); }
```

（若 shell 未定义这些 CSS 变量名，执行时对照 `src/renderer-react/styles/` 中已有变量修正——**以 typecheck/视觉冒烟为准**，不阻塞。）

- [ ] **Step 2: AiConfigSection**

`src/renderer-react/features/settings/AiConfigSection.tsx`（新文件）：

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { AiCatalogProvider, AiSettingsInput, AiStatus } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useAiCatalogModels } from './settingsQueries';
import { MaxTokensControl } from './MaxTokensControl';

const FALLBACK_MAX_TOKENS = 8192;

interface AiConfigSectionProps {
  status: AiStatus | undefined;
  providers: AiCatalogProvider[] | undefined;
  onSaved(): void;
}

const CUSTOM_MODEL = '__custom__';

/**
 * AI 配置区。未提交的表单值保留在本地 state（迁移设计 §11）；保存走
 * ai:configure（凭据由主进程 safeStorage 处理），成功后由父级 invalidate status。
 */
export function AiConfigSection({ status, providers, onSaved }: AiConfigSectionProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [modelIsCustom, setModelIsCustom] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'testing'>('idle');

  // 模型列表跟随【表单草稿】的 provider（不是持久化 status）——切换 provider 立即刷新
  const models = useAiCatalogModels(provider);

  // Initialize the form once status arrives; don't clobber user edits afterwards.
  useEffect(() => {
    if (!status) return;
    setProvider((current) => current || status.provider || 'openai');
    setModel((current) => current || status.model || '');
    setBaseUrl((current) => current || status.baseUrl || '');
    if (typeof status.temperature === 'number') setTemperature(status.temperature);
    if (typeof status.maxTokens === 'number') setMaxTokens(status.maxTokens);
  }, [status]);

  const providerNeedsKey = useMemo(
    () => !(providers ?? []).some((p) => p.key === provider && !p.needsKey),
    [providers, provider],
  );

  const modelList = models.data ?? [];
  const selectedModel = modelList.find((m) => m.id === model);
  const modelLimit = selectedModel ? selectedModel.limitOutput : FALLBACK_MAX_TOKENS;
  // 切到上限更小的模型时，已存值 clamp 到新上限（避免滑条/数字框上下文不一致）
  const effectiveMaxTokens = Math.min(maxTokens ?? modelLimit, modelLimit);

  const modelOptions = modelList.map((m) => ({
    value: m.id,
    label: `${m.name} · ${m.limitContext} ctx · ${m.costInput}/${m.costOutput} $/M`,
  }));

  function draft(): AiSettingsInput {
    const settings: AiSettingsInput = {
      provider,
      model,
      temperature,
      maxTokens: effectiveMaxTokens,
    };
    if (baseUrl) settings.baseUrl = baseUrl;
    if (apiKey) settings.apiKey = apiKey;
    return settings;
  }

  async function onSave() {
    setBusy('saving');
    setFeedback(null);
    try {
      await apiClient.configureAi(draft());
      setFeedback({ kind: 'success', text: t('settings.saved') });
      setApiKey('');
      onSaved();
    } catch (error) {
      setFeedback({ kind: 'error', text: t('settings.saveFailed', { message: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy('idle');
    }
  }

  async function onTest() {
    setBusy('testing');
    setFeedback(null);
    try {
      await apiClient.testAiSettings(draft());
      setFeedback({ kind: 'success', text: t('settings.testSuccess') });
    } catch (error) {
      setFeedback({ kind: 'error', text: t('settings.testFailed', { message: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy('idle');
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-ai-config">
      <h2 id="settings-ai-config">{t('settings.aiConfig')}</h2>
      <p className="settings-hint">{t('settings.providerHint')}</p>
      <div className="settings-field">
        <label htmlFor="settings-provider">{t('settings.provider')}</label>
        <select
          id="settings-provider" className="settings-select" value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setModel('');
            setModelIsCustom(false);
            setMaxTokens(null); // re-resolve against the next provider's models
          }}
        >
          {(providers ?? []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div className="settings-field">
        <label htmlFor="settings-model">{t('settings.model')}</label>
        {modelList.length > 0 ? (
          <select
            id="settings-model" className="settings-select"
            value={modelIsCustom ? CUSTOM_MODEL : model}
            onChange={(event) => {
              if (event.target.value === CUSTOM_MODEL) { setModelIsCustom(true); setModel(''); return; }
              setModelIsCustom(false);
              setModel(event.target.value);
              setMaxTokens(null); // follow the newly selected model's limit
            }}
          >
            {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value={CUSTOM_MODEL}>{t('settings.catalogCustom')}</option>
          </select>
        ) : (
          <input
            id="settings-model" className="settings-input" value={model}
            placeholder={t('settings.customModelPlaceholder')}
            onChange={(event) => setModel(event.target.value)}
          />
        )}
      </div>
      {modelIsCustom ? (
        <div className="settings-field">
          <label htmlFor="settings-model-custom">{t('settings.customModelPlaceholder')}</label>
          <input
            id="settings-model-custom" className="settings-input" value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>
      ) : null}
      {providerNeedsKey ? (
        <div className="settings-field">
          <label htmlFor="settings-api-key">{t('settings.apiKey')}</label>
          <input
            id="settings-api-key" className="settings-input" type="password"
            placeholder={t('settings.apiKeyPlaceholder')} value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>
      ) : null}
      <div className="settings-field">
        <label htmlFor="settings-base-url">{t('settings.baseUrl')}</label>
        <input
          id="settings-base-url" className="settings-input" value={baseUrl}
          placeholder={t('settings.baseUrlPlaceholder')}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </div>
      <div className="settings-field">
        <label htmlFor="settings-temperature">{t('settings.temperature')}</label>
        <input
          id="settings-temperature" type="range" min={0} max={1} step={0.1} value={temperature}
          onChange={(event) => setTemperature(Number(event.target.value))}
        />
        <span className="maxtokens__value">{temperature}</span>
      </div>
      <MaxTokensControl
        value={effectiveMaxTokens}
        max={modelLimit}
        limitLabel={t('settings.maxTokensLimit', { count: modelLimit })}
        ariaLabel={t('settings.maxTokens')}
        onChange={setMaxTokens}
      />
      <div className="settings-row">
        <button type="button" disabled={busy !== 'idle'} onClick={() => { void onTest(); }}>
          {busy === 'testing' ? t('settings.testing') : t('settings.testConnection')}
        </button>
        <button type="button" disabled={busy !== 'idle' || !provider || !model} onClick={() => { void onSave(); }}>
          {busy === 'saving' ? t('settings.saving') : t('settings.save')}
        </button>
        {feedback ? <span className="settings-feedback" data-kind={feedback.kind}>{feedback.text}</span> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: ToolsAndMcpSection**

`src/renderer-react/features/settings/ToolsAndMcpSection.tsx`（新文件）：

```tsx
import { useEffect, useState } from 'react';
import type { AiMcpInfo, AiToolProviderDescriptor } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

interface ToolsAndMcpSectionProps {
  tools: AiToolProviderDescriptor[] | undefined;
  mcp: AiMcpInfo | undefined;
  onChanged(): void;
}

/** 工具开关 + MCP 增删改（行为对齐老 SettingsView：启用/保存均需 confirm）。 */
export function ToolsAndMcpSection({ tools, mcp, onChanged }: ToolsAndMcpSectionProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, AiMcpInfo['servers'][string]>>({});
  const [name, setName] = useState('');
  const [transport, setTransport] = useState('stdio');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft((mcp && mcp.servers) ? { ...mcp.servers } : {});
  }, [mcp]);

  const toolCount = mcp ? mcp.toolCount : 0;

  async function toggleProvider(id: string, enabled: boolean) {
    try {
      await apiClient.setAiToolProviderEnabled(id, enabled);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function addServer() {
    const trimmedName = name.trim();
    const trimmedTarget = target.trim();
    if (!trimmedName || !trimmedTarget) { setError(t('settings.mcpAddInvalid')); return; }
    const config: AiMcpInfo['servers'][string] = { transport, enabled: false };
    if (transport === 'stdio') {
      const parts = trimmedTarget.split(/\s+/);
      config.command = parts[0];
      config.args = parts.slice(1);
    } else {
      config.url = trimmedTarget;
    }
    setDraft((current) => ({ ...current, [trimmedName]: config }));
    setName('');
    setTarget('');
    setError('');
  }

  function toggleServer(serverName: string, enabled: boolean) {
    if (enabled && !window.confirm(t('settings.mcpEnableConfirm', { name: serverName }))) return;
    setDraft((current) => ({ ...current, [serverName]: { ...current[serverName], enabled } }));
  }

  async function save() {
    if (Object.values(draft).some((c) => c && c.enabled) && !window.confirm(t('settings.mcpSaveConfirm'))) return;
    try {
      await apiClient.saveAiMcpServers(draft);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-tools">
      <h2 id="settings-tools">{t('settings.toolsTitle')}</h2>
      <p className="settings-hint">{t('settings.toolsHint')}</p>
      <div className="settings-list">
        {(tools ?? []).map((provider) => (
          <label key={provider.id} className="settings-list-item">
            <span>
              <input
                type="checkbox" checked={provider.enabled}
                onChange={(event) => { void toggleProvider(provider.id, event.target.checked); }}
              />
              <span className="settings-item-name">{provider.id}</span>
              <span className="settings-item-meta">{provider.tools.length}</span>
            </span>
          </label>
        ))}
      </div>
      <h3>{t('settings.mcpTitle')}</h3>
      <p className="settings-hint">{t('settings.mcpHint', { count: toolCount })}</p>
      <div className="settings-list">
        {Object.keys(draft).length === 0
          ? <span className="settings-hint">{t('settings.mcpEmpty')}</span>
          : Object.entries(draft).map(([serverName, config]) => (
            <div key={serverName} className="settings-list-item">
              <label>
                <input
                  type="checkbox" checked={!!config.enabled}
                  onChange={(event) => toggleServer(serverName, event.target.checked)}
                />
                <span className="settings-item-name">{serverName}</span>
              </label>
              <span className="settings-item-meta">
                {(config.transport || (config.url ? 'http' : 'stdio'))}
                {' · '}
                {config.url || [config.command, ...(config.args ?? [])].join(' ')}
              </span>
              <button type="button" onClick={() => setDraft((current) => {
                const next = { ...current }; delete next[serverName]; return next;
              })}>{t('settings.removeDoc')}</button>
            </div>
          ))}
      </div>
      <div className="settings-row">
        <input className="settings-input" placeholder={t('settings.mcpName')} value={name} onChange={(event) => setName(event.target.value)} />
        <select className="settings-select" value={transport} onChange={(event) => setTransport(event.target.value)}>
          <option value="stdio">stdio</option>
          <option value="sse">sse</option>
          <option value="http">http</option>
        </select>
        <input className="settings-input" placeholder={t('settings.mcpTargetHint')} value={target} onChange={(event) => setTarget(event.target.value)} />
        <button type="button" onClick={addServer}>{t('settings.mcpAdd')}</button>
        <button type="button" onClick={() => { void save(); }}>{t('settings.mcpSave')}</button>
      </div>
      {error ? <span className="settings-feedback" data-kind="error">{error}</span> : null}
    </section>
  );
}
```

- [ ] **Step 4: KnowledgeSection**

`src/renderer-react/features/settings/KnowledgeSection.tsx`（新文件）：

```tsx
import { useRef } from 'react';
import type { KnowledgeDoc } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

interface KnowledgeSectionProps {
  docs: KnowledgeDoc[] | undefined;
  onChanged(): void;
}

/** 知识库：内置 + 用户文档。导入用 HTML file input + Electron File.path（老层机制）。 */
export function KnowledgeSection({ docs, onChanged }: KnowledgeSectionProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const builtin = (docs ?? []).filter((d) => d.source === 'builtin');
  const user = (docs ?? []).filter((d) => d.source === 'user');

  async function onImport(files: FileList | null) {
    if (!files || !files.length) return;
    // Electron extends File with `path` (absolute filesystem path). If a future
    // Electron drops it, switch the preload to expose webUtils.getPathForFile.
    const paths = Array.from(files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((p): p is string => !!p);
    if (!paths.length) return;
    try {
      await apiClient.importKnowledgeDocs(paths);
      onChanged();
    } catch { /* 主进程信封错误经 apiClient 抛出；静默避免打断列表操作 */ }
  }

  async function onRemove(doc: KnowledgeDoc) {
    if (!window.confirm(t('settings.removeConfirm', { name: doc.name }))) return;
    try {
      await apiClient.removeKnowledgeDoc(doc.id);
      onChanged();
    } catch { /* best-effort */ }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-knowledge">
      <h2 id="settings-knowledge">{t('settings.knowledge')}</h2>
      <p className="settings-hint">{t('settings.builtinDocs', { count: builtin.length })}</p>
      <div className="settings-list">
        {builtin.map((doc) => (
          <div key={doc.id} className="settings-list-item">
            <span><span className="settings-item-name">{doc.name}</span><span className="settings-item-meta">builtin</span></span>
          </div>
        ))}
      </div>
      <p className="settings-hint">{t('settings.userDocs', { count: user.length })}</p>
      <div className="settings-list">
        {user.map((doc) => (
          <div key={doc.id} className="settings-list-item">
            <span><span className="settings-item-name">{doc.name}</span><span className="settings-item-meta">user</span></span>
            <button type="button" onClick={() => { void onRemove(doc); }}>{t('settings.removeDoc')}</button>
          </div>
        ))}
      </div>
      <input
        ref={fileInputRef} type="file" accept=".md,.txt,.pdf" multiple hidden
        onChange={(event) => { void onImport(event.target.files); }}
      />
      <div className="settings-row">
        <button type="button" onClick={() => fileInputRef.current?.click()}>{t('settings.importDocs')}</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: SessionsSection**

`src/renderer-react/features/settings/SessionsSection.tsx`（新文件）：

```tsx
import { useState } from 'react';
import type { AiSessionSummary } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

interface SessionsSectionProps {
  sessions: AiSessionSummary[] | undefined;
  onChanged(): void;
}

/** 对话管理：重命名 / 重新生成标题 / 删除（prompt+confirm 对齐老层交互）。 */
export function SessionsSection({ sessions, onChanged }: SessionsSectionProps) {
  const { t } = useI18n();
  const [error, setError] = useState('');

  function sessionLabel(session: AiSessionSummary): string {
    if (session.title) return session.title;
    const firstUser = (session.messages || []).find((m) => m.role === 'user');
    return firstUser && firstUser.content ? firstUser.content.slice(0, 24) : t('settings.sessionUntitled');
  }

  async function onRename(session: AiSessionSummary) {
    const next = window.prompt(t('settings.sessionRenamePrompt'), session.title || sessionLabel(session));
    if (next == null) return;
    const title = next.trim();
    if (!title) return;
    try {
      await apiClient.renameAiSession(session.id, title);
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onRegenTitle(session: AiSessionSummary) {
    try {
      const { title } = await apiClient.regenerateAiSessionTitle(session.id);
      if (!title) setError(t('settings.sessionTitleFailed'));
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onDelete(session: AiSessionSummary) {
    if (!window.confirm(t('ai.deleteSessionConfirm'))) return;
    try {
      await apiClient.deleteAiSession(session.id);
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-sessions">
      <h2 id="settings-sessions">{t('settings.sessions')}</h2>
      <p className="settings-hint">{t('settings.sessionsHint', { count: (sessions ?? []).length })}</p>
      <div className="settings-list">
        {(sessions ?? []).length === 0
          ? <span className="settings-hint">{t('settings.sessionsEmpty')}</span>
          : (sessions ?? []).map((session) => (
            <div key={session.id} className="settings-list-item">
              <span><span className="settings-item-name">{sessionLabel(session)}</span>
                <span className="settings-item-meta">{t('settings.sessionMeta', {
                  count: (session.messages || []).length,
                  date: (session.updatedAt || session.createdAt || '').slice(0, 10),
                })}</span></span>
              <span className="settings-row">
                <button type="button" onClick={() => { void onRegenTitle(session); }}>{t('settings.sessionRegenTitle')}</button>
                <button type="button" onClick={() => { void onRename(session); }}>{t('settings.sessionRename')}</button>
                <button type="button" onClick={() => { void onDelete(session); }}>{t('settings.removeDoc')}</button>
              </span>
            </div>
          ))}
      </div>
      {error ? <span className="settings-feedback" data-kind="error">{error}</span> : null}
    </section>
  );
}
```

- [ ] **Step 6: typecheck**

```bash
npm run typecheck
```

Expected: 通过（组件尚未被引用，纯编译验证）。

- [ ] **Step 7: Commit**

```bash
git add src/renderer-react/features/settings/
git commit -m "feat(settings): settings section components"
```

---

### Task 6: SettingsPage 组装 + 路由接入 + AiStatusPanel 跳转

**Files:**
- Create: `src/renderer-react/features/settings/SettingsPage.tsx`
- Modify: `src/renderer-react/shell/AppShell.tsx`
- Modify: `src/renderer-react/shell/AiStatusPanel.tsx`
- Test: `src/renderer-react/features/settings/SettingsPage.test.tsx`
- Test: `src/renderer-react/shell/AppShell.test.tsx`（新增 settings 路由用例）

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/settings/SettingsPage.test.tsx`（新文件；mock 模式照 `ProfilePage.test.tsx`）：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import locale from '../../../../locale/zh.json';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { DirtyNavigationProvider } from '../../shell/DirtyNavigationProvider';
import { SettingsPage } from './SettingsPage';

const providers = [
  { key: 'deepseek', label: 'DeepSeek', catalogId: 'deepseek', needsKey: true, modelCount: 2 },
  { key: 'ollama', label: 'Ollama (本地)', catalogId: null, needsKey: false, modelCount: 0 },
];
const models = [
  { id: 'deepseek-v4-flash', name: 'V4 Flash', limitContext: 1000000, limitOutput: 384000, costInput: 0.15, costOutput: 0.6, releaseDate: '2026-09-10' },
];
const status = { configured: true, provider: 'deepseek', model: 'deepseek-v4-flash', baseUrl: '', temperature: 0.7, maxTokens: 4096, knowledgeDocCount: 3 };
const tools = [{ id: 'kb', category: 'knowledge', enabled: true, ready: true, tools: [{ name: 'search_knowledge', description: '检索知识库' }] }];
const mcp = { servers: { demo: { enabled: false, transport: 'http', url: 'https://mcp.example/sse' } }, toolCount: 0, connected: false };
const knowledge = [
  { id: 'b1', name: 'builtin.md', source: 'builtin', importedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u1', name: 'user.md', source: 'user', importedAt: '2026-02-01T00:00:00.000Z' },
];
const sessions = [{ id: 's1', title: '星盘解读', messages: [{ role: 'user', content: '解读' }], createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }];

function installApi(overrides: Record<string, unknown> = {}) {
  const ai: Record<string, unknown> = {
    status: vi.fn().mockResolvedValue({ ok: true, data: status }),
    configure: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
    testWithSettings: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
    catalog: {
      providers: vi.fn().mockResolvedValue({ ok: true, data: providers }),
      models: vi.fn().mockResolvedValue({ ok: true, data: models }),
    },
    tools: { describe: vi.fn().mockResolvedValue({ ok: true, data: tools }), setProviderEnabled: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }) },
    mcp: { list: vi.fn().mockResolvedValue({ ok: true, data: mcp }), save: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }) },
    knowledge: { list: vi.fn().mockResolvedValue({ ok: true, data: knowledge }), import: vi.fn().mockResolvedValue({ ok: true, data: { count: 1 } }), remove: vi.fn().mockResolvedValue({ ok: true, data: true }) },
    sessions: { list: vi.fn().mockResolvedValue({ ok: true, data: sessions }), rename: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }), generateTitle: vi.fn().mockResolvedValue({ ok: true, data: { title: '新标题' } }), delete: vi.fn().mockResolvedValue({ ok: true, data: true }) },
    onStatusChanged: vi.fn(() => () => {}),
    ...overrides,
  };
  const api = { ai };
  vi.stubGlobal('mystApi', api);
  return api;
}

function setup() {
  const api = installApi();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onNavigate = vi.fn();
  const view = render(
    <QueryClientProvider client={client}><I18nProvider dictionary={locale}><DirtyNavigationProvider>
      <SettingsPage onNavigate={onNavigate} />
    </DirtyNavigationProvider></I18nProvider></QueryClientProvider>,
  );
  return { ...view, api, client, onNavigate };
}

test('renders all four sections with catalog-driven data', async () => {
  setup();
  expect(await screen.findByRole('heading', { name: locale.settings.aiConfig })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.settings.toolsTitle })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.settings.knowledge })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.settings.sessions })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /V4 Flash · 1000000 ctx/ })).toBeInTheDocument();
  expect(screen.getByText('user.md')).toBeInTheDocument();
  expect(screen.getByText('星盘解读')).toBeInTheDocument();
  expect(screen.getByText(locale.settings.maxTokensLimit.replace('{{count}}', '384000'))).toBeInTheDocument();
});

test('saving posts the draft with the model-aware maxTokens value', async () => {
  const { api } = setup();
  await screen.findByRole('heading', { name: locale.settings.aiConfig });
  await userEvent.click(screen.getByRole('button', { name: locale.settings.save }));
  await waitFor(() => expect(api.ai.configure).toHaveBeenCalled());
  const draft = (api.ai.configure as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(draft.provider).toBe('deepseek');
  expect(draft.model).toBe('deepseek-v4-flash');
  expect(draft.maxTokens).toBe(4096); // 已存值原样生效（用户偏好优先）
  expect(screen.getByText(locale.settings.saved)).toBeInTheDocument();
});

test('switching provider refetches models and re-clamps maxTokens to the next limit', async () => {
  const { api } = setup();
  await screen.findByRole('heading', { name: locale.settings.aiConfig });
  (api.ai.catalog.models as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: [{ id: 'qwen3.7-max', name: 'Qwen3.7 Max', limitContext: 1000000, limitOutput: 65536, costInput: 2.5, costOutput: 7.5, releaseDate: '2026-05-21' }],
  });
  await userEvent.selectOptions(screen.getByLabelText(locale.settings.provider), 'ollama');
  await waitFor(() => expect(api.ai.catalog.models).toHaveBeenCalledWith('ollama'));
  expect(await screen.findByText(locale.settings.maxTokensLimit.replace('{{count}}', '65536'))).toBeInTheDocument();
});
```

`src/renderer-react/shell/AppShell.test.tsx` 两处修改：

先修字典——设置页需要完整的 `settings.*` / `ai.*` key，把字典定义里的两行替换为 spread 版本：

```tsx
  ai: { ...locale.ai, title: 'AI 占星顾问' },
  // …
  settings: { ...locale.settings, title: 'AI 设置', provider: '供应商', model: '模型' },
```

再追加用例（`renderShell` 与 mystApi stub 已有）：

```tsx
test('settings route renders the settings page instead of the placeholder', async () => {
  const user = userEvent.setup();
  const api = window.mystApi;
  Object.assign(api, {
    ai: {
      status: vi.fn().mockResolvedValue({ ok: true, data: { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 } }),
      onStatusChanged: vi.fn(() => vi.fn()), initStatus: vi.fn(), onInitProgress: vi.fn(),
      configure: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
      testWithSettings: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
      catalog: {
        providers: vi.fn().mockResolvedValue({ ok: true, data: [{ key: 'openai', label: 'OpenAI', catalogId: 'openai', needsKey: true, modelCount: 0 }] }),
        models: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      tools: { describe: vi.fn().mockResolvedValue({ ok: true, data: [] }), setProviderEnabled: vi.fn() },
      mcp: { list: vi.fn().mockResolvedValue({ ok: true, data: { servers: {}, toolCount: 0, connected: false } }), save: vi.fn() },
      knowledge: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }), import: vi.fn(), remove: vi.fn() },
      sessions: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }), rename: vi.fn(), generateTitle: vi.fn(), delete: vi.fn() },
    },
  });
  renderShell();

  await user.click(screen.getByRole('button', { name: '设置' }));
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('AI 设置');
  expect(screen.queryByText(/将在后续迁移阶段启用/)).not.toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: dictionary.settings.aiConfig })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/renderer-react/features/settings/SettingsPage.test.tsx src/renderer-react/shell/AppShell.test.tsx
```

Expected: FAIL — `Cannot find module './SettingsPage'`；AppShell 用例因找不到设置页内容失败。

- [ ] **Step 3: 实现 SettingsPage**

`src/renderer-react/features/settings/SettingsPage.tsx`（新文件）：

```tsx
import { useQueryClient } from '@tanstack/react-query';
import type { RouteKey } from '../../shell/routes';
import { useI18n } from '../../i18n/I18nProvider';
import {
  aiQueryKeys,
  useAiCatalogProviders,
  useAiMcp,
  useAiSessions,
  useAiStatus,
  useAiToolProviders,
  useKnowledgeDocs,
} from './settingsQueries';
import { AiConfigSection } from './AiConfigSection';
import { ToolsAndMcpSection } from './ToolsAndMcpSection';
import { KnowledgeSection } from './KnowledgeSection';
import { SessionsSection } from './SessionsSection';
import './settings.css';

interface SettingsPageProps {
  onNavigate(route: RouteKey, beforeNavigate?: () => void): void;
}

/** 迁移 Phase 7：设置页实装（AI 配置 / 工具与 MCP / 知识库 / 对话管理）。 */
export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const status = useAiStatus();
  const providers = useAiCatalogProviders();
  const tools = useAiToolProviders();
  const mcp = useAiMcp();
  const knowledge = useKnowledgeDocs();
  const sessions = useAiSessions();

  const refresh = (keys: readonly (readonly unknown[])[]) => {
    void Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  };

  return (
    <div className="settings-page">
      <section className="settings-section" aria-labelledby="settings-status">
        <h2 id="settings-status">{t('settings.status')}</h2>
        <p className="settings-hint">
          {status.data
            ? (status.data.configured
              ? `${t('shell.aiConfigured')} · ${status.data.provider} · ${status.data.model}`
              : t('shell.aiNotConfigured'))
            : t('shell.loading')}
        </p>
        <p className="settings-hint">{t('shell.knowledgeCount', { count: status.data ? status.data.knowledgeDocCount : 0 })}</p>
      </section>
      <AiConfigSection
        status={status.data}
        providers={providers.data}
        onSaved={() => refresh([aiQueryKeys.status])}
      />
      <ToolsAndMcpSection
        tools={tools.data}
        mcp={mcp.data}
        onChanged={() => refresh([aiQueryKeys.tools, aiQueryKeys.mcp])}
      />
      <KnowledgeSection docs={knowledge.data} onChanged={() => refresh([aiQueryKeys.knowledge, aiQueryKeys.status])} />
      <SessionsSection sessions={sessions.data} onChanged={() => refresh([aiQueryKeys.sessions])} />
    </div>
  );
}
```

- [ ] **Step 4: AppShell 接入**

`src/renderer-react/shell/AppShell.tsx`：
1. import 区加 `import { SettingsPage } from '../features/settings/SettingsPage';`
2. 路由三元链改为：

```tsx
        {activeRoute === 'profiles' ? <ProfilePage onNavigate={navigate} />
          : activeRoute === 'personal' || activeRoute === 'relationship'
            ? <ChartWorkbenchRoute route={activeRoute} />
            : activeRoute === 'settings' ? <SettingsPage onNavigate={navigate} />
            : <section className="workspace__placeholder" aria-labelledby="workspace-title">
                <PageIcon aria-hidden="true" size={34} strokeWidth={1.5} />
                <p>{t('shell.placeholder', { title })}</p>
              </section>}
```

- [ ] **Step 5: AiStatusPanel 跳转**

`src/renderer-react/shell/AiStatusPanel.tsx`：
1. props 增加 `onNavigate`：

```tsx
import type { RouteKey } from './routes';
// …
export function AiStatusPanel({ onNavigate }: { onNavigate?: (route: RouteKey) => void }) {
```

2. 未配置态（`status.configured === false`）时在 `<p className="ai-status__state">` 之后渲染：

```tsx
          {onNavigate ? (
            <p className="ai-status__configure">
              <button type="button" onClick={() => onNavigate('settings')}>
                {t('ai.notConfigured')}「{t('ai.goToSettings')}」{t('ai.toConfigure')}
              </button>
            </p>
          ) : null}
```

3. `AppShell.tsx` 的 `PanelLayout` 调用改为 `ai={<AiStatusPanel onNavigate={navigate} />}`。

- [ ] **Step 6: 跑测试确认通过**

```bash
npx vitest run src/renderer-react/features/settings/ src/renderer-react/shell/AppShell.test.tsx
```

Expected: PASS（含既有 AppShell 用例——原 placeholder 用例不点设置路由，不受影响）。

- [ ] **Step 7: typecheck + 全量 renderer 测试**

```bash
npm run typecheck && npm run test:renderer
```

Expected: 全绿。

- [ ] **Step 8: Commit**

```bash
git add src/renderer-react/features/settings/ src/renderer-react/shell/AppShell.tsx src/renderer-react/shell/AiStatusPanel.tsx src/renderer-react/shell/AppShell.test.tsx
git commit -m "feat(settings): react settings page replaces the placeholder route"
```

---

### Task 7: React 冒烟断言

**Files:**
- Modify: `tests/SmokeReactRenderer.js`
- Modify: `tests/SmokeReactRenderer.test.js`

- [ ] **Step 1: 冒烟脚本加设置路由探针**

在 `tests/SmokeReactRenderer.js` 中（找到既有 profile 冒烟完成后、chart 模式之前的顺序段），追加一个设置路由阶段。定位标记：`chartSmokeStage` 初始化附近。插入：

```js
// Settings route smoke: placeholder gone, AI config section renders.
const settingsVerified = await poll(win, 'settings route', () => {
  const nav = [...document.querySelectorAll('nav button')].find((b) => b.textContent.trim() === '设置');
  if (!nav) return { ready: false };
  nav.click();
  const h1 = document.querySelector('#workspace-title');
  const hasAiConfig = !!document.querySelector('.settings-section h2');
  const placeholderGone = !document.body.textContent.includes('将在后续迁移阶段启用') || !document.querySelector('.workspace__placeholder');
  return { ready: !!(h1 && h1.textContent.includes('AI') && hasAiConfig), value: true, placeholderGone };
}).catch(() => false);
if (!settingsVerified) fail('settings route did not render the settings page');
```

注意：`poll` 的 probe 返回 `{ ready, value }`；此处点击发生在 probe 内部属幂等操作（重复点击同一 nav 无副作用）。把该段放在 profile 断言通过之后执行一次即可（不必进 chart 模式分支）。

同时在文件顶部 `const errors = [];` 附近加 `let settingsVerified = false;` 并在上述代码处赋值，便于失败信息聚合。

- [ ] **Step 2: 结构测试加断言**

`tests/SmokeReactRenderer.test.js` 末尾追加：

```js
test('React smoke verifies the migrated settings route', () => {
  assert.match(source, /settings route/);
  assert.match(source, /settingsVerified/);
  assert.match(source, /workspace__placeholder/);
});
```

- [ ] **Step 3: 跑结构测试**

```bash
node --test tests/SmokeReactRenderer.test.js
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/SmokeReactRenderer.js tests/SmokeReactRenderer.test.js
git commit -m "test(smoke): assert the react settings route renders"
```

---

### Task 8: 全量验证

- [ ] **Step 1: renderer 全家桶**

```bash
npm run verify:renderer
```

Expected: test:security + test:preload + test:renderer + typecheck + build:renderer 全绿。

- [ ] **Step 2: React 冒烟**

```bash
npm run smoke:react
```

Expected: 冒烟通过，含新的 settings route 阶段。

- [ ] **Step 3: node 测试回归**

```bash
npm test
```

Expected: 全绿（Plan 1 的测试不受本计划影响）。

- [ ] **Step 4: 手工矩阵**

```bash
npm run start:react
```

- 导航点「设置」→ 四区块渲染，AI 配置区 provider 下拉为 13 家白名单；
- 选中模型后 maxTokens 滑条上限与旁注跟随模型真实上限，数字输入可键入并 clamp；
- 「自定义…」显示自由输入框；API key 保存后重进显示「已配置 ✓」路径（状态摘要 + 顶部 AiStatusPanel 均刷新）；
- AiStatusPanel 未配置态出现「去设置」按钮，点击跳转 settings 路由；
- 知识库导入（选一个 .md）/移除；MCP 增删改；对话重命名/删除——行为与老设置页一致（confirm 文案相同）。

- [ ] **Step 5: 收尾**

```bash
git status --short
git log --oneline -7
```

Expected: 工作区干净，本计划 7 个提交（Task 1-7）。
