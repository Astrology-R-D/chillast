# AI 工作台 React 化设计 · AI Workspace Design（迁移 Phase 6：6a + 6b）

> 日期：2026-09-22
> 状态：待 review
> 所属路线：React 渲染层迁移第 6 步（`2026-08-01-react-workbench-redesign-design.md` §13）
> 形态依据：同文档 §9（AI Workspace：三模式共享会话与上下文基础设施）
> 前置：Phase 7（React 设置页）已完成；Phase 1 provider 目录化已完成（`truncated` 事件、`ai:catalog:*` 等可直接复用）

## 0. 背景与动机

React 迁移完成后剩余视图中，AI 面板是最大的一块：React 侧目前只有 AiStatusPanel（状态展示），
完整聊天体验（流式 markdown、会话管理、工具卡片、截断提示）仍在老渲染层 AiSidebar。
§9 把它定义为一个**三模式 AI 工作台**：对话（parity + 升级）、报告（净新）、研究（净新）。
本 spec 按 §9 全量设计（用户已确认 6a+6b 一次做完、聊天 §9.1 全量、渲染栈按文档选型
react-markdown + remark-gfm + TipTap）。

## 1. 目标与非目标

**目标**

1. **ChatMode（§9.1 全量）**：流式 markdown 渲染、会话管理（搜索/置顶/重命名/删除/标题生成）、
   上下文条（可移除）、停止/重试/重新生成、编辑重发、消息分支、引用、文本附件、
   阅读时暂停滚动 + 回到最新、工具卡片、截断提示、React 星盘工作台「AI 解读」触发。
2. **ReportMode（§9.2）**：结构化模板生成报告、TipTap 编辑、分节重新生成、
   手动编辑节锁定（重新生成绝不静默覆盖）、版本对比与恢复、导出 MD/PDF。
3. **ResearchMode（§9.3）**：引用溯源回答（`[参考N]` 渲染为芯片，来源面板可跳转）、
   可展开的工具状态行（参数摘要 + 结果摘录）、研究会话标记与专用系统提示。
4. 三模式共享会话与上下文基础设施（§9 引言），同一面板内切换。

**非目标**

- 不做"改变档案/星盘的工具操作需确认"的完整实现——当前工具集全部只读；仅在工具事件
  协议中预留 `requiresConfirmation` 字段，无触发方（记录待将来）。
- 不迁移中式命理视图的「解读我的八字」入口（属 Phase 5，主进程 `sendMessage` 通道保留）。
- 不改 LangChain 后端架构（§9 与迁移文档 out-of-scope 一致）。

## 2. 总体架构

```
PanelLayout 的 ai 槽位
└── AiWorkspace（新容器，头部模式切换：💬 对话 | 📄 报告 | 🔍 研究）
    ├── 共享层：SessionProvider（会话列表/搜索/置顶/恢复 + 流式事件订阅）
    │          ContextStrip（档案/盘型/时间/筛选/选中对象，可移除）
    ├── ChatMode      —— react-markdown + remark-gfm
    ├── ReportMode    —— TipTap（lazy 加载）     （Plan B）
    └── ResearchMode  —— 引用溯源               （Plan C）
```

**消息模型：分支即派生会话（方案 A2，已确认）**

- "从某消息分支" = 复制该消息（含）之前的消息序列，新建会话；原会话不动。

  消息在存储中无 id，分支点以**消息下标**定位。

- 新会话带 `forkedFrom: { sessionId, messageIndex }`，标题默认「↩ 分支自 <原标题>」。
- 编辑重发：末条用户消息原地改写重发；非末条 → 自动派生新会话再改写。
- 理由：会话存储保持线性（零迁移风险），分支在会话侧栏可见、可搜索/置顶/恢复，
  与 §9.3 会话管理天然融合。

## 3. 数据与主进程改动

### 3.1 AiSessionStore 升级（向后兼容，仅加字段）

- 会话：`pinned?: boolean`、`forkedFrom?: { sessionId, messageId }`、`mode?: 'chat' | 'research'`。
- 消息：`attachments?: [{ name, content }]`（文本内联，主进程读取）、`editedAt?: string`。
- 新 IPC：
  - `ai:sessions:fork(sessionId, messageId)` → 新会话（复制前缀）
  - `ai:sessions:setPinned(sessionId, pinned)`
  - `ai:readTextAttachment(filePath)` → `{ name, content }`（utf-8，**上限 200KB**，超限报错）
  - 搜索为渲染层过滤（会话量级小，`ai:sessions:list` 拉全量后本地 filter）。

### 3.2 chat 流工具事件富化（聊天/研究共用）

`ai:token` 通道的 `tool-call` 事件从 `{ tool, status }` 扩展为：

```jsonc
{ "type": "tool-call", "data": {
    "tool": "search_knowledge", "status": "calling" | "done",
    "argsDigest": "query=火星 落宫",     // 参数摘要（截断至 ~120 字符）
    "resultExcerpt": "《行星落宫详解》第3章：火星落第4宫…",  // 结果摘录（~200 字符）
    "requiresConfirmation": false        // 预留位，当前恒 false
} }
```

AiService.chat 的 updates 分支读取 tool message 的 `content`/参数生成摘要；截断策略在主进程。

### 3.3 报告存储与服务

- **AiReportStore**（`src/main/AiReportStore.js`，`data/reports.json`）：
  `{ id, title, templateId, contextSnapshot, sections: [{ id, title, markdown, locked, versions: [{ markdown, savedAt }], generatedAt }], createdAt, updatedAt }`
- **模板**：`assets/report-templates.json`（内置：本命综合 / 年度行运 / 合盘分析；
  每模板 = 有序节列表，节含 `title` + `promptFragment`）。
- **生成**：`AiService.generateReportSection(context, template, section)` —— chat 模型 +
  RAG 上下文（复用 ChainFactory `_getRagContext`）+ 节提示，流式产出 markdown。
- **IPC**：`ai:reports:create/list/get/save/delete/regenerate/export`；
  导出 MD 由渲染层拼装，PDF 由主进程 `webContents.printToPDF`（隐藏打印窗渲染报告 HTML，
  零新依赖，中文经系统字体）。

### 3.4 研究提示变体

`chat(context.mode === 'research')` → 主进程选用研究系统提示（ChatPrompt 的知识库优先规范
扩展为强制引用：回答中每个关键论断标注 `[参考N]`；来源 = 工具调用结果，事件已富化）。

## 4. ChatMode（§9.1 全量）

- **流式渲染**：react-markdown + remark-gfm；代码块/表格/GFM 全支持。
- **滚动语义**：用户向上滚离底部（阈值 ~40px）→ 暂停自动滚动，出现「↓ 回到最新」
  悬浮钮；点击滚底并恢复跟随。
- **消息操作**（悬停工具条）：复制 / 引用（插入输入框）/ 编辑重发（末条原地、非末条派生）/
  分支（派生会话）/ 助手末条「重新生成」（清末条 assistant 消息重发）。
- **停止/重试**：流中 Stop（`ai:stop`）；错误态行内重试；`truncated` 事件 → 独立提示元素
  （复用 Phase 1 语义与文案 key）。
- **上下文条**：数据源 `chartAiContextPublisher`（现有）；× 清除 = `ai:setContext(null)`。
- **输入区**：自动生长（上限 ~120px）、Enter 发送 / Shift+Enter 换行、状态芯片
  （provider·model + 工具活动指示）、📎 附件按钮 → 文件选择 → `ai:readTextAttachment`
  → 以「```引用块```」内联进消息预览。
- **AI 解读**：React 星盘工作台头部加「AI 解读」按钮 → `ai:interpret`
  （chat 面板切到对话模式并流式显示，会话记录同老层语义）。

## 5. ReportMode（§9.2）

- 入口：选模板（+ 勾选节）→ 逐节生成（流式填充，可中断）。
- 编辑：TipTap + tiptap-markdown（数据模型 markdown，双向转换）；手动编辑 → 自动 `locked`。
- 重新生成：locked 节需显式确认解锁；生成前把现版压入 `versions`（保留最近 5 版）。
- 版本对比：节历史侧栏 → 双栏对照（两版 markdown 各自渲染）+ 恢复按钮。
- 导出：MD（渲染层拼装分节）；PDF（`ai:reports:export` → 主进程 printToPDF → 存盘对话框）。

## 6. ResearchMode（§9.3）

- 会话带 `mode:'research'`，主进程用研究系统提示（强制引用标注）。
- 引用链：回答中的 `[参考N]` → 渲染为引用芯片（`react-markdown` 自定义组件替换）；
  来源面板列出工具事件（标题/摘录/相关度排序）→ 点击互相跳转定位。
- 工具行：紧凑状态行（工具名 + 状态点 + 参数摘要），点击展开结果摘录全文；
  raw traffic 不打断回答行文。
- 会话侧栏（三模式共享）：搜索 / 置顶 / 重命名 / 删除 / 恢复。

## 7. 状态归属（遵循迁移文档 §11）

- TanStack Query：会话/报告/目录 IPC 数据；mutations 后按需 invalidate。
- 流式 token 高频状态：专用 Zustand store（`aiStreamStore`：当前流缓冲/工具卡片序列/
  滚动暂停标志），跨模式复用。
- 表单草稿（输入框/编辑中的消息/报告编辑）留组件本地。

## 8. 新增依赖

`react-markdown`、`remark-gfm`、`@tiptap/react` + `@tiptap/starter-kit`、`tiptap-markdown`。
（版本在计划期锁定；无 UI 组件库，样式沿用 tokens + 手写 CSS。）

## 9. 测试策略

- **vitest 组件测试**：mock `window.mystApi` + 流式事件序列（token → tool-call →
  truncated → done）驱动 ChatMode/ResearchMode；报告锁定语义（编辑即锁、重生成需确认、
  版本压栈）；滚动暂停/恢复；fork 派生流程。
- **主进程 node 测试**：AiSessionStore 新字段/ fork、AiReportStore CRUD/版本、
  附件读取上限、工具事件富化摘要截断、generateReportSection（mock ModelProvider）。
- **smoke:react 扩展**：AI 面板渲染 + 模式切换探针；报告占位→实装断言。
- **回归**：typecheck、build:renderer、既有套件零新增失败。

## 10. 交付切分（3 份计划顺序执行）

- **Plan A · 基建+聊天**：依赖安装、会话存储升级 + fork/置点/附件 IPC、工具事件富化、
  AiWorkspace 容器 + 模式切换头（报告/研究先占位）、ChatMode 全量、上下文条、
  React 工作台「AI 解读」。
- **Plan B · 报告**：模板数据、AiReportStore、generateReportSection、ReportMode
  （TipTap/锁定/版本/导出）。
- **Plan C · 研究**：研究提示、引用链 UI、可展开工具行、共享会话侧栏完善 +
  smoke 探针 + 三模式收尾。

## 11. 预留与说明

- `requiresConfirmation` 事件字段已进协议但无触发方（工具集只读）；将来出现可变更档案/
  星盘的工具时在主进程执行前弹确认。
- 老渲染层 AiSidebar 保持不动直到 Phase 9 cutover（对照参考 + 回退保障）。
- 聊天消息的 attachments 仅文本内联（200KB 上限），不引入多模态消息协议。
