# React 设置页设计 · React SettingsPage Design（迁移 Phase 7）

> 日期：2026-09-20
> 状态：待 review
> 上游依赖：`2026-09-20-provider-catalog-design.md`（提供 `ai:catalog:*` IPC 与截断事件）
> 所属路线：React 渲染层迁移第 7 步（见 `2026-08-01-react-workbench-redesign-design.md` §13）

## 0. 背景与动机

React 渲染层已完成 shell / 档案 / 星盘工作台（迁移路线 1-4 步），`settings` 路由仍是占位页
——**React 用户当前完全无法配置 AI**（无设置界面）。老渲染层 `SettingsView.js`（vanilla DOM）
仍在服役，但 Phase 9 cutover 后将删除。

provider 目录化（同日 spec）恰好需要新的设置 UI：模型下拉、模型感知 maxTokens 控件。两者在
Phase 7 交汇：**本 spec 把设置页完整实装到 React，一并完成迁移第 7 步与目录 UI 落地**。

## 1. 目标与非目标

**目标**

1. React `settings` 路由从占位变实装，功能对老 `SettingsView.js` 达成 parity：
   - AI 配置（provider / model / API key / baseUrl / temperature / maxTokens / 测试连接 / 保存）
   - 工具与 MCP（provider 开关、MCP server 增删改、启用确认）
   - 知识库（列表 / 导入 / 移除 / 计数）
   - 对话管理（sessions 列表 / 重命名 / 重新生成标题 / 删除）
2. 消费 provider 目录 IPC：模型下拉目录化、maxTokens 控件模型感知。
3. AiStatusPanel 增加"去设置"跳转（未配置时直达）。

**非目标**

- 不迁移 `chinese` / `solarTerms` 路由（迁移第 5 步，另立计划）。
- 不做 AI 聊天 UI（迁移第 6 步；截断提示仍落在老层 AiSidebar，React 化时复用同一事件）。
- 不删除老渲染层（迁移第 9 步 cutover 后才删）。
- 不改设置持久化格式（`ai-settings.json` / `ai-credentials.json` / `config.json` 不变）。

## 2. 路由接入

- `AppShell.tsx`：settings 分支渲染 `<SettingsPage onNavigate={navigate} />`；eager import
  （同 ProfilePage——设置页无重依赖，不需要 charts 式 lazy + Suspense）。
- 移除 settings 路由的 `workspace__placeholder` 分支；`chinese` / `solarTerms` 占位保留。
- `shell.placeholder` i18n 文案保留（仍有两个路由在用）。

## 3. 数据层（遵循迁移设计文档 §11 状态归属）

**查询（TanStack Query）**：

| Query key | IPC | 说明 |
|---|---|---|
| `['ai','status']` | `ai:status` | provider/model/maxTokens/知识库计数 |
| `['ai','catalog','providers']` | `ai:catalog:providers` | 白名单 + 显示名 + needsKey |
| `['ai','catalog','models',providerId]` | `ai:catalog:models` | 非 deprecated、release_date 倒序 |
| `['ai','knowledge']` | `ai:knowledge:list` | 文档列表 |
| `['ai','tools']` | `ai:tools:describe` | provider 开关列表 |
| `['ai','mcp']` | `ai:mcp:list` | servers + toolCount + connected |

**Mutations**：`ai:configure`、`ai:testWithSettings`、`ai:knowledge:import`、`ai:knowledge:remove`、
`ai:tools:setProviderEnabled`、`ai:mcp:save`——成功后 invalidate 对应 query。

**表单态**：未保存的表单值留在组件本地（迁移设计文档 §11："Uncommitted form state remains
local to its feature"）。切走路由丢弃草稿（与老层行为一致）；保存成功以 toast 提示。

**契约**：`api/contracts.ts` 补 `AiCatalogProvider` / `AiCatalogModel` / `AiToolProvider` /
`AiMcpConfig` 等类型；preload 补 `ai.catalogProviders()` / `ai.catalogModels(providerId)` 桥接
（两渲染层共享 `window.mystApi`，老层同步受益）。

## 4. 页面结构（单页三区块，卡片风格同 ProfilePage）

```
SettingsPage
├── AI 状态摘要（configured/provider/model/knowledgeDocCount，数据同 AiStatusPanel）
├── [AI 配置区]
│   ├── provider <select>（白名单 + 目录显示名）
│   ├── model <select>（目录填充：名称+上下文窗口+价格；"自定义…"回退自由输入）
│   ├── API key（输入框；保存走现有 ai:configure + safeStorage 凭据链，不明文落盘）
│   ├── baseUrl（目录 api 作初始默认值，可改——切 cn/intl 端点）
│   ├── temperature 滑条（0-1, step 0.1）
│   ├── maxTokens 控件：滑条 + 数字输入联动（见下）
│   ├── 测试连接（ai:testWithSettings，不持久化）+ 结果行内反馈
│   └── 保存（ai:configure）
├── [工具与 MCP 区]
│   ├── tool provider 开关列表（describe / setProviderEnabled）
│   └── MCP servers：名称/地址行、新增、编辑、删除、启用（confirm 文案 parity 老层）
└── [知识库区]
    ├── 计数 + 文档列表（文件名/来源/导入时间）
    ├── 导入（HTML `<input type="file">` + Electron `File.path`，老层现行机制；
    │   若所用 Electron 版本已移除 `File.path`，则在 preload 暴露
    │   `webUtils.getPathForFile` 包装 → `ai:knowledge:import`）
    └── 移除（confirm；ai:knowledge:remove）
```

**maxTokens 控件（滑条 + 数字输入联动）**：

- 同一状态驱动两个控件：`<input type="range">` + `<input type="number">`，双向同步。
- 范围 `[512, 模型 limit.output]`（模型上限 < 512 时 clamp 到 512）；直接键入超范围值时
  blur/enter 修正并 clamp；空值或非法输入回退为当前有效值。
- 旁注"当前模型上限 N"。模型不在目录（自定义/openai_compat）时 max 与默认 = 8192。
- 已存值（如 4096）原样生效，作为用户偏好优先于模型默认。

## 5. AiStatusPanel 联动

- `status.configured === false` 时显示"去设置"按钮 → `navigate('settings')`。
- 已配置态维持现状（provider/model 展示）。不引入会话/聊天功能。

## 6. i18n

- 新增 key：`settings.aiConfigTitle` / `settings.catalogCustom` / `settings.modelContext` /
  `settings.modelPrice` / `settings.maxTokensLimit`（"当前模型上限 {{count}}"）/
  `settings.saveSuccess` 等。
- 字典目前仅有 `locale/zh.json`（项目为纯中文文案），新 key 追加到该文件，无需维护英文字典。
- 尽量复用老层既有 key（`settings.provider` / `settings.model` / `settings.maxTokens` …）。

## 7. 测试策略

- **Vitest + RTL**：
  - provider → model 联动（切换后模型列表刷新、滑条 bounds 跟随 limit.output）。
  - maxTokens 控件：键入数字 ↔ 滑条同步、clamp 行为、非法输入回退。
  - 保存/测试连接 mutation 流（mock `window.mystApi`）、知识库导入/移除、MCP 增删改确认。
- **typecheck**：`npm run typecheck` 通过。
- **smoke:react**：settings 路由可渲染、占位消失、AI 区表单元素可见（沿用
  `SmokeReactRenderer.js` 模式加断言）。
- **Parity checklist**：对照老 `SettingsView.js` 逐功能勾验（保存后 `ai:statusChanged`
  推送刷新、凭据加密落盘、MCP 保存确认等）。
- **回归**：老渲染层照旧可用；`npm run verify:renderer` 全绿。

## 8. 执行顺序

1. **Plan 1 · Provider 目录化**（独立可交付）：快照脚本、CatalogService、`ai:catalog:*` IPC、
   preload、ModelProvider 改造、截断检测、老层 UI 最小同步、单测。
2. **Plan 2 · React SettingsPage**（本 spec）：消费 Plan 1 的 IPC 与类型，页面全量 + 测试。
