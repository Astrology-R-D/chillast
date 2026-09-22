# AI 工作台 A1 · 主进程基建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ChatMode UI（A2）备齐主进程能力：会话存储升级（置顶/分支/模式标记）、三组新 IPC（fork/置点/文本附件）、chat 流工具事件富化（参数摘要+结果摘录）。

**Architecture:** 全部主进程侧，渲染层零改动（d.ts 类型补充除外）。AiSessionStore 保持线性消息数组，仅加会话级字段与两个方法；工具事件在 AiService.chat 的 updates 分支内富化，协议向后兼容（老字段不变，仅新增）。

**Tech Stack:** CommonJS 主进程、node:test、既有 IPC `_handle` 信封与安全校验。

**Spec:** `docs/superpowers/specs/2026-09-22-ai-workspace-react-design.md` §2（A2 分支模型）、§3.1–§3.2

**前置:** 分支 `feat/ai-workspace`（自 `feat/ai-provider-catalog` 切出）；node_modules 就绪；swisseph 双 ABI 翻转流程见 `docs/native-modules-build.md`（本计划纯 JS，无需翻 ABI，`npm test` 需 Node ABI）。

---

### Task 1: AiSessionStore 升级（TDD）

**Files:**
- Modify: `src/main/AiSessionStore.js`
- Test: `tests/AiSessionStore.test.js`（新文件）

- [ ] **Step 1: 写失败测试**

`tests/AiSessionStore.test.js`：

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const AiSessionStore = require('../src/main/AiSessionStore');

function newStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sessions-'));
  return { store: new AiSessionStore(dir).init(), dir };
}

test('create seeds the base shape; list sorts pinned first then updatedAt desc', () => {
  const { store } = newStore();
  const a = store.create();
  const b = store.create();
  store.setTitle(a.id, 'A');
  store.setTitle(b.id, 'B');
  assert.equal(store.list()[0].id, b.id, 'newest first by default');
  store.setPinned(a.id, true);
  assert.equal(store.list()[0].id, a.id, 'pinned jumps the queue');
  assert.equal(store.list()[1].id, b.id);
  assert.equal(store.get(a.id).pinned, true);
  store.setPinned(a.id, false);
  assert.equal(store.list()[0].id, b.id);
});

test('fork copies the message prefix, links the source, and inherits mode', () => {
  const { store } = newStore();
  const src = store.create();
  store.appendMessage(src.id, { role: 'user', content: '第一条' });
  store.appendMessage(src.id, { role: 'ai', content: '回复一' });
  store.appendMessage(src.id, { role: 'user', content: '第二条' });
  store.setTitle(src.id, '原会话');

  // 消息在存储中无 id，用下标定位分支点（渲染层知道它渲染的下标）
  const fork = store.fork(src.id, 2);
  assert.notEqual(fork.id, src.id);
  assert.equal(fork.messages.length, 3, 'copies messages up to AND including the fork point');
  assert.equal(fork.messages[2].content, '第二条');
  assert.deepEqual(fork.forkedFrom, { sessionId: src.id, messageIndex: 2 });
  assert.ok(fork.title.includes('分支自'), `title mentions source: ${fork.title}`);
  assert.equal(fork.pinned, false);
  assert.equal(fork.mode, src.mode);
  assert.equal(store.get(src.id).messages.length, 3, 'source untouched');
  // 原会话标题不变
  assert.equal(store.get(src.id).title, '原会话');
});

test('fork rejects out-of-range indexes and missing sessions', () => {
  const { store } = newStore();
  const src = store.create();
  store.appendMessage(src.id, { role: 'user', content: 'x' });
  assert.equal(store.fork(src.id, 5), null);
  assert.equal(store.fork(src.id, -1), null);
  assert.equal(store.fork('no-such-session', 0), null);
});

test('mode field round-trips through create/append/persist', () => {
  const { store } = newStore();
  const s = store.create();
  assert.equal(s.mode, 'chat'); // 默认 chat；老数据无 mode 视为 chat
  const reloaded = new AiSessionStore(path.dirname(store.filePath)).init();
  // 老会话文件（无 mode）仍可读取
  assert.ok(Array.isArray(reloaded.list()));
});
```

- [ ] **Step 2: 确认失败**

```bash
node --test tests/AiSessionStore.test.js
```

Expected: FAIL —— `store.setPinned is not a function` / `store.fork is not a function`

- [ ] **Step 3: 实现升级**

`src/main/AiSessionStore.js`——`create()` 的 session 对象补两个字段，并在 `delete(id)` 前插入两个方法：

```js
// create() 内的 session 初始化改为：
    const session = {
      id: String(Date.now()),
      messages: [],
      mode: 'chat',
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
```

```js
  /**
   * Fork a session: copy messages up to AND including messages[messageIndex]
   * into a new linked session (design spec §2, model A2 —— 分支即派生会话;
   * 消息无 id，用下标定位). The source session is never modified.
   */
  fork(sessionId, messageIndex) {
    const sessions = this._readAll();
    const source = sessions.find((s) => s.id === sessionId);
    if (!source) return null;
    const index = Number(messageIndex);
    if (!Number.isInteger(index) || index < 0 || index >= source.messages.length) return null;
    const label = source.title
      || (source.messages.find((m) => m.role === 'user') || {}).content
      || '';
    const fork = {
      id: String(Date.now()),
      messages: source.messages.slice(0, index + 1).map((m) => ({ ...m })),
      mode: source.mode || 'chat',
      pinned: false,
      forkedFrom: { sessionId, messageIndex: index },
      title: `↩ 分支自 ${String(label).slice(0, 24)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessions.push(fork);
    this._writeAll(sessions);
    return fork;
  }

  /** Pin/unpin without touching updatedAt (ordering uses pinned + updatedAt). */
  setPinned(id, pinned) {
    const sessions = this._readAll();
    const session = sessions.find((s) => s.id === id);
    if (!session) return null;
    session.pinned = !!pinned;
    this._writeAll(sessions);
    return session;
  }
```

`list()` 排序改为置顶优先：

```js
  list() {
    return this._readAll().sort((a, b) => {
      const pinDelta = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return pinDelta || (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }
```

- [ ] **Step 4: 确认通过**

```bash
node --test tests/AiSessionStore.test.js
```

Expected: PASS（4 test）

- [ ] **Step 5: Commit**

```bash
git add src/main/AiSessionStore.js tests/AiSessionStore.test.js
git commit -m "feat(ai): session store gains pinned/forkedFrom/mode and fork/setPinned"
```

---

### Task 2: IPC 三组 + preload + d.ts

**Files:**
- Modify: `src/main/IpcRouter.js`
- Modify: `src/preload/Preload.js`
- Modify: `src/renderer-react/types/myst-api.d.ts`

- [ ] **Step 1: IpcRouter 三个 handler**

在 `ai:sessions:generateTitle` handler 之后插入：

```js
      this._handle('ai:sessions:fork', (_e, sessionId, messageIndex) => {
        if (!this.aiSessionStore) throw new Error('会话存储未初始化');
        const forked = this.aiSessionStore.fork(sessionId, messageIndex);
        if (!forked) throw new Error('未找到要分支的会话或消息');
        if (this.webContents) this.webContents.send('ai:sessionsChanged');
        return forked;
      });
      this._handle('ai:sessions:setPinned', (_e, sessionId, pinned) => {
        if (!this.aiSessionStore) throw new Error('会话存储未初始化');
        const updated = this.aiSessionStore.setPinned(sessionId, !!pinned);
        if (!updated) throw new Error('未找到会话');
        if (this.webContents) this.webContents.send('ai:sessionsChanged');
        return updated;
      });
      this._handle('ai:readTextAttachment', (_e, filePath) => {
        const fs = require('fs');
        const path = require('path');
        const MAX_BYTES = 200 * 1024;
        const stat = fs.statSync(String(filePath));
        if (!stat.isFile()) throw new Error('附件不是文件');
        if (stat.size > MAX_BYTES) throw new Error('附件超过 200KB 上限');
        const content = fs.readFileSync(String(filePath), 'utf-8');
        return { name: path.basename(String(filePath)), content };
      });
```

- [ ] **Step 2: preload 桥接**

`sessions` 对象内（`generateTitle` 之后）追加：

```js
      fork: (sessionId, messageIndex) => invoke('ai:sessions:fork', sessionId, messageIndex),
      setPinned: (sessionId, pinned) => invoke('ai:sessions:setPinned', sessionId, pinned),
```

`ai` 对象内（`knowledge` 之前）追加：

```js
    readTextAttachment: (filePath) => invoke('ai:readTextAttachment', filePath),
```

- [ ] **Step 3: d.ts 类型**

`myst-api.d.ts` 的 `MystAiApi`：`sessions` 接口补：

```ts
      fork(sessionId: string, messageIndex: number): Promise<IpcResult<AiSessionSummary>>;
      setPinned(sessionId: string, pinned: boolean): Promise<IpcResult<AiSessionSummary>>;
```

（`AiSessionSummary` 若缺 `pinned?/forkedFrom?/mode?` 字段，在 `contracts.ts` 中补可选字段：
`pinned?: boolean; forkedFrom?: { sessionId: string; messageIndex: number }; mode?: 'chat' | 'research';`）
`MystAiApi` 顶层补：

```ts
    readTextAttachment(filePath: string): Promise<IpcResult<{ name: string; content: string }>>;
```

- [ ] **Step 4: 回归**

```bash
npm run test:security
npm run test:preload
npm run typecheck
```

Expected: 全绿（52 / 7 / typecheck 通过）。

- [ ] **Step 5: Commit**

```bash
git add src/main/IpcRouter.js src/preload/Preload.js src/renderer-react/types/myst-api.d.ts src/renderer-react/api/contracts.ts
git commit -m "feat(ai): fork/pin/readTextAttachment IPC for the workspace"
```

---

### Task 3: chat 流工具事件富化

**Files:**
- Modify: `src/core/ai/AiService.js`
- Test: `tests/AiService.test.js`（扩展 runAiTests）

- [ ] **Step 1: 追加失败测试**

`tests/AiService.test.js` 的 `runAiTests` 末尾追加：

```js
  testFn('chat tool-call events carry args digest and result excerpt', async () => {
    const AiService = require('../src/core/ai/AiService');
    const fakeEsm = {
      load: async (pkg) => {
        if (pkg === '@langchain/langgraph/prebuilt') {
          return {
            createReactAgent: () => ({
              async *stream() {
                yield ['updates', {
                  agent: {
                    messages: [
                      { getType: () => 'ai', tool_calls: [{ name: 'search_knowledge', args: { query: '火星落宫' } }] },
                    ],
                  },
                }];
                yield ['updates', {
                  tools: {
                    messages: [
                      { getType: () => 'tool', name: 'search_knowledge', content: '《行星落宫详解》：火星落第4宫……（长文）' },
                    ],
                  },
                }];
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
    const calling = events.find((e) => e.type === 'tool-call' && e.data.status === 'calling');
    const done = events.find((e) => e.type === 'tool-call' && e.data.status === 'done');
    assert.ok(calling, 'calling event exists');
    assert.equal(calling.data.tool, 'search_knowledge');
    assert.ok(calling.data.argsDigest.includes('火星落宫'), 'args digest carries the query');
    assert.equal(calling.data.requiresConfirmation, false, 'reserved field present, always false today');
    assert.ok(done, 'done event exists');
    assert.ok(done.data.resultExcerpt.includes('火星落第4宫'), 'result excerpt carries content');
    assert.ok(done.data.resultExcerpt.length <= 200, 'excerpt capped');
  });
```

- [ ] **Step 2: 确认失败**

用与 provider 计划 Task 5 相同的 harness 适配器执行（async testFn 包装）：

```bash
node -e "const {runAiTests}=require('./tests/AiService.test.js'); const t=(n,f)=>Promise.resolve(f()).then(()=>console.log('ok',n)).catch(e=>{console.error('FAIL',n,e.message);process.exitCode=1}); runAiTests(t);"
```

Expected: 新测试 FAIL —— `calling.data.argsDigest` 为 undefined（其余既有测试 ok）。

- [ ] **Step 3: 实现**

`src/core/ai/AiService.js` 的 `chat()` updates 分支替换为：

```js
          } else if (mode === 'updates') {
            // payload = { nodeName: { messages: [...] } }; surface tool activity.
            for (const node of Object.keys(payload || {})) {
              const msgs = (payload[node] && payload[node].messages) || [];
              for (const m of msgs) {
                const t = this._msgType(m);
                if (t === 'ai' && m.tool_calls && m.tool_calls.length) {
                  for (const tc of m.tool_calls) {
                    yield { type: 'tool-call', data: {
                      tool: tc.name, status: 'calling',
                      argsDigest: this._digestArgs(tc.args),
                      resultExcerpt: '',
                      requiresConfirmation: false,
                    } };
                  }
                } else if (t === 'tool') {
                  yield { type: 'tool-call', data: {
                    tool: m.name, status: 'done',
                    argsDigest: '',
                    resultExcerpt: this._excerpt(m.content),
                    requiresConfirmation: false,
                  } };
                }
              }
            }
          }
```

`_finishReason` 旁新增两个帮助方法：

```js
  /** Compact one-line digest of tool arguments (capped for the UI strip). */
  _digestArgs(args) {
    try {
      const s = typeof args === 'string' ? args : JSON.stringify(args || {});
      const flat = s.replace(/\s+/g, ' ').trim();
      return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
    } catch (_) { return ''; }
  }

  /** Result excerpt for the expandable tool row (capped at ~200 chars). */
  _excerpt(content) {
    const text = this._extractText(content).replace(/\s+/g, ' ').trim();
    return text.length > 200 ? `${text.slice(0, 197)}…` : text;
  }
```

- [ ] **Step 4: 全量回归**

```bash
npm test
```

Expected: RunAll 91 + node 套件 +1（新测试）全绿；`npm run test:preload` 不受影响（事件协议向后兼容：老 AiSidebar 只读 `tool/status`，新增字段无害）。

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/AiService.js tests/AiService.test.js
git commit -m "feat(ai): enrich chat tool-call events with arg digests and result excerpts"
```

---

### Task 4: A1 全量验证

- [ ] **Step 1:**

```bash
npm test
npm run test:security
npm run test:preload
npm run typecheck
```

Expected: 全绿（typecheck 需 contracts.ts 可选字段补齐后通过）。

- [ ] **Step 2: 工作区干净**

```bash
git status --short
git log --oneline -4
```

Expected: 3 个 feat 提交 + 干净工作区（字体/snapshot 噪音若出现，`git checkout --` 还原）。
