# AI 工作台 A2 · ChatMode UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 React 渲染层落地 §9.1 全量 ChatMode：流式 markdown、会话管理（搜索/置顶/重命名/删除/分支）、上下文条、停止/重试/重新生成、编辑重发、消息工具条、阅读时暂停滚动、工具卡片、截断提示、React 星盘工作台「AI 解读」触发；报告/研究先占位（Plan B/C 实装）。

**Architecture:** 会话/历史走 TanStack Query（`['ai-sessions']` 全量拉取，主进程 `ai:sessionsChanged` 与流结束后 invalidate）；流式高频状态走专用 Zustand store（`aiStreamStore`：本地用户消息预览 + 文本/工具交错段 + 滚动暂停 + 模式与面板信号），IPC 订阅（onToken/onDone/onError）封装在 store 的 startChat/startInterpret 内（发送前 `removeAllListeners()` 再注册，老层同款防串流）。消息分支模型 = 派生会话（A1 已交付 fork）；编辑重发/重新生成依赖本计划新增的主进程原语 `replaceFrom` + `ai:chat` 的 `context.resend` 标记。

**Tech Stack:** React 19、zustand（vanilla createStore，已有依赖）、TanStack Query（已有）、react-markdown + remark-gfm（**新装**）、vitest + @testing-library/react（jsdom）、node:test（主进程）、CommonJS 主进程。

**Spec:** `docs/superpowers/specs/2026-09-22-ai-workspace-react-design.md` §2（架构/分支模型）、§4（ChatMode 全量）、§7（状态归属）、§9（测试策略）；§3.1 的 A1 部分（会话存储/IPC/富化事件）已由 Plan A1 交付（提交 a41acb2 / 2f6bcb8 / ad4d445）。

**前置:** 分支 `feat/ai-workspace`；node_modules 就绪。**本计划 Task 1 涉及主进程 node 测试（不依赖 swisseph，任意 ABI 可跑单文件）；Task 14 全量回归需要双 ABI 翻转**（见 `docs/native-modules-build.md`：跑 `npm test` 前用 `$env:NODEJS_ORG_MIRROR='https://npmmirror.com/mirrors/node/'; npx -y node-gyp@latest rebuild --directory=node_modules/swisseph-v2` 翻到 Node ABI，跑完用 `npm run rebuild:electron` 翻回 Electron ABI）。渲染层命令（vitest/typecheck/build/smoke）不需要翻 ABI。

**环境注意（每个执行任务的子代理必读）:**
- Windows PowerShell（旧版）：命令分隔用 `;`，**没有 `&&`**。
- `npm run test:renderer -- <文件名模式>` 单跑某测试文件（vitest root 是 `src/renderer-react`）。
- `npm run build:renderer` 会改动已入库字体文件（`tools/build-ui-fonts.mjs` 副作用）；构建后用 `git checkout -- src/renderer-react/assets/fonts` 还原，**绝不要提交字体 churn**。
- 主进程单文件 node 测试（如 `node --test tests/AiSessionStore.test.js`）不 require swisseph，无需翻 ABI。
- 提交只 `git add` 任务内明确列出的文件；`git status` 确认无杂物（尤其 `test-output.txt`、字体）再提交。

---

## 文件结构总览

**新建（渲染层，目录 `src/renderer-react/features/ai/`）：**

| 文件 | 职责 |
|---|---|
| `MarkdownMessage.tsx` | react-markdown + remark-gfm 渲染单条消息正文；链接强制外开 |
| `chatMessage.ts` | 纯函数：附件引用块拼装、末条 user 消息下标查找 |
| `MessageItem.tsx` | 单条消息气泡 + 悬停工具条（复制/引用/编辑重发/分支/重新生成）+ 行内编辑态 |
| `MessageList.tsx` | 历史消息 + 流式 turn（本地预览 + 文本/工具段 + 截断/错误提示）+ 滚动暂停/回到底部 |
| `Composer.tsx` | 自动生长输入框、Enter 发送、附件（FileReader 读取 + 200KB 上限）、发送/停止、状态芯片 |
| `SessionRail.tsx` | 会话列表（搜索/置顶/重命名/删除/fork 标记/新建），Query + mutations |
| `ContextStrip.tsx` | 当前 AI 上下文摘要条，可移除 |
| `AiWorkspace.tsx` | 容器：模式切换头（💬 对话 \| 📄 报告 \| 🔍 研究）+ 状态芯片/未配置横幅/同步失败告警 + SessionRail + ChatMode + 占位 |
| `ChatMode.tsx` | 对话模式组装：发送编排、编辑重发/分支/重新生成/错误重试、引用 |
| `ai-workspace.css` | 上述组件全部样式（tokens + 手写 CSS，无 UI 库） |
| 各组件 `.test.tsx` | vitest 组件测试（内联字典 + mock `window.mystApi`） |
| `ai-workspace-css.test.ts` | CSS 布局契约断言（`charts-css.test.ts` 同款模式） |

**新建（store）：** `src/renderer-react/stores/aiStreamStore.ts` + `aiStreamStore.test.ts`

**修改（主进程/桥接）：** `src/main/AiSessionStore.js`、`src/main/IpcRouter.js`、`src/preload/Preload.js`、`tests/AiSessionStore.test.js`

**修改（渲染层既有）：** `types/myst-api.d.ts`、`api/contracts.ts`、`api/client.ts`、`shell/AppShell.tsx`、`shell/AppShell.test.tsx`、`shell/PanelLayout.tsx`、`features/charts/context/chartAiContextPublisher.ts` + `.test.ts`、`features/charts/workbench/ChartResultShell.tsx`

**删除：** `shell/AiStatusPanel.tsx`、`shell/AiStatusPanel.test.tsx`（职责并入 AiWorkspace：状态条/未配置引导/上下文同步告警）

**修改（资源/冒烟）：** `locale/zh.json`、`tests/SmokeReactRenderer.js`

---

### Task 1: 主进程 replaceFrom + chat resend 标记 + 桥接与类型补齐

**Files:**
- Modify: `src/main/AiSessionStore.js`
- Modify: `tests/AiSessionStore.test.js`
- Modify: `src/main/IpcRouter.js`
- Modify: `src/preload/Preload.js`
- Modify: `src/renderer-react/types/myst-api.d.ts`
- Modify: `src/renderer-react/api/contracts.ts`
- Modify: `src/renderer-react/api/client.ts`

- [ ] **Step 1: 写失败测试（AiSessionStore.replaceFrom）**

在 `tests/AiSessionStore.test.js` 的 `test('mode field round-trips through create/append/persist', ...)` 之后追加：

```js
test('replaceFrom rewrites the message at the index and drops everything after it', () => {
  const { store } = newStore();
  const s = store.create();
  store.appendMessage(s.id, { role: 'user', content: '原始问题' });
  store.appendMessage(s.id, { role: 'ai', content: '旧回复' });
  const updated = store.replaceFrom(s.id, 0, { role: 'user', content: '改写后的问题' });
  assert.equal(updated.messages.length, 1, 'drops everything after the rewritten index');
  assert.equal(updated.messages[0].content, '改写后的问题');
  assert.equal(updated.messages[0].role, 'user');
  assert.equal(store.get(s.id).messages.length, 1);
});

test('replaceFrom rejects out-of-range indexes and missing sessions', () => {
  const { store } = newStore();
  const s = store.create();
  store.appendMessage(s.id, { role: 'user', content: 'x' });
  assert.equal(store.replaceFrom(s.id, 5, { role: 'user', content: 'y' }), null);
  assert.equal(store.replaceFrom(s.id, -1, { role: 'user', content: 'y' }), null);
  assert.equal(store.replaceFrom('no-such-session', 0, { role: 'user', content: 'y' }), null);
  assert.equal(store.get(s.id).messages.length, 1, 'rejections leave the session untouched');
});
```

- [ ] **Step 2: 确认失败**

```bash
node --test tests/AiSessionStore.test.js
```

Expected: FAIL —— `store.replaceFrom is not a function`；既有 4 个测试仍通过。

- [ ] **Step 3: 实现 replaceFrom**

`src/main/AiSessionStore.js` 在 `setPinned` 方法之后、`delete` 之前插入：

```js
  /**
   * Rewrite messages[messageIndex] with `message` and drop every message after
   * it. Backing primitive for 编辑重发 (rewrite + regenerate) — the renderer
   * then re-issues ai:chat with context.resend so the user message is not
   * appended twice (design spec §4).
   */
  replaceFrom(id, messageIndex, message) {
    const sessions = this._readAll();
    const session = sessions.find((s) => s.id === id);
    if (!session) return null;
    const index = Number(messageIndex);
    if (!Number.isInteger(index) || index < 0 || index >= session.messages.length) return null;
    if (!message || typeof message !== 'object' || typeof message.content !== 'string') return null;
    session.messages = [...session.messages.slice(0, index), { ...message }];
    session.updatedAt = new Date().toISOString();
    this._writeAll(sessions);
    return session;
  }
```

- [ ] **Step 4: 确认通过**

```bash
node --test tests/AiSessionStore.test.js
```

Expected: PASS（6 test）。

- [ ] **Step 5: IPC handler + chat resend 标记**

`src/main/IpcRouter.js`：在 `ai:sessions:setPinned` handler 之后插入：

```js
      this._handle('ai:sessions:replaceFrom', (_e, sessionId, messageIndex, message) => {
        if (!this.aiSessionStore) throw new Error('会话存储未初始化');
        const updated = this.aiSessionStore.replaceFrom(sessionId, messageIndex, message);
        if (!updated) throw new Error('未找到要改写的会话或消息');
        if (this.webContents) this.webContents.send('ai:sessionsChanged');
        return updated;
      });
```

同文件 `ai:chat` handler 中，把用户消息 append 包进 `!context.resend` 判断（`fullMessages` 的回读保持不变）：

```js
      this._handle('ai:chat', async (_e, messages, context) => {
        const sessionId = context.sessionId || String(Date.now());
        try {
          let fullMessages = messages;
          if (this.aiSessionStore && sessionId && !context.resend) {
            const userMsg = messages[messages.length - 1];
            if (userMsg) {
              this.aiSessionStore.appendMessage(sessionId, userMsg);
            }
          }
          if (this.aiSessionStore && sessionId) {
            const session = this.aiSessionStore.get(sessionId);
            if (session && session.messages) {
              fullMessages = session.messages;
            }
          }
```

（handler 其余部分不动。）

- [ ] **Step 6: preload 桥接**

`src/preload/Preload.js` 的 `sessions` 对象内（`setPinned` 之后）追加：

```js
      replaceFrom: (sessionId, messageIndex, message) => invoke('ai:sessions:replaceFrom', sessionId, messageIndex, message),
```

- [ ] **Step 7: d.ts / contracts / apiClient 补齐**

`src/renderer-react/types/myst-api.d.ts` —— `MystAiApi` 接口补齐 A2 用到的全部通道（放在 `readTextAttachment` 声明之后）：

```ts
    chat(messages: Array<{ role: string; content: string; attachments?: Array<{ name: string; content: string }> }>, context: { sessionId?: string; resend?: boolean; [key: string]: unknown }): Promise<IpcResult<unknown>>;
    interpret(chartData: unknown, options: { sessionId?: string; chartType?: string; [key: string]: unknown }): Promise<IpcResult<unknown>>;
    stop(sessionId: string): Promise<IpcResult<unknown>>;
    onToken(callback: (event: { sessionId?: string; type: string; data: unknown }) => void): void;
    onDone(callback: (event: { ok?: boolean; sessionId?: string }) => void): void;
    onError(callback: (event: { message?: string; sessionId?: string }) => void): void;
    removeAllListeners(): void;
    onSessionsChanged(callback: () => void): void;
```

同文件 `sessions` 接口补（`setPinned` 之后）：

```ts
      create(): Promise<IpcResult<AiSessionSummary>>;
      replaceFrom(sessionId: string, messageIndex: number, message: { role: string; content: string }): Promise<IpcResult<AiSessionSummary>>;
```

`src/renderer-react/api/contracts.ts` —— `AiSessionSummary` 的 `messages` 类型改为：

```ts
  messages: Array<{ role: string; content: string; attachments?: Array<{ name: string; content: string }> }>;
```

`src/renderer-react/api/client.ts` —— 在 `deleteAiSession` 之后追加：

```ts
  createAiSession: (): Promise<AiSessionSummary> =>
    invoke<AiSessionSummary>((api) => api.ai.sessions.create()),
  forkAiSession: (sessionId: string, messageIndex: number): Promise<AiSessionSummary> =>
    invoke<AiSessionSummary>((api) => api.ai.sessions.fork(sessionId, messageIndex)),
  setAiSessionPinned: (sessionId: string, pinned: boolean): Promise<AiSessionSummary> =>
    invoke<AiSessionSummary>((api) => api.ai.sessions.setPinned(sessionId, pinned)),
  replaceAiSessionFrom: (sessionId: string, messageIndex: number, message: { role: string; content: string }): Promise<AiSessionSummary> =>
    invoke<AiSessionSummary>((api) => api.ai.sessions.replaceFrom(sessionId, messageIndex, message)),
```

- [ ] **Step 8: 回归**

```bash
node --test tests/AiSessionStore.test.js
npm run test:preload
npm run test:security
npm run typecheck
```

Expected: 6 test 全绿；preload 52 套件全绿（无通道清单断言，新增方法不破坏）；security 全绿；typecheck 0 error。

- [ ] **Step 9: Commit**

```bash
git add src/main/AiSessionStore.js tests/AiSessionStore.test.js src/main/IpcRouter.js src/preload/Preload.js src/renderer-react/types/myst-api.d.ts src/renderer-react/api/contracts.ts src/renderer-react/api/client.ts
git commit -m "feat(ai): replaceFrom primitive and resend flag for edit-and-regenerate"
```

---

### Task 2: aiStreamStore（流式状态中枢）

**Files:**
- Create: `src/renderer-react/stores/aiStreamStore.ts`
- Test: `src/renderer-react/stores/aiStreamStore.test.ts`

设计要点（来自 spec §7 + 老层 AiSidebar 语义）：
- 流式订阅生命周期封装在 store：`startChat`/`startInterpret` 内先 `removeAllListeners()` 再注册 onToken/onDone/onError（与老层 `_registerListeners` 相同的防串流策略）。
- 流式 turn = `segments` 数组（text 段与 tool 段交错；`tool-call calling` push、`done` 就地合并同名 calling 段——对齐老层卡片行为）。
- `streamFinishSignal` 每次流结束 +1：ChatMode 用 `useEffect([signal])` invalidate `['ai-sessions']`（store 不直接碰 QueryClient）。
- `chat` 的 token 事件带 `sessionId`（A1 后主进程 chat 通道保证），store 防御性过滤；`interpret` 事件不带 sessionId，不做过滤。
- `mode`（工作台模式）、`panelOpenSignal`（请求展开 AI 面板）、`activeSessionId`（当前会话）也归本 store——单一 AI 工作台状态源。

- [ ] **Step 1: 写失败测试**

`src/renderer-react/stores/aiStreamStore.test.ts`：

```ts
import { beforeEach, expect, test, vi } from 'vitest';
import {
  aiStreamStore, resetAiStreamStoreForTests,
} from './aiStreamStore';

type TokenHandler = (event: { sessionId?: string; type: string; data: unknown }) => void;

function installApiMock() {
  const handlers = { token: [] as TokenHandler[], done: [] as Array<() => void>, error: [] as Array<(e: { message?: string }) => void> };
  const chat = vi.fn().mockResolvedValue({ ok: true });
  const interpret = vi.fn().mockResolvedValue({ ok: true });
  const stop = vi.fn().mockResolvedValue({ ok: true });
  const removeAllListeners = vi.fn();
  vi.stubGlobal('mystApi', {
    ai: {
      chat, interpret, stop, removeAllListeners,
      onToken: (cb: TokenHandler) => handlers.token.push(cb),
      onDone: (cb: () => void) => handlers.done.push(cb),
      onError: (cb: (e: { message?: string }) => void) => handlers.error.push(cb),
    },
  });
  return {
    chat, interpret, stop, removeAllListeners,
    emitToken: (event: { sessionId?: string; type: string; data: unknown }) => { for (const cb of handlers.token) cb(event); },
    emitDone: () => { for (const cb of handlers.done) cb(); },
    emitError: (message: string) => { for (const cb of handlers.error) cb({ message }); },
  };
}

beforeEach(() => {
  resetAiStreamStoreForTests();
});

test('startChat registers fresh listeners, previews the user message, and accumulates token segments', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: '问个问题' });

  const state = aiStreamStore.getState();
  expect(state.active).toBe(true);
  expect(state.streamKind).toBe('chat');
  expect(state.localUserMessage?.content).toBe('问个问题');
  expect(api.removeAllListeners).toHaveBeenCalledTimes(1);
  expect(api.chat).toHaveBeenCalledWith([{ role: 'user', content: '问个问题' }], { sessionId: 's1', resend: false });

  api.emitToken({ sessionId: 's1', type: 'token', data: '你好' });
  api.emitToken({ sessionId: 's1', type: 'token', data: '，世界' });
  let segments = aiStreamStore.getState().segments;
  expect(segments).toEqual([{ kind: 'text', content: '你好，世界' }]);

  api.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'calling', argsDigest: 'q', resultExcerpt: '', requiresConfirmation: false } });
  api.emitToken({ sessionId: 's1', type: 'token', data: '继续' });
  segments = aiStreamStore.getState().segments;
  expect(segments).toHaveLength(3);
  expect(segments[1]).toMatchObject({ kind: 'tool' });
  expect(segments[2]).toEqual({ kind: 'text', content: '继续' });

  api.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'done', argsDigest: '', resultExcerpt: '《书》摘录', requiresConfirmation: false } });
  segments = aiStreamStore.getState().segments;
  expect(segments).toHaveLength(3);
  expect(segments[1]).toMatchObject({ kind: 'tool', event: { tool: 'search_knowledge', status: 'done', resultExcerpt: '《书》摘录' } });

  api.emitToken({ sessionId: 's1', type: 'truncated', data: { reason: 'length' } });
  expect(aiStreamStore.getState().truncated).toBe(true);
});

test('startChat ignores tokens from a different chat session', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  api.emitToken({ sessionId: 'other', type: 'token', data: '别家的' });
  expect(aiStreamStore.getState().segments).toEqual([]);
});

test('startChat passes resend through and ai:done resets the stream and bumps the finish signal', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: '再次' }, { resend: true });
  expect(api.chat).toHaveBeenCalledWith([{ role: 'user', content: '再次' }], { sessionId: 's1', resend: true });

  const before = aiStreamStore.getState().streamFinishSignal;
  api.emitToken({ sessionId: 's1', type: 'token', data: '文本' });
  api.emitDone();
  const after = aiStreamStore.getState();
  expect(after.active).toBe(false);
  expect(after.streamKind).toBeNull();
  expect(after.segments).toEqual([]);
  expect(after.localUserMessage).toBeNull();
  expect(after.truncated).toBe(false);
  expect(after.streamFinishSignal).toBe(before + 1);
});

test('ai:error keeps the message, marks the stream inactive, and bumps the signal', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  api.emitError('网关超时');
  const state = aiStreamStore.getState();
  expect(state.active).toBe(false);
  expect(state.error).toBe('网关超时');
  expect(state.streamFinishSignal).toBeGreaterThan(0);
});

test('stopStream calls ai:stop and finishes locally; late done is ignored', () => {
  const api = installApiMock();
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  api.emitToken({ sessionId: 's1', type: 'token', data: '部分' });
  aiStreamStore.getState().stopStream();
  expect(api.stop).toHaveBeenCalledWith('s1');
  expect(aiStreamStore.getState().active).toBe(false);
  const signal = aiStreamStore.getState().streamFinishSignal;
  api.emitDone();
  expect(aiStreamStore.getState().streamFinishSignal).toBe(signal);
});

test('startInterpret accepts sessionless token events and forces chat mode', () => {
  const api = installApiMock();
  aiStreamStore.getState().setMode('report');
  aiStreamStore.getState().setActiveSessionId('s1');
  aiStreamStore.getState().startInterpret({ chartData: { resultId: 'r1' }, chartType: 'natal' });
  expect(api.interpret).toHaveBeenCalledWith({ resultId: 'r1' }, { chartType: 'natal', sessionId: 's1' });
  expect(aiStreamStore.getState().mode).toBe('chat');
  expect(aiStreamStore.getState().localUserMessage).toBeNull();
  api.emitToken({ type: 'token', data: '解读' });
  expect(aiStreamStore.getState().segments).toEqual([{ kind: 'text', content: '解读' }]);
});

test('startChat without an active session is a no-op', () => {
  const api = installApiMock();
  aiStreamStore.getState().startChat({ role: 'user', content: 'x' });
  expect(api.chat).not.toHaveBeenCalled();
  expect(aiStreamStore.getState().active).toBe(false);
});

test('workspace actions: mode, panel signal, scroll pause, active session', () => {
  installApiMock();
  aiStreamStore.getState().setMode('research');
  expect(aiStreamStore.getState().mode).toBe('research');
  aiStreamStore.getState().requestPanelOpen();
  aiStreamStore.getState().requestPanelOpen();
  expect(aiStreamStore.getState().panelOpenSignal).toBe(2);
  aiStreamStore.getState().setAutoScrollPaused(true);
  expect(aiStreamStore.getState().autoScrollPaused).toBe(true);
  aiStreamStore.getState().setActiveSessionId('s9');
  expect(aiStreamStore.getState().activeSessionId).toBe('s9');
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- aiStreamStore.test
```

Expected: FAIL —— 模块 `./aiStreamStore` 不存在。

- [ ] **Step 3: 实现 store**

`src/renderer-react/stores/aiStreamStore.ts`：

```ts
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type AiWorkspaceMode = 'chat' | 'report' | 'research';
export type StreamKind = 'chat' | 'interpret';

export interface StreamToolEvent {
  tool: string;
  status: 'calling' | 'done';
  argsDigest: string;
  resultExcerpt: string;
  requiresConfirmation: boolean;
}

export type StreamSegment =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; event: StreamToolEvent };

export interface StreamUserMessage {
  role: string;
  content: string;
  attachments: Array<{ name: string; content: string }>;
}

export interface AiStreamState {
  mode: AiWorkspaceMode;
  panelOpenSignal: number;
  activeSessionId: string | null;
  active: boolean;
  streamKind: StreamKind | null;
  localUserMessage: StreamUserMessage | null;
  segments: StreamSegment[];
  truncated: boolean;
  error: string | null;
  autoScrollPaused: boolean;
  /** 每次 ai:done / ai:error / stop +1；ChatMode 依此 invalidate 会话列表。 */
  streamFinishSignal: number;
  setMode(mode: AiWorkspaceMode): void;
  requestPanelOpen(): void;
  setActiveSessionId(id: string | null): void;
  setAutoScrollPaused(paused: boolean): void;
  startChat(message: { role: string; content: string; attachments?: Array<{ name: string; content: string }> }, options?: { resend?: boolean }): void;
  startInterpret(request: { chartData: unknown; chartType?: string }): void;
  stopStream(): void;
  /** 消费一条 ai:token 通道事件（导出供测试直接驱动）。 */
  consumeStreamEvent(event: { sessionId?: string; type: string; data: unknown }): void;
  /** 内部：流收尾（ai:done / ai:error / stop 调用）；导出供实现内部与测试。 */
  consumeFinish(errorMessage?: string): void;
  resetForTests(): void;
}

function isToolEvent(value: unknown): value is StreamToolEvent {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as StreamToolEvent).tool === 'string'
    && ((value as StreamToolEvent).status === 'calling' || (value as StreamToolEvent).status === 'done');
}

export function createAiStreamStore(): StoreApi<AiStreamState> {
  return createStore<AiStreamState>((set, get) => {
    const registerStreamListeners = (): void => {
      const api = window.mystApi.ai;
      api.removeAllListeners();
      api.onToken((event) => get().consumeStreamEvent(event));
      api.onDone(() => { get().consumeFinish(); });
      api.onError((event) => { get().consumeFinish(event?.message ?? 'AI 请求失败'); });
    };
    const startStream = (patch: Partial<AiStreamState>): void => {
      if (get().active) return;
      set({ active: true, segments: [], truncated: false, error: null, localUserMessage: null, autoScrollPaused: false, ...patch });
      registerStreamListeners();
    };
    return {
      mode: 'chat',
      panelOpenSignal: 0,
      activeSessionId: null,
      active: false,
      streamKind: null,
      localUserMessage: null,
      segments: [],
      truncated: false,
      error: null,
      autoScrollPaused: false,
      streamFinishSignal: 0,
      setMode: (mode) => set({ mode }),
      requestPanelOpen: () => set((state) => ({ panelOpenSignal: state.panelOpenSignal + 1 })),
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
      setAutoScrollPaused: (autoScrollPaused) => set({ autoScrollPaused }),
      startChat(message, options) {
        const sessionId = get().activeSessionId;
        if (!sessionId || get().active) return;
        startStream({
          streamKind: 'chat',
          localUserMessage: { role: message.role, content: message.content, attachments: message.attachments ?? [] },
        });
        void window.mystApi.ai.chat([message], { sessionId, resend: options?.resend ?? false });
      },
      startInterpret(request) {
        const sessionId = get().activeSessionId;
        if (!sessionId || get().active) return;
        startStream({ streamKind: 'interpret', mode: 'chat' });
        void window.mystApi.ai.interpret(request.chartData, { chartType: request.chartType, sessionId });
      },
      stopStream() {
        const state = get();
        if (!state.active) return;
        if (state.activeSessionId) void window.mystApi.ai.stop(state.activeSessionId);
        get().consumeFinish();
      },
      consumeStreamEvent(event) {
        const state = get();
        if (!state.active) return;
        if (state.streamKind === 'chat' && event.sessionId && state.activeSessionId
          && event.sessionId !== state.activeSessionId) return;
        if (event.type === 'token' && typeof event.data === 'string') {
          const segments = [...state.segments];
          const last = segments[segments.length - 1];
          if (last && last.kind === 'text') segments[segments.length - 1] = { kind: 'text', content: last.content + event.data };
          else segments.push({ kind: 'text', content: event.data });
          set({ segments });
          return;
        }
        if (event.type === 'tool-call' && isToolEvent(event.data)) {
          const toolEvent = event.data;
          const segments = [...state.segments];
          if (toolEvent.status === 'calling') {
            segments.push({ kind: 'tool', event: toolEvent });
          } else {
            for (let index = segments.length - 1; index >= 0; index -= 1) {
              const segment = segments[index];
              if (segment.kind === 'tool' && segment.event.tool === toolEvent.tool && segment.event.status === 'calling') {
                segments[index] = { kind: 'tool', event: { ...segment.event, ...toolEvent } };
                break;
              }
            }
          }
          set({ segments });
          return;
        }
        if (event.type === 'truncated') set({ truncated: true });
        // AiService 的 { type: 'done' } 事件与其它未知类型：忽略（完成由 ai:done 通道驱动）。
      },
      consumeFinish(errorMessage) {
        const state = get();
        if (!state.active) return;
        window.mystApi.ai.removeAllListeners();
        set({
          active: false,
          streamKind: null,
          segments: [],
          localUserMessage: null,
          truncated: false,
          error: errorMessage ?? state.error,
          streamFinishSignal: state.streamFinishSignal + 1,
        });
      },
      resetForTests() {
        set({
          mode: 'chat', panelOpenSignal: 0, activeSessionId: null, active: false, streamKind: null,
          localUserMessage: null, segments: [], truncated: false, error: null, autoScrollPaused: false,
          streamFinishSignal: 0,
        });
      },
    };
  });
}

export const aiStreamStore = createAiStreamStore();

export function resetAiStreamStoreForTests(): void {
  aiStreamStore.getState().resetForTests();
}

/** 组件订阅入口（与 `useChartWorkspace` 同款：zustand useStore + vanilla store）。 */
export function useAiStreamStore<T>(selector: (state: AiStreamState) => T): T {
  return useStore(aiStreamStore, selector);
}
```

（注意：store 对象直接以 `AiStreamState` 收尾，不加任何 `as` 交叉类型断言——`consumeFinish` 已在接口中声明。）

- [ ] **Step 4: 确认通过**

```bash
npm run test:renderer -- aiStreamStore.test
```

Expected: PASS（8 test）。注意 act 警告：store 的 set 在测试里同步调用，无 React 参与，无 act 问题。

- [ ] **Step 5: Commit**

```bash
git add src/renderer-react/stores/aiStreamStore.ts src/renderer-react/stores/aiStreamStore.test.ts
git commit -m "feat(ai): zustand stream store for the workspace chat pipeline"
```

---

### Task 3: 依赖安装 + MarkdownMessage

**Files:**
- Modify: `package.json`、`package-lock.json`（npm install 产物）
- Create: `src/renderer-react/features/ai/MarkdownMessage.tsx`
- Test: `src/renderer-react/features/ai/MarkdownMessage.test.tsx`

- [ ] **Step 1: 安装依赖**

```bash
npm install react-markdown remark-gfm
```

Expected: 安装成功，`package.json` dependencies 出现 `react-markdown` 与 `remark-gfm`（记录写入的具体版本，报告里注明）。**不要**在这步跑 `npm install --ignore-scripts` 之类变体；直接 install 即可（纯 JS 包，无原生构建）。

- [ ] **Step 2: 写失败测试**

`src/renderer-react/features/ai/MarkdownMessage.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MarkdownMessage } from './MarkdownMessage';

test('renders GFM tables, code fences, and external-safe links', () => {
  render(<MarkdownMessage content={[
    '| 行星 | 星座 |',
    '| --- | --- |',
    '| 太阳 | 白羊 |',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '[文档](https://example.com/docs)',
  ].join('\n')} />);

  const table = screen.getByRole('table');
  expect(table).toHaveTextContent('太阳');
  const code = screen.getByText(/const x = 1;/);
  expect(code.tagName).toBe('CODE');
  const link = screen.getByRole('link', { name: '文档' });
  expect(link).toHaveAttribute('href', 'https://example.com/docs');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
```

- [ ] **Step 3: 确认失败**

```bash
npm run test:renderer -- MarkdownMessage.test
```

Expected: FAIL —— 模块不存在。

- [ ] **Step 4: 实现**

`src/renderer-react/features/ai/MarkdownMessage.tsx`：

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Streamed and persisted chat bodies render as GFM markdown; links open externally. */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 5: 确认通过 + 提交**

```bash
npm run test:renderer -- MarkdownMessage.test
npm run typecheck
git add package.json package-lock.json src/renderer-react/features/ai/MarkdownMessage.tsx src/renderer-react/features/ai/MarkdownMessage.test.tsx
git commit -m "feat(ai): markdown message renderer with GFM support"
```

Expected: 测试 PASS；typecheck 0 error（react-markdown 自带类型）。提交前 `git status` 确认没有字体/其它 churn 混入。

---

### Task 4: chatMessage 纯函数（附件引用块 + 末条 user 定位）

**Files:**
- Create: `src/renderer-react/features/ai/chatMessage.ts`
- Test: `src/renderer-react/features/ai/chatMessage.test.ts`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/ai/chatMessage.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { buildChatMessageContent, lastUserMessageIndex } from './chatMessage';

describe('buildChatMessageContent', () => {
  test('appends attachments as markdown quote blocks after the user text', () => {
    expect(buildChatMessageContent('帮我分析', [
      { name: 'notes.txt', content: '第一行\n第二行' },
    ])).toBe('帮我分析\n\n> **附件：notes.txt**\n> 第一行\n> 第二行');
  });

  test('numbers multiple attachments and handles empty text', () => {
    expect(buildChatMessageContent('', [
      { name: 'a.txt', content: 'A' },
      { name: 'b.txt', content: 'B' },
    ])).toBe('> **附件 1：a.txt**\n> A\n\n> **附件 2：b.txt**\n> B');
  });

  test('plain text passes through unchanged', () => {
    expect(buildChatMessageContent('只有文字', [])).toBe('只有文字');
  });
});

describe('lastUserMessageIndex', () => {
  const messages = [
    { role: 'user', content: '一' },
    { role: 'ai', content: '答一' },
    { role: 'user', content: '二' },
    { role: 'ai', content: '答二' },
  ];
  test('finds the last user message', () => {
    expect(lastUserMessageIndex(messages)).toBe(2);
  });
  test('returns -1 when there is none', () => {
    expect(lastUserMessageIndex([{ role: 'ai', content: 'x' }])).toBe(-1);
  });
  test('an ai message after the last user still points at the user message', () => {
    expect(lastUserMessageIndex([
      { role: 'user', content: '一' },
      { role: 'ai', content: '答' },
      { role: 'ai', content: '补' },
    ])).toBe(0);
  });
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- chatMessage.test
```

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/ai/chatMessage.ts`：

```ts
export interface ChatAttachment {
  name: string;
  content: string;
}

/** 附件以 markdown 引用块内联进消息正文（spec §4：文本内联，随消息持久化）。 */
export function buildChatMessageContent(text: string, attachments: ChatAttachment[]): string {
  const blocks = attachments.map((attachment, index) => {
    const label = attachments.length === 1
      ? `> **附件：${attachment.name}**`
      : `> **附件 ${index + 1}：${attachment.name}**`;
    const lines = attachment.content.split('\n').map((line) => `> ${line}`.trimEnd());
    return [label, ...lines].join('\n');
  });
  const parts = [text.trim(), ...blocks].filter((part) => part.length > 0);
  return parts.join('\n\n');
}

/** 消息在存储中无 id，编辑重发/重新生成以「末条 user 消息」下标定位（spec §2）。 */
export function lastUserMessageIndex(messages: Array<{ role: string }>): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}
```

- [ ] **Step 4: 确认通过 + 提交**

```bash
npm run test:renderer -- chatMessage.test
git add src/renderer-react/features/ai/chatMessage.ts src/renderer-react/features/ai/chatMessage.test.ts
git commit -m "feat(ai): chat message content builder and last-user locator"
```

Expected: PASS（6 断言组）。

---

### Task 5: MessageItem（消息气泡 + 悬停工具条 + 行内编辑）

**Files:**
- Create: `src/renderer-react/features/ai/MessageItem.tsx`
- Test: `src/renderer-react/features/ai/MessageItem.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/ai/MessageItem.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { MarkdownMessage } from './MarkdownMessage';
import { MessageItem } from './MessageItem';

const dictionary = {
  ai: {
    copy: '复制', quote: '引用', editResend: '编辑重发', resend: '重发', cancelEdit: '取消',
    fork: '从此处分支', regenerate: '重新生成', editMessage: '编辑消息',
  },
};

function renderItem(props: Partial<Parameters<typeof MessageItem>[0]> = {}) {
  return render(<I18nProvider dictionary={dictionary}>
    <MessageItem
      index={0}
      message={{ role: 'user', content: '原问题' }}
      onCopy={vi.fn()} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()}
      {...props}
    />
  </I18nProvider>);
}

test('user message shows copy, quote, edit-resend, and fork actions and forwards callbacks', async () => {
  const user = userEvent.setup();
  const onCopy = vi.fn(); const onQuote = vi.fn(); const onEditResend = vi.fn(); const onFork = vi.fn();
  renderItem({ onCopy, onQuote, onEditResend, onFork });
  await user.click(screen.getByRole('button', { name: '复制' }));
  expect(onCopy).toHaveBeenCalledWith('原问题');
  await user.click(screen.getByRole('button', { name: '引用' }));
  expect(onQuote).toHaveBeenCalledWith('原问题');
  await user.click(screen.getByRole('button', { name: '从此处分支' }));
  expect(onFork).toHaveBeenCalledWith(0);
  await user.click(screen.getByRole('button', { name: '编辑重发' }));
  const editor = screen.getByRole('textbox', { name: '编辑消息' });
  await user.clear(editor);
  await user.type(editor, '改写后');
  await user.click(screen.getByRole('button', { name: '重发' }));
  expect(onEditResend).toHaveBeenCalledWith(0, '改写后');
});

test('edit can be cancelled and keeps the original render', async () => {
  const user = userEvent.setup();
  renderItem();
  await user.click(screen.getByRole('button', { name: '编辑重发' }));
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('textbox', { name: '编辑消息' })).not.toBeInTheDocument();
  expect(screen.getByText('原问题')).toBeInTheDocument();
});

test('assistant message renders markdown, shows regenerate only when provided, and disables actions while streaming', async () => {
  const user = userEvent.setup();
  const onRegenerate = vi.fn();
  const onCopy = vi.fn();
  render(<I18nProvider dictionary={dictionary}>
    <MessageItem index={1} message={{ role: 'ai', content: '**加粗**回复' }}
      onCopy={onCopy} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()} onRegenerate={onRegenerate} />
  </I18nProvider>);
  expect(screen.getByText('加粗').tagName).toBe('STRONG');
  await user.click(screen.getByRole('button', { name: '重新生成' }));
  expect(onRegenerate).toHaveBeenCalledTimes(1);
});

test('attachments render as name chips', () => {
  renderItem({ message: { role: 'user', content: '见附件', attachments: [{ name: 'notes.txt', content: 'A' }] } });
  expect(screen.getByText('notes.txt')).toBeInTheDocument();
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- MessageItem.test
```

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/ai/MessageItem.tsx`：

```tsx
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { AiSessionSummary } from '../../api/contracts';
import { MarkdownMessage } from './MarkdownMessage';

type ChatMessage = AiSessionSummary['messages'][number];

export interface MessageItemProps {
  index: number;
  message: ChatMessage;
  /** 流进行中：工具条禁用（避免中途改写会话）。 */
  disabled?: boolean;
  /** 仅 assistant 末条由父层传入。 */
  onRegenerate?: () => void;
  onCopy?(content: string): void;
  onQuote?(content: string): void;
  onEditResend?(index: number, nextContent: string): void;
  onFork?(index: number): void;
}

/** 单条历史消息：气泡 + 悬停工具条 + 末条编辑重发。编辑重发不携带原附件（spec §4）。 */
export function MessageItem({ index, message, disabled, onRegenerate, onCopy, onQuote, onEditResend, onFork }: MessageItemProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isUser = message.role === 'user';
  const hasAttachments = Boolean(message.attachments?.length);

  const submitEdit = () => {
    const next = draft.trim();
    if (!next || !onEditResend) return;
    onEditResend(index, next);
    setEditing(false);
  };

  return (
    <div className={`message-item message-item--${isUser ? 'user' : 'ai'}`} data-role={message.role}>
      <div className="message-item__body">
        {hasAttachments && (
          <div className="message-item__attachments">
            {message.attachments!.map((attachment) => (
              <span key={attachment.name} className="message-item__attachment">📎 {attachment.name}</span>
            ))}
          </div>
        )}
        {isUser ? <div className="message-item__text">{message.content}</div> : <MarkdownMessage content={message.content} />}
      </div>
      <div className="message-item__actions" data-disabled={disabled ? 'true' : undefined}>
        {onCopy && <button type="button" disabled={disabled} onClick={() => onCopy(message.content)}>{t('ai.copy')}</button>}
        {onQuote && <button type="button" disabled={disabled} onClick={() => onQuote(message.content)}>{t('ai.quote')}</button>}
        {onFork && <button type="button" disabled={disabled} onClick={() => onFork(index)}>{t('ai.fork')}</button>}
        {isUser && onEditResend && !editing && (
          <button type="button" disabled={disabled} onClick={() => { setDraft(message.content); setEditing(true); }}>{t('ai.editResend')}</button>
        )}
        {!isUser && onRegenerate && (
          <button type="button" disabled={disabled} onClick={onRegenerate}>{t('ai.regenerate')}</button>
        )}
      </div>
      {editing && (
        <div className="message-item__editor">
          <textarea aria-label={t('ai.editMessage')} value={draft} rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitEdit(); }
            }} />
          <div className="message-item__editor-actions">
            <button type="button" onClick={submitEdit}>{t('ai.resend')}</button>
            <button type="button" onClick={() => setEditing(false)}>{t('ai.cancelEdit')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

（组件对纯文本 user 消息直接渲染 `message-item__text`，对 assistant 消息经 MarkdownMessage 渲染——历史中的 user 消息不重复走 markdown，避免引用块二次转义。）

- [ ] **Step 4: 确认通过 + 提交**

```bash
npm run test:renderer -- MessageItem.test
git add src/renderer-react/features/ai/MessageItem.tsx src/renderer-react/features/ai/MessageItem.test.tsx
git commit -m "feat(ai): message item with hover actions and inline edit-resend"
```

Expected: PASS（4 test）。

---

### Task 6: MessageList（历史 + 流式 turn + 滚动暂停）

**Files:**
- Create: `src/renderer-react/features/ai/MessageList.tsx`
- Test: `src/renderer-react/features/ai/MessageList.test.tsx`

行为（spec §4）：用户向上滚离底部（阈值 40px）→ 暂停自动滚动 + 出现「↓ 回到最新」悬浮钮；点击滚底恢复跟随。流式 turn = 本地用户消息预览 + 文本/工具交错段 + 截断提示（独立元素，`ai.truncated` 文案 key 与 Phase 1 一致）+ 错误行内重试。历史消息经 MessageItem 渲染。

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/ai/MessageList.test.tsx`：

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { MessageList } from './MessageList';

const dictionary = {
  ai: {
    copy: '复制', quote: '引用', editResend: '编辑重发', resend: '重发', cancelEdit: '取消',
    fork: '从此处分支', regenerate: '重新生成', editMessage: '编辑消息',
    backToLatest: '↓ 回到最新', truncated: '⚠️ 输出因达到 Token 上限被截断，可在设置中调高「最大 Token 数」',
    retrySend: '重试', streamError: '请求失败',
    messagesRegion: '对话消息', noMessages: '会话暂无消息', toolRunning: '运行中…', toolDone: '完成',
  },
};

function renderList(props: Partial<Parameters<typeof MessageList>[0]> = {}) {
  return render(<I18nProvider dictionary={dictionary}>
    <MessageList
      messages={[
        { role: 'user', content: '第一条' },
        { role: 'ai', content: '回复一' },
      ]}
      onCopy={vi.fn()} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()}
      onRegenerate={vi.fn()} onRetry={vi.fn()}
      {...props}
    />
  </I18nProvider>);
}

beforeEach(() => {
  resetAiStreamStoreForTests();
});

test('renders history through MessageItem and an empty state when there are no messages', () => {
  const { rerender } = renderList({ messages: [] });
  expect(screen.getByText('会话暂无消息')).toBeInTheDocument();
  rerender(<I18nProvider dictionary={dictionary}>
    <MessageList messages={[{ role: 'user', content: '你好' }]}
      onCopy={vi.fn()} onQuote={vi.fn()} onEditResend={vi.fn()} onFork={vi.fn()}
      onRegenerate={vi.fn()} onRetry={vi.fn()} />
  </I18nProvider>);
  expect(screen.getByText('你好')).toBeInTheDocument();
});

test('streams: local user preview, markdown text, tool cards, truncation, and done cleanup', () => {
  aiStreamStore.setState({
    active: true, streamKind: 'chat', localUserMessage: { role: 'user', content: '流中问题', attachments: [] },
    segments: [
      { kind: 'text', content: '正在回答' },
      { kind: 'tool', event: { tool: 'search_knowledge', status: 'calling', argsDigest: 'q=火星', resultExcerpt: '', requiresConfirmation: false } },
      { kind: 'tool', event: { tool: 'search_knowledge', status: 'done', argsDigest: 'q=火星', resultExcerpt: '《行星落宫》摘录', requiresConfirmation: false } },
    ],
    truncated: true,
  });
  renderList();
  expect(screen.getByText('流中问题')).toBeInTheDocument();
  expect(screen.getByText('正在回答')).toBeInTheDocument();
  expect(screen.getByText('search_knowledge')).toBeInTheDocument();
  expect(screen.getByText('q=火星')).toBeInTheDocument();
  expect(screen.getByText('《行星落宫》摘录')).toBeInTheDocument();
  expect(screen.getByText(/Token 上限被截断/)).toBeInTheDocument();
});

test('error row offers inline retry', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  aiStreamStore.setState({ error: '网关超时' });
  renderList({ onRetry });
  expect(screen.getByText(/网关超时/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('scroll pause surfaces the back-to-latest button and resumes on click', async () => {
  const user = userEvent.setup();
  renderList();
  expect(screen.queryByRole('button', { name: '↓ 回到最新' })).not.toBeInTheDocument();
  act(() => { aiStreamStore.setState({ autoScrollPaused: true }); });
  expect(screen.getByRole('button', { name: '↓ 回到最新' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '↓ 回到最新' }));
  expect(aiStreamStore.getState().autoScrollPaused).toBe(false);
});

test('scrolling near the bottom keeps follow mode; away from it pauses', () => {
  renderList();
  const scroller = screen.getByRole('log', { name: '对话消息' }) as HTMLElement;
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
  scroller.scrollTop = 480;
  scroller.dispatchEvent(new Event('scroll'));
  expect(aiStreamStore.getState().autoScrollPaused).toBe(false);
  scroller.scrollTop = 100;
  scroller.dispatchEvent(new Event('scroll'));
  expect(aiStreamStore.getState().autoScrollPaused).toBe(true);
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- MessageList.test
```

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/ai/MessageList.tsx`：

```tsx
import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { AiSessionSummary } from '../../api/contracts';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import { MarkdownMessage } from './MarkdownMessage';
import { MessageItem } from './MessageItem';

const PAUSE_THRESHOLD_PX = 40;

export interface MessageListProps {
  messages: AiSessionSummary['messages'];
  /** 是否给 assistant 末条挂「重新生成」。 */
  canRegenerate?: boolean;
  onCopy?(content: string): void;
  onQuote?(content: string): void;
  onEditResend?(index: number, nextContent: string): void;
  onFork?(index: number): void;
  onRegenerate?(): void;
  /** 流错误后的行内重试。 */
  onRetry?(): void;
}

export function MessageList({ messages, canRegenerate, onCopy, onQuote, onEditResend, onFork, onRegenerate, onRetry }: MessageListProps) {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const active = useAiStreamStore((state) => state.active);
  const localUserMessage = useAiStreamStore((state) => state.localUserMessage);
  const segments = useAiStreamStore((state) => state.segments);
  const truncated = useAiStreamStore((state) => state.truncated);
  const error = useAiStreamStore((state) => state.error);
  const autoScrollPaused = useAiStreamStore((state) => state.autoScrollPaused);
  const setAutoScrollPaused = useAiStreamStore((state) => state.setAutoScrollPaused);

  const lastAssistantIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role !== 'user') return index;
    }
    return -1;
  })();

  useEffect(() => {
    if (autoScrollPaused) return;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [autoScrollPaused, messages, segments, truncated, error, localUserMessage]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const paused = distance > PAUSE_THRESHOLD_PX;
    if (paused !== autoScrollPaused) setAutoScrollPaused(paused);
  };

  const backToLatest = () => {
    setAutoScrollPaused(false);
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  return (
    <div className="message-list">
      <div ref={scrollerRef} className="message-list__scroller" role="log" aria-label={t('ai.messagesRegion')} onScroll={handleScroll}>
        {messages.length === 0 && !active && <div className="message-list__empty">{t('ai.noMessages')}</div>}
        {messages.map((message, index) => (
          <MessageItem key={index} index={index} message={message} disabled={active}
            onCopy={onCopy} onQuote={onQuote} onEditResend={onEditResend} onFork={onFork}
            onRegenerate={canRegenerate && index === lastAssistantIndex && !active ? onRegenerate : undefined} />
        ))}
        {active && (
          <div className="message-list__stream" aria-live="polite">
            {localUserMessage && (
              <div className="message-item message-item--user message-item--pending">
                <div className="message-item__body">
                  {localUserMessage.attachments.length > 0 && (
                    <div className="message-item__attachments">
                      {localUserMessage.attachments.map((attachment) => (
                        <span key={attachment.name} className="message-item__attachment">📎 {attachment.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="message-item__text">{localUserMessage.content}</div>
                </div>
              </div>
            )}
            {segments.length > 0 && (
              <div className="message-item message-item--ai">
                <div className="message-item__body">
                  {segments.map((segment, index) => segment.kind === 'text'
                    ? <MarkdownMessage key={index} content={segment.content} />
                    : <ToolCard key={index} event={segment.event} />)}
                </div>
              </div>
            )}
            {truncated && <div className="message-list__truncated">{t('ai.truncated')}</div>}
          </div>
        )}
        {!active && error && (
          <div className="message-list__error" role="alert">
            <span>{t('ai.streamError')}：{error}</span>
            {onRetry && <button type="button" onClick={onRetry}>{t('ai.retrySend')}</button>}
          </div>
        )}
      </div>
      {autoScrollPaused && (
        <button type="button" className="message-list__back-to-latest" onClick={backToLatest}>
          {t('ai.backToLatest')}
        </button>
      )}
    </div>
  );
}

/** 紧凑工具卡片：参数摘要 + 完成后的结果摘录（可展开工具行属 ResearchMode，Plan C）。 */
function ToolCard({ event }: { event: { tool: string; status: string; argsDigest: string; resultExcerpt: string } }) {
  const { t } = useI18n();
  return (
    <div className={`tool-card tool-card--${event.status}`} data-tool={event.tool}>
      <span className="tool-card__icon">{event.status === 'done' ? '✓' : '⚙'}</span>
      <span className="tool-card__name">{event.tool}</span>
      {event.argsDigest && <span className="tool-card__digest">{event.argsDigest}</span>}
      <span className="tool-card__status">{event.status === 'done' ? t('ai.toolDone') : t('ai.toolRunning')}</span>
      {event.status === 'done' && event.resultExcerpt && (
        <div className="tool-card__excerpt">{event.resultExcerpt}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 确认通过 + 提交**

```bash
npm run test:renderer -- MessageList.test
git add src/renderer-react/features/ai/MessageList.tsx src/renderer-react/features/ai/MessageList.test.tsx
git commit -m "feat(ai): message list with streaming turn, tool cards, and scroll pause"
```

Expected: PASS（5 test）。

---

### Task 7: Composer（输入区 + 附件 + 发送/停止 + 状态芯片）

**Files:**
- Create: `src/renderer-react/features/ai/Composer.tsx`
- Test: `src/renderer-react/features/ai/Composer.test.tsx`

附件读取说明：渲染层运行在 `sandbox: true`（`File.path` 不可用，`ai:readTextAttachment` IPC 无法获得绝对路径），因此附件经 **FileReader（`file.text()`）** 在渲染层直接读取，200KB 上限本地校验。A1 的 readTextAttachment IPC 保留（供将来非 sandbox 入口复用）。

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/ai/Composer.test.tsx`：

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { Composer } from './Composer';

const dictionary = {
  ai: {
    inputPlaceholder: '输入问题…', send: '发送', stop: '停止', attach: '添加附件', inputBox: '消息输入',
    attachmentTooLarge: '附件超过 200KB 上限', attachmentReadFailed: '附件读取失败',
    removeAttachment: '移除附件', attachments: '附件', toolRunning: '运行中…',
  },
};

function renderComposer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  return render(<I18nProvider dictionary={dictionary}>
    <Composer onSend={vi.fn()} onStop={vi.fn()} {...props} />
  </I18nProvider>);
}

beforeEach(() => {
  resetAiStreamStoreForTests();
});

test('Enter sends the text; Shift+Enter inserts a newline', async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  renderComposer({ onSend });
  const input = screen.getByRole('textbox', { name: '消息输入' });
  await user.type(input, '第一行{Shift>}{Enter}{/Shift}第二行');
  expect(onSend).not.toHaveBeenCalled();
  await user.type(input, '{Enter}');
  expect(onSend).toHaveBeenCalledWith('第一行\n第二行', []);
  expect(input).toHaveValue('');
});

test('empty input does not send and disabled state blocks typing', async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  const { rerender } = renderComposer({ onSend });
  const input = screen.getByRole('textbox', { name: '消息输入' });
  await user.type(input, '{Enter}');
  expect(onSend).not.toHaveBeenCalled();
  rerender(<I18nProvider dictionary={dictionary}><Composer onSend={onSend} onStop={vi.fn()} disabled /></I18nProvider>);
  expect(screen.getByRole('textbox', { name: '消息输入' })).toBeDisabled();
});

test('stop button replaces send while streaming and calls onStop', async () => {
  const user = userEvent.setup();
  const onStop = vi.fn();
  renderComposer({ onStop });
  act(() => { aiStreamStore.setState({ active: true }); });
  expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '停止' }));
  expect(onStop).toHaveBeenCalledTimes(1);
});

test('text attachments are read, previewed inline, removable, and sent with the message', async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  renderComposer({ onSend });
  const file = new File(['附件内容'], 'notes.txt', { type: 'text/plain' });
  await user.upload(screen.getByLabelText('添加附件'), file);
  expect(await screen.findByText('notes.txt')).toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: '消息输入' });
  await user.type(input, '看看这个{Enter}');
  expect(onSend).toHaveBeenCalledWith('看看这个', [{ name: 'notes.txt', content: '附件内容' }]);
});

test('attachments over 200KB are rejected with an inline error', async () => {
  const user = userEvent.setup();
  renderComposer();
  const big = new File(['x'], 'big.txt', { type: 'text/plain' });
  Object.defineProperty(big, 'size', { value: 200 * 1024 + 1 });
  await user.upload(screen.getByLabelText('添加附件'), big);
  expect(await screen.findByText(/200KB 上限/)).toBeInTheDocument();
  expect(screen.queryByText('big.txt')).not.toBeInTheDocument();
});

test('status chip shows provider·model and gains tool activity while calling', () => {
  renderComposer({ statusChip: 'OpenAI · gpt-test' });
  expect(screen.getByText('OpenAI · gpt-test')).toBeInTheDocument();
  expect(screen.queryByText(/运行中/)).not.toBeInTheDocument();
  act(() => {
    aiStreamStore.setState({ active: true, segments: [{ kind: 'tool', event: { tool: 'x', status: 'calling', argsDigest: '', resultExcerpt: '', requiresConfirmation: false } }] });
  });
  expect(screen.getByText(/运行中…/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- Composer.test
```

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/ai/Composer.tsx`：

```tsx
import { useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import type { ChatAttachment } from './chatMessage';

const MAX_ATTACHMENT_BYTES = 200 * 1024;
const MAX_INPUT_HEIGHT_PX = 120;

export interface ComposerProps {
  disabled?: boolean;
  /** provider · model 芯片文本（由 AiWorkspace 状态头传入）。 */
  statusChip?: string | null;
  onSend(text: string, attachments: ChatAttachment[]): void;
  onStop(): void;
}

export function Composer({ disabled, statusChip, onSend, onStop }: ComposerProps) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const active = useAiStreamStore((state) => state.active);
  const toolCalling = useAiStreamStore((state) => state.active
    && state.segments.some((segment) => segment.kind === 'tool' && segment.event.status === 'calling'));
  const blocked = disabled || active;

  const autoGrow = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || blocked) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
    requestAnimationFrame(autoGrow);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`${file.name}：${t('ai.attachmentTooLarge')}`);
        continue;
      }
      try {
        const content = await file.text();
        if (content.length === 0) continue;
        next.push({ name: file.name, content });
      } catch {
        setAttachmentError(`${file.name}：${t('ai.attachmentReadFailed')}`);
      }
    }
    if (next.length > 0) {
      setAttachments((current) => [...current, ...next]);
      setAttachmentError('');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="composer">
      {statusChip && (
        <div className="composer__status" data-calling={toolCalling ? 'true' : undefined}>
          <span>{statusChip}</span>
          {toolCalling && <span className="composer__tool-activity">⚙ {t('ai.toolRunning')}</span>}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="composer__attachments">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name}-${index}`} className="composer__attachment">
              📎 {attachment.name}
              <button type="button" aria-label={`${t('ai.removeAttachment')} ${attachment.name}`}
                onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}>×</button>
            </span>
          ))}
        </div>
      )}
      {attachmentError && <div className="composer__attachment-error" role="alert">{attachmentError}</div>}
      <div className="composer__row">
        <textarea ref={textareaRef} className="composer__input" rows={1}
          aria-label={t('ai.inputBox')} placeholder={t('ai.inputPlaceholder')}
          disabled={blocked} value={text}
          onChange={(event) => { setText(event.target.value); autoGrow(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
          }} />
        <label className="composer__attach" data-disabled={blocked ? 'true' : undefined}>
          📎<input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,text/*"
            aria-label={t('ai.attach')} disabled={blocked}
            onChange={(event) => { void handleFiles(event.target.files); }} />
        </label>
        {active
          ? <button type="button" className="composer__stop" onClick={onStop}>{t('ai.stop')}</button>
          : <button type="button" className="composer__send" disabled={blocked || !text.trim()} onClick={send}>{t('ai.send')}</button>}
      </div>
    </div>
  );
}
```

（附件用 `file.text()` 渲染层直读、200KB 本地校验；`ai:readTextAttachment` IPC 保留但本组件不依赖它——sandbox 渲染层的 `File` 没有绝对路径。）

- [ ] **Step 4: 确认通过 + 提交**

```bash
npm run test:renderer -- Composer.test
git add src/renderer-react/features/ai/Composer.tsx src/renderer-react/features/ai/Composer.test.tsx
git commit -m "feat(ai): composer with autogrow input, text attachments, and stop control"
```

Expected: PASS（6 test）。

---

### Task 8: ContextStrip（publisher 扩展 + 组件）

**Files:**
- Modify: `src/renderer-react/features/charts/context/chartAiContextPublisher.ts`
- Modify: `src/renderer-react/features/charts/context/chartAiContextPublisher.test.ts`
- Create: `src/renderer-react/features/ai/ContextStrip.tsx`
- Test: `src/renderer-react/features/ai/ContextStrip.test.tsx`

- [ ] **Step 1: 写失败测试（publisher 扩展）**

`src/renderer-react/features/charts/context/chartAiContextPublisher.test.ts` 追加（文件既有 `resetChartAiContextPublisherForTests` 用法照旧）：

```ts
test('latestChartAiContext exposes the newest intent and notifies subscribers', async () => {
  resetChartAiContextPublisherForTests();
  const context = { kind: 'western-chart', resultId: 'r9' } as never;
  const notified: number[] = [];
  expect(latestChartAiContext()).toBeNull();
  const unsubscribe = subscribeChartAiContext(() => notified.push(1));
  const send = vi.fn().mockResolvedValue(null);
  publishLatestChartAiContext(Symbol('t'), context, send, () => {});
  expect(latestChartAiContext()).toEqual(context);
  expect(notified).toHaveLength(1);
  unsubscribe();
  invalidateLatestChartAiContext();
  expect(latestChartAiContext()).toBeNull();
  expect(notified).toHaveLength(1);
});
```

（文件顶部 import 补 `latestChartAiContext, subscribeChartAiContext, invalidateLatestChartAiContext`；若文件用别的测试框架风格，按既有风格融合此断言。）

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- chartAiContextPublisher.test
```

Expected: FAIL —— 新导出不存在。

- [ ] **Step 3: 扩展 publisher**

`chartAiContextPublisher.ts` 顶部（`latestIntent` 声明后）加监听集合，并在 `enqueue`、`invalidateLatestChartAiContext` 通知：

```ts
const contextListeners = new Set<() => void>();
const notifyContextListeners = () => { for (const listener of contextListeners) listener(); };
```

`enqueue(...)` 函数体第一行（`latestIntent = {...}` 之后）追加 `notifyContextListeners();`。文件末尾追加导出：

```ts
/** 最近一次上下文意图（含 null 清除）；ContextStrip 的数据源（spec §4）。 */
export function latestChartAiContext(): WesternChartAiContext | null {
  return latestIntent?.context ?? null;
}

export function subscribeChartAiContext(listener: () => void): () => void {
  contextListeners.add(listener);
  return () => { contextListeners.delete(listener); };
}

/** 用户显式清除：作废最新意图（retryLatestChartAiContext 随之失效），不发 IPC。 */
export function invalidateLatestChartAiContext(): void {
  latestIntent = null;
  notifyContextListeners();
}
```

- [ ] **Step 4: 确认通过**

```bash
npm run test:renderer -- chartAiContextPublisher.test
```

Expected: PASS（既有 + 新 1）。

- [ ] **Step 5: 写失败测试（ContextStrip 组件）**

`src/renderer-react/features/ai/ContextStrip.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import {
  invalidateLatestChartAiContext, publishLatestChartAiContext,
  resetChartAiContextPublisherForTests, subscribeChartAiContext,
} from '../charts/context/chartAiContextPublisher';
import { ContextStrip } from './ContextStrip';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({ apiClient: { setAiChartContext: vi.fn().mockResolvedValue(null) } }));

const dictionary = {
  ai: { contextStrip: 'AI 上下文', removeContext: '清除上下文' },
};

beforeEach(() => { resetChartAiContextPublisherForTests(); });

test('hidden without context; shows a summary and clears on demand', async () => {
  const user = userEvent.setup();
  const send = vi.fn().mockResolvedValue(null);
  const { rerender } = render(<I18nProvider dictionary={dictionary}><ContextStrip /></I18nProvider>);
  expect(screen.queryByText('AI 上下文')).not.toBeInTheDocument();

  publishLatestChartAiContext(Symbol('t'), {
    kind: 'western-chart', route: 'personal', resultId: 'r1', chartType: 'natal',
    activeProfile: { id: 'p1', displayName: '小紫' },
    successfulFilters: { type: 'natal', primary: { id: 'p1', displayName: '小紫' }, secondary: null, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
    draftSummary: { label: 'uncalculated', type: 'natal', houseSystem: 'placidus', zodiac: 'tropical', targetLocal: '2026-09-22T12:00' },
    focusedIdentity: 'natal:sun',
  } as never, send, () => {});
  rerender(<I18nProvider dictionary={dictionary}><ContextStrip /></I18nProvider>);
  expect(screen.getByText(/小紫/)).toBeInTheDocument();
  expect(screen.getByText(/natal/)).toBeInTheDocument();
  expect(screen.getByText(/2026-09-22T12:00/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '清除上下文' }));
  expect(invalidateLatestChartAiContext ? true : true).toBe(true);
  expect(apiClient.setAiChartContext).toHaveBeenCalledWith(null);
  expect(screen.queryByText(/小紫/)).not.toBeInTheDocument();
});

test('publisher notifications refresh the strip', () => {
  publishLatestChartAiContext(Symbol('t'), { kind: 'western-chart', resultId: 'r2', activeProfile: null } as never,
    vi.fn().mockResolvedValue(null), () => {});
  render(<I18nProvider dictionary={dictionary}><ContextStrip /></I18nProvider>);
  expect(screen.getByText('AI 上下文')).toBeInTheDocument();
  publishLatestChartAiContext(Symbol('t2'), { kind: 'western-chart', resultId: 'r3', activeProfile: { id: 'p', displayName: '后来' } } as never,
    vi.fn().mockResolvedValue(null), () => {});
  expect(screen.getByText(/后来/)).toBeInTheDocument();
});
```

- [ ] **Step 6: 实现组件**

`src/renderer-react/features/ai/ContextStrip.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import type { WesternChartAiContext } from '../../api/contracts';
import {
  invalidateLatestChartAiContext, latestChartAiContext, subscribeChartAiContext,
} from '../charts/context/chartAiContextPublisher';

/** 当前 AI 上下文摘要条：档案 / 盘型 / 时间 / 焦点；× 清除 = setContext(null)（spec §4）。 */
export function ContextStrip() {
  const { t } = useI18n();
  const [context, setContext] = useState<WesternChartAiContext | null>(() => latestChartAiContext());

  useEffect(() => subscribeChartAiContext(() => setContext(latestChartAiContext())), []);

  if (!context) return null;
  const chips = [
    context.activeProfile?.displayName,
    context.successfulFilters?.type,
    context.draftSummary && typeof context.draftSummary === 'object' && 'targetLocal' in context.draftSummary
      ? String((context.draftSummary as { targetLocal?: string }).targetLocal ?? '')
      : '',
    typeof context.focusedIdentity === 'string' && context.focusedIdentity ? context.focusedIdentity : '',
  ].filter(Boolean);

  const clear = () => {
    invalidateLatestChartAiContext();
    setContext(null);
    void apiClient.setAiChartContext(null);
  };

  return (
    <div className="context-strip" data-testid="ai-context-strip">
      <span className="context-strip__label">{t('ai.contextStrip')}</span>
      {chips.map((chip) => <span key={chip} className="context-strip__chip">{chip}</span>)}
      <button type="button" className="context-strip__clear" aria-label={t('ai.removeContext')}
        onClick={clear}>×</button>
    </div>
  );
}
```

（chips 数组在 `focusedIdentity` 一项之后再补「已选」计数，对齐 spec §2 的「选中对象」：

```ts
    context.selectedRows && context.selectedRows.length > 0
      ? `已选 ${context.selectedRows.length}` : '',
```

`draftIsStale` 不展示——上下文条只呈现事实摘要，陈旧态由同步状态告警承担。）

- [ ] **Step 7: 确认通过 + 提交**

```bash
npm run test:renderer -- ContextStrip.test
npm run test:renderer -- chartAiContextPublisher.test
git add src/renderer-react/features/charts/context/chartAiContextPublisher.ts src/renderer-react/features/charts/context/chartAiContextPublisher.test.ts src/renderer-react/features/ai/ContextStrip.tsx src/renderer-react/features/ai/ContextStrip.test.tsx
git commit -m "feat(ai): context strip driven by the chart context publisher"
```

Expected: 全部 PASS。

---

### Task 9: ChatMode（对话模式组装与编排）

**Files:**
- Create: `src/renderer-react/features/ai/ChatMode.tsx`
- Test: `src/renderer-react/features/ai/ChatMode.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/ai/ChatMode.test.tsx`（覆盖 spec §9 的 mock 流式事件序列：token → tool-call → truncated → done；fork 派生流程；编辑重发）：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { apiClient } from '../../api/client';
import { ChatMode } from './ChatMode';

vi.mock('../../api/client', () => ({
  apiClient: {
    listAiSessions: vi.fn(),
    createAiSession: vi.fn(),
    forkAiSession: vi.fn(),
    replaceAiSessionFrom: vi.fn(),
  },
}));

const dictionary = {
  ai: {
    copy: '复制', quote: '引用', editResend: '编辑重发', resend: '重发', cancelEdit: '取消',
    fork: '从此处分支', regenerate: '重新生成', editMessage: '编辑消息',
    backToLatest: '↓ 回到最新', truncated: '⚠️ 输出因达到 Token 上限被截断',
    retrySend: '重试', streamError: '请求失败',
    inputPlaceholder: '输入问题…', send: '发送', stop: '停止', attach: '添加附件',
    attachmentTooLarge: '附件超过 200KB 上限', attachmentReadFailed: '附件读取失败',
    removeAttachment: '移除附件', inputBox: '消息输入', messagesRegion: '对话消息',
    noMessages: '会话暂无消息', toolRunning: '运行中…', toolDone: '完成',
    modeChat: '对话',
  },
};

const sessions = [
  { id: 's1', title: '会话一', messages: [
    { role: 'user', content: '问题一' },
    { role: 'ai', content: '回答一' },
    { role: 'user', content: '问题二' },
    { role: 'ai', content: '回答二' },
  ], pinned: false, mode: 'chat', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

type StreamHooks = {
  emitToken(event: { sessionId?: string; type: string; data: unknown }): void;
  emitDone(): void;
  emitError(message: string): void;
};

function installStreamApi(): StreamHooks {
  const hooks: { token: Array<(e: never) => void>; done: Array<() => void>; error: Array<(e: { message?: string }) => void> } = {
    token: [], done: [], error: [],
  };
  vi.stubGlobal('mystApi', {
    ai: {
      chat: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true }),
      removeAllListeners: vi.fn(),
      onToken: (cb: (e: never) => void) => hooks.token.push(cb),
      onDone: (cb: () => void) => hooks.done.push(cb),
      onError: (cb: (e: { message?: string }) => void) => hooks.error.push(cb),
    },
  });
  return {
    emitToken: (event) => { for (const cb of hooks.token) cb(event as never); },
    emitDone: () => { for (const cb of hooks.done) cb(); },
    emitError: (message) => { for (const cb of hooks.error) cb({ message }); },
  };
}

function renderMode() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <I18nProvider dictionary={dictionary}><ChatMode /></I18nProvider>
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiStreamStoreForTests();
  aiStreamStore.getState().setActiveSessionId('s1');
  vi.mocked(apiClient.listAiSessions).mockResolvedValue(sessions as never);
  vi.mocked(apiClient.createAiSession).mockResolvedValue(sessions[0] as never);
});

test('renders session history with regenerate on the last assistant message', async () => {
  installStreamApi();
  renderMode();
  expect(await screen.findByText('问题一')).toBeInTheDocument();
  expect(screen.getByText('回答一')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument();
});

test('send streams tokens, tool calls, truncation, then done refreshes the session list', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  renderMode();
  await screen.findByText('问题一');
  await user.type(screen.getByRole('textbox', { name: '消息输入' }), '火星落宫怎么看{Enter}');
  expect(await screen.findByText('火星落宫怎么看')).toBeInTheDocument();
  act(() => {
    stream.emitToken({ sessionId: 's1', type: 'token', data: '正在' });
    stream.emitToken({ sessionId: 's1', type: 'token', data: '推理' });
    stream.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'calling', argsDigest: 'q', resultExcerpt: '', requiresConfirmation: false } });
    stream.emitToken({ sessionId: 's1', type: 'tool-call', data: { tool: 'search_knowledge', status: 'done', argsDigest: '', resultExcerpt: '《占星书》', requiresConfirmation: false } });
    stream.emitToken({ sessionId: 's1', type: 'truncated', data: { reason: 'length' } });
  });
  expect(screen.getByText('正在推理')).toBeInTheDocument();
  expect(screen.getByText(/Token 上限被截断/)).toBeInTheDocument();
  act(() => stream.emitDone());
  await waitFor(() => expect(apiClient.listAiSessions).toHaveBeenCalledTimes(2));
});

test('regenerate rewrites the last user message in place and resends with resend flag', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.replaceAiSessionFrom).mockResolvedValue({ ...sessions[0], messages: sessions[0].messages.slice(0, 3) } as never);
  renderMode();
  await screen.findByText('回答二');
  await user.click(screen.getByRole('button', { name: '重新生成' }));
  await waitFor(() => expect(apiClient.replaceAiSessionFrom).toHaveBeenCalledWith('s1', 2, { role: 'user', content: '问题二' }));
  await waitFor(() => expect(window.mystApi.ai.chat).toHaveBeenCalledWith(
    [{ role: 'user', content: '问题二' }],
    { sessionId: 's1', resend: true },
  ));
});

test('edit-resend on a non-last user message forks first, then rewrites in the fork', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.forkAiSession).mockResolvedValue({
    ...sessions[0], id: 'fork-1', forkedFrom: { sessionId: 's1', messageIndex: 0 },
    messages: [{ role: 'user', content: '问题一' }],
  } as never);
  vi.mocked(apiClient.replaceAiSessionFrom).mockResolvedValue(null as never);
  renderMode();
  await screen.findByText('问题一');
  await user.click(screen.getAllByRole('button', { name: '编辑重发' })[0]);
  const editor = screen.getByRole('textbox', { name: '编辑消息' });
  await user.clear(editor);
  await user.type(editor, '改写后的问题');
  await user.click(screen.getByRole('button', { name: '重发' }));
  await waitFor(() => expect(apiClient.forkAiSession).toHaveBeenCalledWith('s1', 0));
  await waitFor(() => expect(apiClient.replaceAiSessionFrom).toHaveBeenCalledWith('fork-1', 0, { role: 'user', content: '改写后的问题' }));
  expect(aiStreamStore.getState().activeSessionId).toBe('fork-1');
  expect(window.mystApi.ai.chat).toHaveBeenCalledWith(
    [{ role: 'user', content: '改写后的问题' }],
    { sessionId: 'fork-1', resend: true },
  );
});

test('fork action derives a linked session and switches to it', async () => {
  installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.forkAiSession).mockResolvedValue({
    ...sessions[0], id: 'fork-2', forkedFrom: { sessionId: 's1', messageIndex: 1 },
    messages: sessions[0].messages.slice(0, 2),
  } as never);
  renderMode();
  await screen.findByText('问题一');
  await user.click(screen.getAllByRole('button', { name: '从此处分支' })[0]);
  await waitFor(() => expect(apiClient.forkAiSession).toHaveBeenCalledWith('s1', 0));
  expect(aiStreamStore.getState().activeSessionId).toBe('fork-2');
});

test('quote inserts the quoted text into the composer', async () => {
  installStreamApi();
  const user = userEvent.setup();
  renderMode();
  await screen.findByText('问题一');
  await user.click(screen.getAllByRole('button', { name: '引用' })[0]);
  const input = screen.getByRole('textbox', { name: '消息输入' }) as HTMLTextAreaElement;
  expect(input.value).toContain('> 问题一');
});

test('stream error offers retry which regenerates', async () => {
  const stream = installStreamApi();
  const user = userEvent.setup();
  vi.mocked(apiClient.replaceAiSessionFrom).mockResolvedValue(null as never);
  renderMode();
  await screen.findByText('问题一');
  await user.type(screen.getByRole('textbox', { name: '消息输入' }), '会失败的问题{Enter}');
  // 预置「错误后已持久化」的会话视图：主进程在请求开始时已 append 用户消息，
  // 错误收尾的 streamFinishSignal 会 invalidate → refetch 拿到这份新数据。
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([
    { ...sessions[0], messages: [...sessions[0].messages, { role: 'user', content: '会失败的问题' }] },
  ] as never);
  act(() => stream.emitError('网关超时'));
  expect(await screen.findByText(/网关超时/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(apiClient.replaceAiSessionFrom).toHaveBeenCalledWith('s1', 4, { role: 'user', content: '会失败的问题' }));
  await waitFor(() => expect(window.mystApi.ai.chat).toHaveBeenCalledWith(
    [{ role: 'user', content: '会失败的问题' }],
    { sessionId: 's1', resend: true },
  ));
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- ChatMode.test
```

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/ai/ChatMode.tsx`：

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import { aiStreamStore, useAiStreamStore } from '../../stores/aiStreamStore';
import { buildChatMessageContent, lastUserMessageIndex, type ChatAttachment } from './chatMessage';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

export function ChatMode({ statusChip }: { statusChip?: string | null }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activeSessionId = useAiStreamStore((state) => state.activeSessionId);
  const streamFinishSignal = useAiStreamStore((state) => state.streamFinishSignal);
  const [quoteDraft, setQuoteDraft] = useState('');
  const sessionsQuery = useQuery({ queryKey: ['ai-sessions'], queryFn: apiClient.listAiSessions });
  const sessions = sessionsQuery.data ?? [];
  const messages = (sessions.find((session) => session.id === activeSessionId)?.messages) ?? [];

  // 流结束（含 stop/error）后刷新会话列表，让历史替代本地流缓冲。
  useEffect(() => {
    if (streamFinishSignal === 0) return;
    void queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
  }, [queryClient, streamFinishSignal]);

  const send = (text: string, attachments: ChatAttachment[]) => {
    aiStreamStore.getState().startChat({ role: 'user', content: buildChatMessageContent(text, attachments), attachments });
  };

  /** 编辑重发：末条 user 原地改写；非末条 → fork 派生会话再改写（spec §2/§4）。 */
  const editResend = async (index: number, nextContent: string) => {
    if (!activeSessionId) return;
    const isLastUser = !messages.slice(index + 1).some((message) => message.role === 'user');
    let sessionId = activeSessionId;
    if (!isLastUser) {
      const forked = await apiClient.forkAiSession(activeSessionId, index);
      sessionId = forked.id;
      aiStreamStore.getState().setActiveSessionId(sessionId);
      await queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
    }
    await apiClient.replaceAiSessionFrom(sessionId, index, { role: 'user', content: nextContent });
    aiStreamStore.getState().startChat({ role: 'user', content: nextContent }, { resend: true });
  };

  /** 重新生成 / 错误重试共用：改写末条 user（截断其后）+ resend。 */
  const regenerate = async () => {
    if (!activeSessionId) return;
    const index = lastUserMessageIndex(messages);
    if (index < 0) return;
    const content = messages[index].content;
    await apiClient.replaceAiSessionFrom(activeSessionId, index, { role: 'user', content });
    aiStreamStore.getState().startChat({ role: 'user', content }, { resend: true });
  };

  const fork = async (index: number) => {
    if (!activeSessionId) return;
    const forked = await apiClient.forkAiSession(activeSessionId, index);
    aiStreamStore.getState().setActiveSessionId(forked.id);
    await queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
  };

  const copy = async (content: string) => { try { await navigator.clipboard.writeText(content); } catch { /* 剪贴板不可用时静默 */ } };
  const quote = (content: string) => {
    setQuoteDraft(`${content.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`);
  };

  const lastUser = lastUserMessageIndex(messages);
  const streamActive = useAiStreamStore((state) => state.active);
  const canRegenerate = !streamActive && lastUser >= 0;

  return (
    <section className="chat-mode" aria-label={t('ai.modeChat')}>
      <MessageList messages={messages} canRegenerate={canRegenerate}
        onCopy={(content) => { void copy(content); }} onQuote={quote}
        onEditResend={(index, next) => { void editResend(index, next); }}
        onFork={(index) => { void fork(index); }}
        onRegenerate={() => { void regenerate(); }}
        onRetry={() => { void regenerate(); }} />
      <Composer statusChip={statusChip} onSend={send} onStop={() => aiStreamStore.getState().stopStream()}
        quoteDraft={quoteDraft} onQuoteConsumed={() => setQuoteDraft('')} />
    </section>
  );
}
```

`Composer` 需要支持引用预填：给 `ComposerProps` 增加 `quoteDraft?: string` 与 `onQuoteConsumed?(): void`，组件内：

```tsx
  const quoteAppliedRef = useRef('');
  // Composer 组件体内、text state 之后：
  if (quoteDraft && quoteAppliedRef.current !== quoteDraft) {
    quoteAppliedRef.current = quoteDraft;
    setText((current) => (current ? `${current}\n\n${quoteDraft}` : quoteDraft));
    onQuoteConsumed?.();
  }
```

（在 `Composer.tsx` 里应用此修改——渲染期同步 state 更新的写法在 React 里是合法的「derived state during render」模式，且测试断言 input.value 立即可见。）

- [ ] **Step 4: 确认通过 + 提交**

```bash
npm run test:renderer -- ChatMode.test
npm run test:renderer -- Composer.test
git add src/renderer-react/features/ai/ChatMode.tsx src/renderer-react/features/ai/ChatMode.test.tsx src/renderer-react/features/ai/Composer.tsx
git commit -m "feat(ai): chat mode wiring send, edit-resend, fork, regenerate, and retry"
```

Expected: ChatMode 7 test PASS；Composer 既有测试不回归。

---

### Task 10: SessionRail（会话侧栏）

**Files:**
- Create: `src/renderer-react/features/ai/SessionRail.tsx`
- Test: `src/renderer-react/features/ai/SessionRail.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/ai/SessionRail.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { apiClient } from '../../api/client';
import { SessionRail } from './SessionRail';

vi.mock('../../api/client', () => ({
  apiClient: {
    listAiSessions: vi.fn(),
    createAiSession: vi.fn(),
    deleteAiSession: vi.fn(),
    renameAiSession: vi.fn(),
    setAiSessionPinned: vi.fn(),
    forkAiSession: vi.fn(),
  },
}));

const dictionary = {
  ai: {
    history: '对话历史', newChat: '新对话', noSessions: '暂无对话', deleteSession: '删除',
    deleteConfirm: '确认删除？', sessionDeleted: '已删除', searchSessions: '搜索对话…',
    pin: '置顶', unpin: '取消置顶', rename: '重命名', forked: '分支', emptySession: '（新对话）',
  },
};

const sessions = [
  { id: 's1', title: '置顶会话', messages: [], pinned: true, mode: 'chat', createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' },
  { id: 's2', title: null, messages: [{ role: 'user', content: '第一条消息很长很长很长很长' }], pinned: false, mode: 'chat', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z' },
  { id: 's3', title: '↩ 分支自 会话一', messages: [], pinned: false, forkedFrom: { sessionId: 's0', messageIndex: 1 }, mode: 'chat', createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z' },
];

function renderRail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <I18nProvider dictionary={dictionary}><SessionRail /></I18nProvider>
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiStreamStoreForTests();
  vi.mocked(apiClient.listAiSessions).mockResolvedValue(sessions as never);
});

test('lists sessions in order with pin markers, fallback labels, and fork indicator', async () => {
  renderRail();
  expect(await screen.findByText('置顶会话')).toBeInTheDocument();
  expect(screen.getByText(/第一条消息很长/)).toBeInTheDocument();
  expect(screen.getByText(/分支自/)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

test('search filters locally by title and first user message', async () => {
  const user = userEvent.setup();
  renderRail();
  await screen.findByText('置顶会话');
  await user.type(screen.getByRole('searchbox'), '第一条');
  expect(screen.queryByText('置顶会话')).not.toBeInTheDocument();
  expect(screen.getByText(/第一条消息很长/)).toBeInTheDocument();
});

test('pin toggle, rename inline, delete with two-step confirm, and new chat call the api layer', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.setAiSessionPinned).mockResolvedValue(sessions[0] as never);
  vi.mocked(apiClient.renameAiSession).mockResolvedValue(undefined as never);
  vi.mocked(apiClient.deleteAiSession).mockResolvedValue(true);
  vi.mocked(apiClient.createAiSession).mockResolvedValue({ id: 's9', title: null, messages: [], mode: 'chat', pinned: false } as never);
  renderRail();
  await screen.findByText('置顶会话');

  await user.click(screen.getAllByRole('button', { name: '取消置顶' })[0]);
  expect(apiClient.setAiSessionPinned).toHaveBeenCalledWith('s1', false);

  await user.click(screen.getAllByRole('button', { name: '重命名' })[0]);
  const renameInput = screen.getByRole('textbox', { name: '重命名会话' });
  await user.clear(renameInput);
  await user.type(renameInput, '新名字{Enter}');
  expect(apiClient.renameAiSession).toHaveBeenCalledWith('s1', '新名字');

  await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
  await user.click(screen.getByRole('button', { name: '确认删除？' }));
  expect(apiClient.deleteAiSession).toHaveBeenCalledWith('s1');

  await user.click(screen.getByRole('button', { name: '新对话' }));
  expect(apiClient.createAiSession).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- SessionRail.test
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/renderer-react/features/ai/SessionRail.tsx`：

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import { useAiStreamStore } from '../../stores/aiStreamStore';

/** 会话侧栏（三模式共享，spec §2/§6）：搜索（渲染层过滤）/置顶/重命名/删除/新建。 */
export function SessionRail() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const activeSessionId = useAiStreamStore((state) => state.activeSessionId);
  const streamActive = useAiStreamStore((state) => state.active);
  const sessionsQuery = useQuery({ queryKey: ['ai-sessions'], queryFn: apiClient.listAiSessions });

  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['ai-sessions'] }); };
  const setPinned = useMutation({ mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => apiClient.setAiSessionPinned(id, pinned), onSuccess: invalidate });
  const rename = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => apiClient.renameAiSession(id, title), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => apiClient.deleteAiSession(id), onSuccess: invalidate });
  const create = useMutation({ mutationFn: () => apiClient.createAiSession(), onSuccess: (session) => {
    aiStreamStore.getState().setActiveSessionId(session.id);
    invalidate();
  } });

  const sessions = (sessionsQuery.data ?? []).filter((session) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const label = session.title
      ?? session.messages.find((message) => message.role === 'user')?.content
      ?? '';
    return label.toLowerCase().includes(needle);
  });

  const label = (session: { title: string | null; messages: Array<{ role: string; content: string }> }): string =>
    session.title
    ?? (session.messages.find((message) => message.role === 'user')?.content ?? '').slice(0, 30)
    ?? t('ai.emptySession');

  const submitRename = (id: string) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    rename.mutate({ id, title });
  };

  return (
    <aside className="session-rail" aria-label={t('ai.history')}>
      <div className="session-rail__top">
        <input type="search" role="searchbox" className="session-rail__search"
          placeholder={t('ai.searchSessions')} value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="session-rail__new" disabled={streamActive}
          onClick={() => create.mutate()}>{t('ai.newChat')}</button>
      </div>
      <ul className="session-rail__list">
        {sessions.length === 0 && <li className="session-rail__empty">{t('ai.noSessions')}</li>}
        {sessions.map((session) => (
          <li key={session.id} className={`session-rail__item${session.id === activeSessionId ? ' is-active' : ''}`}
            data-pinned={session.pinned ? 'true' : undefined}
            data-forked={session.forkedFrom ? 'true' : undefined}>
            {renamingId === session.id ? (
              <input className="session-rail__rename" role="textbox" aria-label={t('ai.renameSession')}
                value={renameDraft} autoFocus
                onChange={(event) => setRenameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitRename(session.id);
                  if (event.key === 'Escape') setRenamingId(null);
                }}
                onBlur={() => submitRename(session.id)} />
            ) : (
              <button type="button" className="session-rail__select" disabled={streamActive}
                onClick={() => aiStreamStore.getState().setActiveSessionId(session.id)}>
                <span className="session-rail__label">{session.pinned ? '📌 ' : ''}{session.forkedFrom ? '↩ ' : ''}{label(session)}</span>
              </button>
            )}
            <div className="session-rail__actions">
              <button type="button" title={session.pinned ? t('ai.unpin') : t('ai.pin')} disabled={streamActive}
                onClick={() => setPinned.mutate({ id: session.id, pinned: !session.pinned })}>{session.pinned ? '📌' : '🔖'}</button>
              <button type="button" title={t('ai.rename')} disabled={streamActive}
                onClick={() => { setRenamingId(session.id); setRenameDraft(session.title ?? ''); }}>✎</button>
              {confirmingDeleteId === session.id
                ? <button type="button" className="session-rail__confirm-delete" disabled={remove.isPending}
                    onClick={() => { setConfirmingDeleteId(null); remove.mutate(session.id); }}>{t('ai.deleteConfirm')}</button>
                : <button type="button" title={t('ai.deleteSession')} disabled={streamActive}
                    onClick={() => setConfirmingDeleteId(session.id)}>✕</button>}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

测试字典补 `"renameSession": "重命名会话"`。

- [ ] **Step 4: 确认通过 + 提交**

```bash
npm run test:renderer -- SessionRail.test
git add src/renderer-react/features/ai/SessionRail.tsx src/renderer-react/features/ai/SessionRail.test.tsx
git commit -m "feat(ai): session rail with search, pin, rename, delete, and fork markers"
```

Expected: PASS（3 test）。

---

### Task 11: AiWorkspace 容器 + AppShell 接线 + 删除 AiStatusPanel

**Files:**
- Create: `src/renderer-react/features/ai/AiWorkspace.tsx`
- Create: `src/renderer-react/features/ai/ai-workspace.css`
- Create: `src/renderer-react/features/ai/ai-workspace-css.test.ts`
- Test: `src/renderer-react/features/ai/AiWorkspace.test.tsx`
- Modify: `src/renderer-react/shell/AppShell.tsx`（ai 槽位换 AiWorkspace）
- Modify: `src/renderer-react/shell/AppShell.test.tsx`（mock 补齐 + 断言迁移）
- Delete: `src/renderer-react/shell/AiStatusPanel.tsx`、`src/renderer-react/shell/AiStatusPanel.test.tsx`

AiWorkspace 职责（spec §2 + AiStatusPanel 既有职责迁移）：模式切换头（对话/报告/研究，报告与研究本计划占位）、状态条（provider · model + 已配置/未配置）、未配置横幅（引导去设置）、上下文同步失败告警（含重试，沿用 `chartWorkspace.aiContextSyncStatus`）、ContextStrip、SessionRail、模式内容区；并负责初始化 `activeSessionId`（列表第一个或新建）与 `ai:sessionsChanged` → invalidate。

- [ ] **Step 1: 写 CSS 契约测试（先红）**

`src/renderer-react/features/ai/ai-workspace-css.test.ts`（模式与 `charts-css.test.ts` 一致）：

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer-react/features/ai/ai-workspace.css'), 'utf8');

test('workspace fills the ai panel as a column with a bounded message list', () => {
  expect(css).toMatch(/\.ai-workspace\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*min-height:\s*0/s);
  expect(css).toMatch(/\.ai-workspace__body\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  expect(css).toMatch(/\.message-list\s*\{[^}]*min-height:\s*0/s);
  expect(css).toMatch(/\.message-list__scroller\s*\{[^}]*overflow-y:\s*auto[^}]*min-height:\s*0/s);
});

test('chat mode and session rail split horizontally with confined overflow', () => {
  expect(css).toMatch(/\.ai-workspace__content\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*2fr\)/s);
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
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- ai-workspace-css.test
```

Expected: FAIL —— CSS 文件不存在。

- [ ] **Step 3: 写样式**

`src/renderer-react/features/ai/ai-workspace.css`（满足上述契约 + 全部组件类；手写 CSS，用 tokens 变量）：

```css
/* AI 工作台（spec §2）。列布局：头部 / 上下文条 / 内容区。 */
.ai-workspace {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.ai-workspace__header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border, #2a2a33); }
.ai-workspace__modes { display: flex; gap: 4px; }
.ai-workspace__mode-tab { border: 1px solid transparent; background: transparent; color: inherit; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.ai-workspace__mode-tab[aria-pressed='true'] { border-color: var(--border, #2a2a33); background: var(--surface-2, #1e1e27); }
.ai-workspace__status { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.9; }
.ai-workspace__status[data-configured='false'] { color: var(--warning, #b58900); }
.ai-workspace__banner { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12px; }
.ai-workspace__banner--unconfigured { border-bottom: 1px solid var(--border, #2a2a33); }
.ai-workspace__banner--sync-error { border-bottom: 1px solid var(--border, #2a2a33); color: var(--danger, #c0564a); }
.ai-workspace__body { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; overflow: hidden; }
.ai-workspace__content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); min-height: 0; overflow: hidden; }
.ai-workspace__placeholder { display: grid; place-items: center; min-height: 0; overflow: auto; padding: 24px; opacity: 0.75; }

.context-strip { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border, #2a2a33); font-size: 12px; }
.context-strip__label { opacity: 0.7; }
.context-strip__chip { border: 1px solid var(--border, #2a2a33); border-radius: 10px; padding: 1px 8px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.context-strip__clear { border: none; background: transparent; color: inherit; cursor: pointer; padding: 0 4px; }

.session-rail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow-y: auto; border-right: 1px solid var(--border, #2a2a33); }
.session-rail__top { display: flex; gap: 6px; padding: 8px; position: sticky; top: 0; background: var(--surface-base, #14141b); z-index: 1; }
.session-rail__search { flex: 1; min-width: 0; }
.session-rail__new { white-space: nowrap; }
.session-rail__list { list-style: none; margin: 0; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 2px; }
.session-rail__item { display: flex; align-items: center; gap: 4px; border-radius: 6px; }
.session-rail__item.is-active { background: var(--surface-2, #1e1e27); }
.session-rail__item[data-pinned='true'] { order: -1; }
.session-rail__select { flex: 1; min-width: 0; text-align: left; border: none; background: transparent; color: inherit; padding: 6px 4px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-rail__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-rail__actions { display: flex; gap: 2px; opacity: 0; }
.session-rail__item:hover .session-rail__actions, .session-rail__item:focus-within .session-rail__actions { opacity: 1; }
.session-rail__actions button { border: none; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px; }
.session-rail__confirm-delete { color: var(--danger, #c0564a); }
.session-rail__rename { flex: 1; min-width: 0; }
.session-rail__empty { opacity: 0.6; padding: 10px 4px; font-size: 12px; }

.chat-mode { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; min-width: 0; overflow: hidden; }

.message-list { position: relative; display: grid; min-height: 0; }
.message-list__scroller { overflow-y: auto; min-height: 0; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.message-list__empty { opacity: 0.6; text-align: center; padding: 24px 8px; }
.message-list__stream { display: flex; flex-direction: column; gap: 10px; }
.message-list__truncated { border: 1px solid var(--warning, #b58900); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
.message-list__error { display: flex; gap: 8px; align-items: center; justify-content: space-between; border: 1px solid var(--danger, #c0564a); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
.message-list__back-to-latest { position: absolute; right: 16px; bottom: 12px; border: 1px solid var(--border, #2a2a33); border-radius: 999px; padding: 4px 12px; background: var(--surface-2, #1e1e27); cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }

.message-item { position: relative; display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
.message-item--user { align-self: flex-end; align-items: flex-end; }
.message-item--ai { align-self: flex-start; }
.message-item--pending { opacity: 0.75; }
.message-item__body { border-radius: 10px; padding: 8px 10px; background: var(--surface-2, #1e1e27); overflow-wrap: anywhere; }
.message-item--user .message-item__body { background: color-mix(in srgb, var(--accent, #7c6cf0) 22%, transparent); }
.message-item__attachments { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; font-size: 12px; }
.message-item__attachment { border: 1px solid var(--border, #2a2a33); border-radius: 8px; padding: 1px 6px; }
.message-item__text { white-space: pre-wrap; }
.message-item__actions { display: flex; gap: 4px; opacity: 0; font-size: 11px; }
.message-item:hover .message-item__actions, .message-item:focus-within .message-item__actions { opacity: 1; }
.message-item__actions[data-disabled='true'] { pointer-events: none; }
.message-item__actions button { border: none; background: transparent; color: inherit; opacity: 0.8; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.message-item__actions button:hover { opacity: 1; background: var(--surface-3, #262631); }
.message-item__editor { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.message-item__editor textarea { width: 100%; }
.message-item__editor-actions { display: flex; gap: 6px; }

.tool-card { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border: 1px solid var(--border, #2a2a33); border-radius: 8px; padding: 6px 10px; font-size: 12px; }
.tool-card--calling { opacity: 0.85; }
.tool-card--done { opacity: 1; }
.tool-card__name { font-weight: 600; }
.tool-card__digest { opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.tool-card__status { opacity: 0.7; }
.tool-card__excerpt { flex-basis: 100%; border-top: 1px dashed var(--border, #2a2a33); margin-top: 4px; padding-top: 4px; opacity: 0.8; }

.composer { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--border, #2a2a33); }
.composer__status { display: flex; gap: 8px; font-size: 12px; opacity: 0.85; }
.composer__status[data-calling='true'] { color: var(--accent, #7c6cf0); }
.composer__attachments { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
.composer__attachment { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--border, #2a2a33); border-radius: 8px; padding: 2px 6px; }
.composer__attachment button { border: none; background: transparent; color: inherit; cursor: pointer; }
.composer__attachment-error { font-size: 12px; color: var(--danger, #c0564a); }
.composer__row { display: flex; gap: 6px; align-items: flex-end; }
.composer__input { flex: 1; min-width: 0; max-height: 120px; resize: none; }
.composer__attach { cursor: pointer; padding: 4px 6px; }
.composer__attach[data-disabled='true'] { opacity: 0.4; pointer-events: none; }
.composer__attach input[type='file'] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.composer__send, .composer__stop { white-space: nowrap; }

.markdown-message { line-height: 1.6; overflow-wrap: anywhere; }
.markdown-message table { border-collapse: collapse; }
.markdown-message th, .markdown-message td { border: 1px solid var(--border, #2a2a33); padding: 3px 8px; }
.markdown-message pre { background: var(--surface-3, #262631); border-radius: 6px; padding: 8px 10px; overflow-x: auto; }
.markdown-message code { font-family: var(--font-mono, monospace); }
.markdown-message blockquote { border-inline-start: 3px solid var(--border, #2a2a33); margin: 4px 0; padding: 2px 10px; opacity: 0.85; }
```

- [ ] **Step 4: 确认 CSS 契约通过**

```bash
npm run test:renderer -- ai-workspace-css.test
```

Expected: PASS（4 test）。

- [ ] **Step 5: 写 AiWorkspace 失败测试**

`src/renderer-react/features/ai/AiWorkspace.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { resetAiStreamStoreForTests, aiStreamStore } from '../../stores/aiStreamStore';
import { chartWorkspaceStore } from '../../stores/chartWorkspace';
import { publishLatestChartAiContext, resetChartAiContextPublisherForTests } from '../charts/context/chartAiContextPublisher';
import { apiClient } from '../../api/client';
import { AiWorkspace } from './AiWorkspace';

vi.mock('../../api/client', () => ({
  apiClient: {
    getAiStatus: vi.fn(),
    listAiSessions: vi.fn(),
    createAiSession: vi.fn(),
    setAiChartContext: vi.fn().mockResolvedValue(null),
  },
}));

const dictionary = {
  ai: {
    title: 'AI 占星顾问', modeChat: '对话', modeReport: '报告', modeResearch: '研究',
    notConfigured: 'AI 未配置，请前往', goToSettings: '设置页面', toConfigure: '进行配置',
    reportPlaceholder: '报告模式将在后续迁移阶段启用', researchPlaceholder: '研究模式将在后续迁移阶段启用',
    history: '对话历史', newChat: '新对话', noSessions: '暂无对话', deleteSession: '删除',
    deleteConfirm: '确认删除？', searchSessions: '搜索对话…', pin: '置顶', unpin: '取消置顶',
    rename: '重命名', renameSession: '重命名会话', emptySession: '（新对话）',
    inputPlaceholder: '输入问题…', send: '发送', stop: '停止', attach: '添加附件', inputBox: '消息输入',
    messagesRegion: '对话消息', noMessages: '会话暂无消息',
  },
  shell: { retryAiSync: '重试 AI 同步', aiContextSyncFailed: 'AI 上下文同步失败，当前上下文可能已过期：{{message}}', loading: '正在读取状态…' },
};

const configured = { configured: true, provider: 'OpenAI', model: 'gpt-test', baseUrl: '', knowledgeDocCount: 3 };

function renderWorkspace(onNavigate?: (route: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <I18nProvider dictionary={dictionary}><AiWorkspace onNavigate={onNavigate} /></I18nProvider>
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiStreamStoreForTests();
  resetChartAiContextPublisherForTests();
  vi.mocked(apiClient.getAiStatus).mockResolvedValue(configured as never);
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([
    { id: 's1', title: '已有会话', messages: [], pinned: false, mode: 'chat' },
  ] as never);
  vi.stubGlobal('mystApi', {
    ai: { onStatusChanged: vi.fn(() => vi.fn()), onSessionsChanged: vi.fn(() => vi.fn()) },
  });
});

test('initializes the active session from the list and renders chat mode with mode tabs', async () => {
  renderWorkspace();
  expect(await screen.findByRole('tab', { name: '对话' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '报告' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '研究' })).toBeInTheDocument();
  await waitFor(() => expect(aiStreamStore.getState().activeSessionId).toBe('s1'));
  expect(screen.getByRole('complementary', { name: '对话历史' })).toBeInTheDocument();
});

test('creates a session when the list is empty', async () => {
  vi.mocked(apiClient.listAiSessions).mockResolvedValue([]);
  vi.mocked(apiClient.createAiSession).mockResolvedValue({ id: 'fresh', title: null, messages: [], pinned: false, mode: 'chat' } as never);
  renderWorkspace();
  await waitFor(() => expect(aiStreamStore.getState().activeSessionId).toBe('fresh'));
});

test('unconfigured status shows the settings guide and navigates on click', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.getAiStatus).mockResolvedValue({ ...configured, configured: false } as never);
  const onNavigate = vi.fn();
  renderWorkspace(onNavigate);
  expect(await screen.findByText(/AI 未配置/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /设置页面/ }));
  expect(onNavigate).toHaveBeenCalledWith('settings');
});

test('chart context sync failure keeps the retry alert in the workspace', async () => {
  const user = userEvent.setup();
  chartWorkspaceStore.getState().setAiContextSync('error', 'clear offline');
  // 先放一个可重试的意图（null 上下文），点重试 → publisher 重发 null → setAiChartContext(null)。
  publishLatestChartAiContext(Symbol('smoke-owner'), null, apiClient.setAiChartContext as never, () => {});
  renderWorkspace();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/clear offline/);
  chartWorkspaceStore.getState().setAiContextSync('synced');
  await user.click(within(alert).getByRole('button', { name: '重试 AI 同步' }));
  await waitFor(() => expect(apiClient.setAiChartContext).toHaveBeenCalledWith(null));
});

test('report and research tabs show placeholders and chat returns', async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await screen.findByRole('tab', { name: '报告' });
  await user.click(screen.getByRole('tab', { name: '报告' }));
  expect(screen.getByText('报告模式将在后续迁移阶段启用')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: '研究' }));
  expect(screen.getByText('研究模式将在后续迁移阶段启用')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: '对话' }));
  expect(screen.getByRole('textbox', { name: '消息输入' })).toBeInTheDocument();
});
```

- [ ] **Step 6: 实现 AiWorkspace**

`src/renderer-react/features/ai/AiWorkspace.tsx`：

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { parseAiStatus, apiClient } from '../../api/client';
import type { AiStatus } from '../../api/contracts';
import type { RouteKey } from '../../shell/routes';
import { aiStreamStore, useAiStreamStore } from '../../stores/aiStreamStore';
import { useChartWorkspace } from '../../stores/chartWorkspace';
import { retryLatestChartAiContext } from '../charts/context/chartAiContextPublisher';
import { ChatMode } from './ChatMode';
import { ContextStrip } from './ContextStrip';
import { SessionRail } from './SessionRail';
import './ai-workspace.css';

export function AiWorkspace({ onNavigate }: { onNavigate?: (route: RouteKey) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mode = useAiStreamStore((state) => state.mode);
  const setMode = useAiStreamStore((state) => state.setMode);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const aiContextSyncStatus = useChartWorkspace((state) => state.aiContextSyncStatus);
  const aiContextSyncMessage = useChartWorkspace((state) => state.aiContextSyncMessage);
  const setAiContextSync = useChartWorkspace((state) => state.setAiContextSync);

  // 状态条（AiStatusPanel 职责迁移）：初始拉取 + 事件跟随。
  useEffect(() => {
    let active = true;
    const load = () => {
      void apiClient.getAiStatus().then(
        (next) => { if (active) { setStatus(next); setStatusError(''); } },
        (reason: unknown) => { if (active) { setStatusError(reason instanceof Error ? reason.message : String(reason)); } },
      );
    };
    load();
    const unsubscribe = window.mystApi.ai.onStatusChanged((payload) => {
      if (!active) return;
      try { setStatus(parseAiStatus(payload)); setStatusError(''); } catch (reason) {
        setStatusError(reason instanceof Error ? reason.message : String(reason));
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  // 会话基础设施（三模式共享）：初始化当前会话 + sessionsChanged → invalidate。
  useEffect(() => {
    let active = true;
    const bootstrap = () => {
      void apiClient.listAiSessions().then(
        (sessions) => {
          if (!active || aiStreamStore.getState().activeSessionId) return;
          if (sessions.length > 0) aiStreamStore.getState().setActiveSessionId(sessions[0].id);
          else void apiClient.createAiSession().then(
            (session) => { if (active) aiStreamStore.getState().setActiveSessionId(session.id); },
            () => { /* 会话不可用：ChatMode 显示空态，不阻塞工作台 */ },
          );
        },
        () => { /* 列表失败：SessionRail/ChatMode 显示各自错误态 */ },
      );
    };
    bootstrap();
    const unsubscribe = window.mystApi.ai.onSessionsChanged(() => { void queryClient.invalidateQueries({ queryKey: ['ai-sessions'] }); });
    return () => { active = false; unsubscribe(); };
  }, [queryClient]);

  const statusChip = status?.configured ? `${status.provider || '—'} · ${status.model || '—'}` : null;

  return (
    <section className="ai-workspace" aria-label={t('ai.title')}>
      <header className="ai-workspace__header">
        <div className="ai-workspace__modes" role="tablist" aria-label={t('ai.title')}>
          <button type="button" className="ai-workspace__mode-tab" role="tab" aria-pressed={mode === 'chat'} aria-selected={mode === 'chat'}
            onClick={() => setMode('chat')}>💬 {t('ai.modeChat')}</button>
          <button type="button" className="ai-workspace__mode-tab" role="tab" aria-pressed={mode === 'report'} aria-selected={mode === 'report'}
            onClick={() => setMode('report')}>📄 {t('ai.modeReport')}</button>
          <button type="button" className="ai-workspace__mode-tab" role="tab" aria-pressed={mode === 'research'} aria-selected={mode === 'research'}
            onClick={() => setMode('research')}>🔍 {t('ai.modeResearch')}</button>
        </div>
        <div className="ai-workspace__status" data-configured={status?.configured ? 'true' : 'false'}>
          {statusChip ?? (statusError ? statusError : t('ai.llmDisconnected'))}
        </div>
      </header>
      {status && !status.configured && (
        <div className="ai-workspace__banner ai-workspace__banner--unconfigured" role="alert">
          <span>{t('ai.notConfigured')}</span>
          {onNavigate && <button type="button" onClick={() => onNavigate('settings')}>{t('ai.goToSettings')}</button>}
          <span>{t('ai.toConfigure')}</span>
        </div>
      )}
      {aiContextSyncStatus === 'error' && (
        <div className="ai-workspace__banner ai-workspace__banner--sync-error" role="alert">
          <p>{t('shell.aiContextSyncFailed', { message: aiContextSyncMessage ?? '' })}</p>
          <button type="button" disabled={aiContextSyncStatus === 'syncing'} onClick={() => {
            setAiContextSync('syncing');
            if (!retryLatestChartAiContext()) setAiContextSync('error', aiContextSyncMessage);
          }}>{t('shell.retryAiSync')}</button>
        </div>
      )}
      <ContextStrip />
      <div className="ai-workspace__body">
        <div className="ai-workspace__content">
          <SessionRail />
          {mode === 'chat' ? <ChatMode statusChip={statusChip} />
            : mode === 'report' ? <div className="ai-workspace__placeholder">{t('ai.reportPlaceholder')}</div>
            : <div className="ai-workspace__placeholder">{t('ai.researchPlaceholder')}</div>}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: 确认 AiWorkspace 测试通过**

```bash
npm run test:renderer -- AiWorkspace.test
```

Expected: PASS（5 test）。

- [ ] **Step 8: AppShell 接线 + 删除 AiStatusPanel + 更新 AppShell.test**

`src/renderer-react/shell/AppShell.tsx`：
- 删除 `import { AiStatusPanel } from './AiStatusPanel';`，改 `import { AiWorkspace } from '../features/ai/AiWorkspace';`
- `ai={<AiStatusPanel onNavigate={navigate} />}` 改为 `ai={<AiWorkspace onNavigate={navigate} />}`

删除文件：
```bash
git rm src/renderer-react/shell/AiStatusPanel.tsx src/renderer-react/shell/AiStatusPanel.test.tsx
```

`src/renderer-react/shell/AppShell.test.tsx` 更新（保持既有断言语义不变——「AI 上下文同步失败」告警与无障碍 label 都由 AiWorkspace 继续提供）：
- beforeEach 的 `vi.stubGlobal('mystApi', {...})` 中 `ai` 对象补齐（在现有 `status/onStatusChanged/initStatus/onInitProgress` 基础上追加）：

```ts
    ai: {
      status: vi.fn().mockResolvedValue({ ok: true, data: { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 } }),
      onStatusChanged: vi.fn(() => vi.fn()), initStatus: vi.fn(), onInitProgress: vi.fn(),
      onSessionsChanged: vi.fn(() => vi.fn()), onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn(),
      removeAllListeners: vi.fn(), chat: vi.fn().mockResolvedValue({ ok: true }), interpret: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true }),
      sessions: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        create: vi.fn().mockResolvedValue({ ok: true, data: { id: 'shell-session', title: null, messages: [], mode: 'chat', pinned: false } }),
        rename: vi.fn().mockResolvedValue({ ok: true, data: null }), generateTitle: vi.fn().mockResolvedValue({ ok: true, data: { title: '' } }),
        delete: vi.fn().mockResolvedValue({ ok: true, data: true }),
        fork: vi.fn().mockResolvedValue({ ok: true, data: { id: 'shell-fork', title: '↩ 分支自', messages: [], mode: 'chat', pinned: false, forkedFrom: { sessionId: 's', messageIndex: 0 } } }),
        setPinned: vi.fn().mockResolvedValue({ ok: true, data: null }),
        replaceFrom: vi.fn().mockResolvedValue({ ok: true, data: null }),
      },
    },
```

- 「settings route renders the settings page instead of the placeholder」测试里的 `Object.assign(api, { ai: {...} })` 同样补齐 `onSessionsChanged/onToken/onDone/onError/removeAllListeners/chat/interpret/stop` 与 `sessions.create/fork/setPinned/replaceFrom`（照上面结构）。
- 「keeps a rejected off-chart AI clear visible in the persistent shell and retries it」测试不需改断言（AiWorkspace 渲染同样的 alert 文案 key）；若因 AiWorkspace 挂载时机导致 `findByRole('alert')` 匹配到多个元素，用 `within(screen.getByRole('complementary', { name: /AI 区域|助手/ }))` 收窄查询。**执行时以测试实际输出为准做最小调整**（mock 补齐是必须的；断言仅在多匹配时收窄）。

- [ ] **Step 9: 回归 + 提交**

```bash
npm run test:renderer -- AppShell.test
npm run test:renderer -- AiWorkspace.test
npm run typecheck
git add -A src/renderer-react/shell src/renderer-react/features/ai src/renderer-react/stores
git status --short
git commit -m "feat(ai): ai workspace container replaces the status panel in the shell"
```

Expected: AppShell 全部测试 PASS（若「AI 上下文同步失败」测试因多 alert 失败，按 Step 8 说明收窄查询后重跑）；typecheck 0 error。提交包含 AiStatusPanel 删除（`git add -A` 覆盖 `git rm` 的删除记录——提交前 `git status --short` 确认无字体/test-output.txt 杂物）。

---

### Task 12: PanelLayout aiOpenSignal（跨组件展开 AI 面板）

**Files:**
- Modify: `src/renderer-react/shell/PanelLayout.tsx`
- Modify: `src/renderer-react/shell/AppShell.tsx`
- Create: `src/renderer-react/shell/PanelLayout.aiOpenSignal.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/shell/PanelLayout.aiOpenSignal.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createMatchMediaController } from '../test/matchMedia';
import { PanelLayout } from './PanelLayout';

const labels = {
  openAi: '打开 AI', closeAi: '关闭 AI', resizeNavigation: '调整导航', resizeAi: '调整 AI',
  navigationRegion: '导航区', workspaceRegion: '工作区', aiRegion: 'AI 区',
};

function renderLayout(signal: number | undefined, narrow = false) {
  const media = createMatchMediaController(narrow);
  vi.stubGlobal('matchMedia', media.matchMedia);
  return render(<PanelLayout navigation={<nav />} ai={<div>AI 内容</div>} labels={labels} aiOpenSignal={signal}>
    <main />
  </PanelLayout>);
}

test('a desktop signal bump expands a collapsed ai panel', () => {
  localStorage.setItem('chillast.shell.desktop', JSON.stringify({
    'shell-ai-panel,shell-main-panel,shell-navigation-panel': {
      layout: [16, 100, 0],
      expandToSizes: { 'shell-ai-panel': 27, 'shell-main-panel': 57, 'shell-navigation-panel': 16 },
    },
  }));
  const { rerender } = renderLayout(0);
  const aside = screen.getByRole('complementary', { name: 'AI 区' });
  expect(aside).toHaveAttribute('hidden');
  rerender(<PanelLayout navigation={<nav />} ai={<div>AI 内容</div>} labels={labels} aiOpenSignal={1}><main /></PanelLayout>);
  expect(screen.getByRole('complementary', { name: 'AI 区' })).not.toHaveAttribute('hidden');
  localStorage.clear();
});

test('a narrow signal bump opens the ai overlay dialog', () => {
  const { rerender } = renderLayout(0, true);
  expect(screen.queryByRole('dialog', { name: 'AI 区' })).toBeNull();
  rerender(<PanelLayout navigation={<nav />} ai={<div>AI 内容</div>} labels={labels} aiOpenSignal={1}><main /></PanelLayout>);
  expect(screen.getByRole('dialog', { name: 'AI 区' })).toBeInTheDocument();
  localStorage.clear();
});
```

（storage key 的 entry 形如 `PANEL_STORAGE_ENTRY_KEY` 排序拼接，若测试与实现不匹配，以 `PANEL_STORAGE_KEY`/`PANEL_STORAGE_ENTRY_KEY` 导出常量在测试里直接引用拼 key——`import { PANEL_STORAGE_KEY, PANEL_STORAGE_ENTRY_KEY } from './PanelLayout';`，用它们构造 localStorage 种子。**执行时采用后者**，避免手写 key 漂移。）

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- PanelLayout.aiOpenSignal.test
```

Expected: FAIL —— `aiOpenSignal` prop 无效果（collapsed 不展开）。

- [ ] **Step 3: 实现**

`src/renderer-react/shell/PanelLayout.tsx`：
- `PanelLayoutProps` 增加 `aiOpenSignal?: number;`
- 组件体内（`const isAiHidden = ...` 之前）加：

```tsx
  useEffect(() => {
    if (!aiOpenSignal) return;
    if (isNarrow) { setIsAiOpen(true); return; }
    setIsDesktopAiCollapsed(false);
    aiPanelRef.current?.expand();
  }, [aiOpenSignal, isNarrow]);
```

`src/renderer-react/shell/AppShell.tsx` —— `AppShellInner` 顶部加：

```tsx
  const aiOpenSignal = useAiStreamStore((state) => state.panelOpenSignal);
```

`import { useAiStreamStore } from '../stores/aiStreamStore';`，并把 `<PanelLayout ... >` 加上 `aiOpenSignal={aiOpenSignal}`。

- [ ] **Step 4: 确认通过 + 回归 + 提交**

```bash
npm run test:renderer -- PanelLayout
npm run test:renderer -- AppShell.test
npm run typecheck
git add src/renderer-react/shell/PanelLayout.tsx src/renderer-react/shell/PanelLayout.aiOpenSignal.test.tsx src/renderer-react/shell/AppShell.tsx
git commit -m "feat(ai): panel layout honors the workspace open signal"
```

Expected: PanelLayout 三套测试全绿；AppShell 全绿；typecheck 0 error。

---

### Task 13: ChartWorkbench「AI 解读」按钮

**Files:**
- Modify: `src/renderer-react/features/charts/workbench/ChartResultShell.tsx`
- Create: `src/renderer-react/features/charts/workbench/ChartResultShell.interpret.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer-react/features/charts/workbench/ChartResultShell.interpret.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { resetAiStreamStoreForTests, aiStreamStore } from '../../../stores/aiStreamStore';
import type { ChartRouteState } from '../../../stores/chartWorkspace';
import { twoRingResult, chartReference } from './chartTestFixtures';

const dictionary = {
  ai: { interpret: 'AI 解读' },
  chart: { workbench: { loading: '计算中', empty: '尚未计算', cancel: '取消计算', retry: '重试', profileRequired: '请先选择档案' } },
};

vi.mock('./InteractiveChart', () => ({ InteractiveChart: () => null }));
vi.mock('./ChartDataExplorer', () => ({ ChartDataExplorer: () => null }));
vi.mock('./ChartResultSummary', () => ({ ChartResultSummary: () => null }));

function makeState(withResult: boolean): ChartRouteState {
  const snapshot = {
    route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
    request: { type: 'natal', settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
  } as never;
  return {
    draft: {} as never, submitted: withResult ? snapshot : null, accepted: withResult ? snapshot : null,
    lastSuccessfulResult: withResult ? { ...twoRingResult, resultId: 'r-interpret' } as never : null,
    latestIssuedSequence: 1, activeSequence: null, requestStatus: 'success',
    requestFailureKind: null, requestMessage: null, isStale: false,
    submittedDraft: null, acceptedDraft: null,
  };
}

const props = (withResult: boolean) => ({
  route: 'personal' as const,
  state: makeState(withResult),
  reference: chartReference,
  profilesAvailable: true,
  validDraft: true,
  startupError: null,
  onRetry: vi.fn(),
  onCancel: vi.fn(),
});

beforeEach(() => {
  resetAiStreamStoreForTests();
});

test('hidden before a chart is accepted; enabled after and triggers interpret + panel signal', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<I18nProvider dictionary={dictionary}><ChartResultShell {...props(false)} /></I18nProvider>);
  expect(screen.queryByRole('button', { name: 'AI 解读' })).not.toBeInTheDocument();

  rerender(<I18nProvider dictionary={dictionary}><ChartResultShell {...props(true)} /></I18nProvider>);
  const button = screen.getByRole('button', { name: 'AI 解读' });
  await user.click(button);
  const stream = aiStreamStore.getState();
  expect(stream.mode).toBe('chat');
  expect(stream.panelOpenSignal).toBe(1);
  expect(stream.active).toBe(true);
  expect(stream.streamKind).toBe('interpret');
});

test('disabled while a stream is active', () => {
  aiStreamStore.setState({ active: true });
  render(<I18nProvider dictionary={dictionary}><ChartResultShell {...props(true)} /></I18nProvider>);
  expect(screen.getByRole('button', { name: 'AI 解读' })).toBeDisabled();
});
```

- [ ] **Step 2: 确认失败**

```bash
npm run test:renderer -- ChartResultShell.interpret.test
```

Expected: FAIL —— 按钮不存在。

- [ ] **Step 3: 实现**

`src/renderer-react/features/charts/workbench/ChartResultShell.tsx`：
- 顶部加 `import { Bot } from 'lucide-react';`（加入现有 lucide import 行）与 `import { useAiStreamStore } from '../../../stores/aiStreamStore';`
- `ChartResultShell` 组件体内（`const accepted = state.accepted;` 之后）加：

```tsx
  const startInterpret = useAiStreamStore((state) => state.startInterpret);
  const requestPanelOpen = useAiStreamStore((state) => state.requestPanelOpen);
  const streamActive = useAiStreamStore((state) => state.active);
  const canInterpret = Boolean(result && accepted);
  const interpretChart = () => {
    if (!result || !accepted) return;
    requestPanelOpen();
    startInterpret({ chartData: result, chartType: accepted.type });
  };
```

- `chart-result__actions` div 内追加（`取消` 按钮之后、`重试` 之前）：

```tsx
        {canInterpret && <button type="button" onClick={interpretChart} disabled={streamActive}>
          <Bot size={15} />{t('ai.interpret')}
        </button>}
```

- [ ] **Step 4: 确认通过 + 回归 + 提交**

```bash
npm run test:renderer -- ChartResultShell
npm run typecheck
git add src/renderer-react/features/charts/workbench/ChartResultShell.tsx src/renderer-react/features/charts/workbench/ChartResultShell.interpret.test.tsx
git commit -m "feat(ai): interpret action on the react chart workbench"
```

Expected: ChartResultShell 全部测试（既有 + 新 2）PASS；typecheck 0 error。

---

### Task 14: locale 正式文案 + smoke 探针 + 全量验证

**Files:**
- Modify: `locale/zh.json`
- Modify: `tests/SmokeReactRenderer.js`

- [ ] **Step 1: locale/zh.json 的 `ai` 段补正式 key**

在 `locale/zh.json` 的 `"ai": { ... }` 段内（`"truncated"` 之后）追加（保持 JSON 逗号正确；这些 key 是 Task 5-13 组件 `t()` 的正式文案，组件测试里的内联字典不受影响）：

```json
    "modeChat": "对话",
    "modeReport": "报告",
    "modeResearch": "研究",
    "reportPlaceholder": "报告生成将在「AI 工作台 · Phase 6 报告计划」中启用",
    "researchPlaceholder": "研究模式将在「AI 工作台 · Phase 6 研究计划」中启用",
    "messagesRegion": "对话消息",
    "noMessages": "会话暂无消息，向 AI 提问开始对话",
    "copy": "复制",
    "quote": "引用",
    "editResend": "编辑重发",
    "editMessage": "编辑消息",
    "resend": "重发",
    "cancelEdit": "取消",
    "fork": "从此处分支",
    "regenerate": "重新生成",
    "backToLatest": "↓ 回到最新",
    "searchSessions": "搜索对话…",
    "pin": "置顶",
    "unpin": "取消置顶",
    "rename": "重命名",
    "renameSession": "重命名会话",
    "deleteConfirm": "确认删除？",
    "attach": "添加附件",
    "inputBox": "消息输入",
    "attachmentTooLarge": "附件超过 200KB 上限",
    "attachmentReadFailed": "附件读取失败",
    "removeAttachment": "移除附件",
    "retrySend": "重试",
    "streamError": "请求失败",
    "contextStrip": "AI 上下文",
    "removeContext": "清除上下文"
```

- [ ] **Step 2: SmokeReactRenderer.js 补 AI 通道 mock 与探针**

`tests/SmokeReactRenderer.js` —— 非 chart 分支（`} else {` 内、`registerEnvelope('chart:compute', ...)` 之后）追加会话通道 mock（AiWorkspace 挂载即调用；未 mock 会让 invoke reject 变成页面 unhandledrejection 而 fail smoke）：

```js
    const smokeSession = { id: 'smoke-ai-session', title: '烟测会话', messages: [], mode: 'chat', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    registerEnvelope('ai:sessions:list', () => [smokeSession]);
    registerEnvelope('ai:sessions:create', () => ({ ...smokeSession, id: `smoke-ai-session-${Date.now()}` }));
```

在 `const desktop = await poll(win, 'desktop shell', ...)` 成功之后、「profile search」之前插入 AI 工作台探针（assert 后加入最终报告对象）：

```js
    const aiWorkspace = await poll(win, 'ai workspace renders', () => {
      const workspace = document.querySelector('.ai-workspace');
      const tabs = Array.from(document.querySelectorAll('.ai-workspace__mode-tab, [role="tab"]'));
      const chatTab = tabs.find((tab) => tab.textContent?.includes('对话'));
      const reportTab = tabs.find((tab) => tab.textContent?.includes('报告'));
      const composerInput = document.querySelector('.composer__input');
      const rail = document.querySelector('.session-rail');
      return { ready: Boolean(workspace && chatTab && reportTab && composerInput && rail), value: {
        tabs: tabs.length, hasChatTab: Boolean(chatTab), hasRail: Boolean(rail),
      } };
    });
    await win.webContents.executeJavaScript(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      tabs.find((tab) => tab.textContent.includes('报告')).click();
    })()`);
    const reportPlaceholder = await poll(win, 'report mode placeholder', () => ({
      ready: document.querySelector('.ai-workspace__placeholder')?.textContent.includes('报告'),
      value: true,
    }));
    await win.webContents.executeJavaScript(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      tabs.find((tab) => tab.textContent.includes('对话')).click();
    })()`);
    await poll(win, 'back to chat mode', () => ({ ready: Boolean(document.querySelector('.composer__input')) }));
```

并把 `aiWorkspace`、`reportPlaceholder` 加进最终 `console.log('\nReact smoke report:', JSON.stringify({ desktop, ..., aiWorkspace, reportPlaceholder, ... }))` 的报告对象。

- [ ] **Step 3: 渲染层全量验证**

```bash
npm run test:renderer
npm run typecheck
npm run test:security
npm run test:preload
```

Expected: vitest 全绿（0 fail；**已知基线**：`styles` 相关字体清单测试若报 35≠36 属预存失败，报告里注明即可）；typecheck 0 error；security/preload 全绿。

- [ ] **Step 4: build + smoke**

```bash
npm run build:renderer
git checkout -- src/renderer-react/assets/fonts
npm run smoke:react
git checkout -- src/renderer-react/assets/fonts
```

Expected: 构建成功（字体 churn 已还原）；smoke:react 输出 `React smoke passed`（AI 工作台探针通过；报告/研究占位渲染）。**注意**：smoke 需要 swisseph 处于 Electron ABI——确认上一任务遗留状态为 Electron ABI（`Test-Path node_modules\swisseph-v2\build\Release\swisseph.node` 为 True 即可，smoke 不依赖 Node ABI）。

- [ ] **Step 5: 主进程全量回归（双 ABI 流程）**

```bash
$env:NODEJS_ORG_MIRROR='https://npmmirror.com/mirrors/node/'
npx -y node-gyp@latest rebuild --directory=node_modules/swisseph-v2
npm test
npm run rebuild:electron
Test-Path node_modules\swisseph-v2\build\Release\swisseph.node
```

Expected: `npm test` = RunAll 全绿（92 通过基线 + Task 1 新增 2 个 AiSessionStore 测试 = 94；node 套件 203 = 201 基线 + 2）；翻转回 Electron ABI 后 Test-Path 返回 True。（用 `node -e "try{require('./node_modules/swisseph-v2')}catch(e){console.log(e.message.split('\n')[2])}"` 确认报 NODE_MODULE_VERSION 146 即 Electron ABI。）

- [ ] **Step 6: 提交 + 终态检查**

```bash
git add locale/zh.json tests/SmokeReactRenderer.js
git status --short
git commit -m "feat(ai): locale entries and smoke probes for the chat workspace"
git log --oneline -14
```

Expected: 工作区干净（无字体/`test-output.txt`/快照杂物）；14 个任务提交齐整。

---

## 验证矩阵（执行完 14 个任务后必须全部满足）

| 验证项 | 命令 | 期望 |
|---|---|---|
| 渲染层单测 | `npm run test:renderer` | 0 fail（字体清单基线失败除外，注明） |
| 类型 | `npm run typecheck` | 0 error |
| 安全 | `npm run test:security` | 全绿 |
| Preload | `npm run test:preload` | 全绿 |
| 构建 | `npm run build:renderer` | 成功；字体 churn 还原 |
| 冒烟 | `npm run smoke:react` | `React smoke passed`，AI 探针通过 |
| 主进程 | `npm test`（Node ABI） | RunAll 94 / node 套件 203 全绿 |
| ABI 终态 | `npm run rebuild:electron` + Test-Path | True（Electron ABI，`npm start` 可用） |
| 工作区 | `git status --short` | 干净 |
| 分支 | `git log --oneline feat/ai-provider-catalog..HEAD` | A1 3 + 计划文档 1 + A2 14 提交 |

## Spec 覆盖对照（§4 ChatMode 全量 → 任务）

| Spec 要求 | 任务 |
|---|---|
| 流式 markdown（GFM） | T3（MarkdownMessage）+ T2（store） |
| 滚动暂停 + 回到最新（40px 阈值） | T6（MessageList） |
| 复制 / 引用 | T5（MessageItem）+ T9（ChatMode） |
| 编辑重发（末条原地 / 非末条派生） | T1（replaceFrom+resend）+ T9 |
| 分支（派生会话） | T1/A1 fork + T9 |
| 重新生成（清末条 assistant 重发） | T1 + T9 |
| 停止 / 错误重试 | T2（store）+ T6 + T9 |
| truncated 独立提示（Phase 1 文案 key） | T2 + T6 |
| 上下文条（可移除） | T8（ContextStrip） |
| 输入区（自动生长/Enter/状态芯片/📎附件内联引用块） | T7 |
| 会话管理（搜索/置顶/重命名/删除/标题/fork 指示） | T10（SessionRail，标题生成沿用主进程 `_maybeAutoTitle`） |
| AI 解读（React 工作台头部按钮 → 对话模式流式） | T12（面板信号）+ T13（按钮） |
| 报告/研究占位（Plan B/C 实装） | T11 |
| 状态归属（Query=会话数据 / Zustand=流式+滚动 / 草稿本地） | T2/T9/T10 + 组件本地 state |

