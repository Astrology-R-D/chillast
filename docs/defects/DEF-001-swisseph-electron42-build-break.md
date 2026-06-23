# DEF-001 · swisseph 原生模块无法在 Electron 42 下编译

| 字段 | 内容 |
|------|------|
| **缺陷编号** | DEF-001 |
| **状态** | 🟢 RESOLVED（2026-06-23） |
| **严重级别** | 高 — 阻断 Swiss Ephemeris 星盘计算后端 |
| **发现日期** | 2026-06-21 |
| **解决日期** | 2026-06-23 |
| **影响分支** | `feat/ai-base`（及所有使用 Electron 42 的分支） |
| **影响范围** | 精密星盘计算（swisseph 后端）、`npm test` |
| **不影响** | AI 对话 / LangChain 链路（不依赖 swisseph） |

> **结论先行（2026-06-23）**：swisseph-v2 **可以**在 Electron 42 下编译并正确计算，原"无法编译（C2660）"
> 诊断在当前 pristine `nan@2.27.0` 上**不复现**。完整修复机制、ABI 说明与构建/打包指南见
> **[`docs/native-modules-build.md`](../native-modules-build.md)**。下文保留原始诊断以备查，末尾附解决记录。

## 现象

1. `npm test` 启动即崩溃：
   ```
   Error: Cannot find module 'node_modules/swisseph-v2/lib/../build/Release/swisseph.node'
   ```
   `RunAll.js` → `SwissEphCore.js` → `SwissEphConstants.js` → `swisseph-v2` 在加载阶段即失败。
2. `build/Release/` 下只有静态库 `swissephz.lib` 与 `obj/`，**没有最终链接产物 `swisseph.node`**；`obj/.../swisseph.tlog/unsuccessfulbuild` 标记构建失败。
3. 也没有 `prebuilds/` 预编译回退。

## 根因

调用链：`swisseph-v2@1.1.0` → `nan@2.27.0` → 无法对 **Electron 42.4.1** 的 V8 头文件编译。

Electron 42 的 V8 把 `v8::External::New` 的第三个参数 `tag` 改为**强制必填**（无默认值）：

```cpp
// .electron-gyp/42.4.1/include/node/v8-external.h
static Local<External> New(Isolate* isolate, void* value, ExternalPointerTypeTag tag);
```

而 `nan` 仍以 2 个参数调用，MSVC 报：

```
nan/nan_implementation_12_inl.h(79): error C2660:
  "v8::External::New": 函数不接受 2 个参数
```

关键点：
- 安装的 `nan` 2.27.0 **已是 registry 最新版**，"升级 nan" 无法解决。
- 这是 `nan` 与新版 V8 的通用不兼容，**任何基于 nan 的原生模块在 Electron 42 上都无法编译**，并非 swisseph 独有。

## 复现

```bash
npm run rebuild        # electron-rebuild -f -w swisseph-v2  → Rebuild Failed (C2660)
npm test               # MODULE_NOT_FOUND: swisseph.node
```

环境：Windows 11、Node v22.18.0、Electron 42.4.1、MSVC 2022、nan 2.27.0。

## 受影响文件（swisseph API 调用面，约 22 处，已隔离在适配层后）

- `src/core/astrology/ephemeris/SwissEphCore.js`
- `src/core/astrology/ephemeris/SwissEphConstants.js`
- `src/core/astrology/ChartStrategyFactory.js`（经工厂选择后端）
- `src/main/Main.js`（启动时 `SwissEphCore.configure` / `close`）

## 候选修复方案

| 方案 | 工作量 | 持久性 |
|------|--------|--------|
| **A. 降级 Electron** 到 V8 仍兼容 nan 2.27 的版本 | ~1 行 + 重装 + `npm run rebuild` | 脆弱 — 每次升级 Electron 可能复发 |
| **B. 迁移到 N-API 的 `sweph`**（ABI 稳定绑定） | 重写 SwissEphCore.js / SwissEphConstants.js 约 22 处调用 | 持久 — 永久免疫 V8/Electron 升级 |
| **C. patch-package 修补 nan** | 多处、易碎 | 不推荐 |

## 决议

2026-06-21：用户确认根因后选择**暂缓修复**，优先推进 AI / Markdown 功能。修复时再二选一（建议 B 作长期方案，A 作快速解封）。

## 解决（2026-06-23）

复核后发现：当前 registry 的 **pristine `nan@2.27.0`（无 patch、无 vendoring）本身已带修复**——其
`nan_implementation_12_inl.h` 调用 `v8::External::New` 时已传入第三参数 `v8::kExternalPointerTypeTagDefault`，
因此 §"根因"里描述的 `C2660`（2 参数调用）**不复现**。原"构建失败 / `.node` 缺失"的本质是
**从未为 Electron ABI 成功产出 `swisseph.node`**，而非 nan 不可编译。

修复（无需迁移 `sweph`，方案 A/B 都不必）：
1. 为 Electron ABI 重建：`npm run rebuild`（`electron-rebuild -f -w swisseph-v2`）→ `✔ Rebuild Complete`，
   产出 `swisseph.node`（~942 KB，Electron-ABI）。
2. 验证（Electron 内）：J2000.0 太阳黄经 = **280.369°**，正确。
3. 纳入标准流程：新增 `rebuild:node`（测试用 Node ABI）与 `predist`（打包前自动 `electron-rebuild`）；
   打包 `npmRebuild:false` + `asarUnpack` swisseph-v2 + 星历走 `extraResources`。
4. 安装包实测：`app.asar.unpacked` 内含 Electron-ABI 的 `swisseph.node`，`resources/assets/ephemeris`
   内含 `*.se1`，启动无加载报错。

ABI 注意事项与完整打包说明：见 [`docs/native-modules-build.md`](../native-modules-build.md)。
