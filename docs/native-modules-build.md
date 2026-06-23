# 原生模块构建与打包指南 · Native Modules Build & Packaging

> 重大进展（2026-06-23）：**Swiss Ephemeris（`swisseph-v2`）已在 Electron 42 下成功启用**，
> 精密星盘计算后端恢复。本文记录三个原生模块的构建/打包机制、ABI 注意事项，以及 swisseph 的修复始末。
> 对应缺陷记录见 [`docs/defects/DEF-001`](defects/DEF-001-swisseph-electron42-build-break.md)。

---

## 0. TL;DR

| 场景 | 命令 | 说明 |
|------|------|------|
| 跑 app（Electron） | `npm run rebuild` → `npm start` | swisseph 必须按 **Electron ABI** 编译 |
| 跑测试（纯 Node） | `npm run rebuild:node` → `npm test` | swisseph 必须按 **Node ABI** 编译 |
| 打安装包 | `npm run dist` | `predist` 自动 `electron-rebuild`，无需手动 |

一句话：`swisseph-v2` 是 **nan** 模块，编译产物绑定单一运行时 ABI，**切换 Electron / Node 运行环境时要重建**。`hnswlib-node`、`onnxruntime-node` 是 **N-API**，ABI 稳定，**无需逐运行时重建**。

---

## 1. 三个原生模块

| 模块 | 用途 | 绑定方式 | ABI 稳定？ | 是否需逐运行时重建 |
|------|------|----------|------------|--------------------|
| `swisseph-v2` | Swiss Ephemeris 精密天文计算（西方占星后端） | **nan**（依赖具体 V8 ABI） | ❌ 否 | ✅ 需要（Electron / Node 各编一次） |
| `hnswlib-node` | HNSW 向量索引（RAG 知识库） | **node-addon-api / N-API** | ✅ 是 | ❌ 不需要 |
| `onnxruntime-node` | 本地嵌入模型推理（Transformers.js 后端） | **N-API**（且自带预编译产物） | ✅ 是 | ❌ 不需要 |

**为什么 N-API 不用重建**：N-API 是 Node 与运行时之间的稳定 ABI 边界，同一份 `.node` 在 Node 和 Electron（只要 N-API 版本满足）都能加载。**nan 则直接对接 V8 头文件**，V8 版本一变就要重编。

---

## 2. swisseph 修复始末（重大进展）

### 2.1 曾经的"现象"
- `npm test` 启动即崩：`Cannot find module '.../build/Release/swisseph.node'`。
- `build/Release/` 下只有中间产物，**没有最终 `swisseph.node`**。
- DEF-001 当时诊断为：`nan@2.27.0` 以 2 参数调用 `v8::External::New`，而 Electron 42 的 V8 把第三参数 `tag` 改为强制必填，MSVC 报 `C2660`，判定为"nan 与新 V8 通用不兼容、暂缓修复"。

### 2.2 真实根因（2026-06-23 复核）
经实测，**当前 registry 的 `nan@2.27.0`（无任何 patch、无 vendoring）本身就已修复该问题**——其 `nan_implementation_12_inl.h` 调用 `External::New` 时已传入第三参数：

```cpp
// node_modules/nan/nan_implementation_12_inl.h:78
Factory<v8::External>::New(void * value) {
  return v8::External::New(v8::Isolate::GetCurrent(), value,
                           v8::kExternalPointerTypeTagDefault);   // ← 已带 tag
}
```

也就是说，DEF-001 描述的 `C2660`（2 参数调用）在**当前安装的 pristine nan 2.27.0 上根本不复现**。当时之所以"构建失败 / `.node` 缺失"，本质是 **构建从未为 Electron ABI 成功产出 `.node`**（环境/缓存/未执行 electron-rebuild 等），而非 nan 不可编译。

### 2.3 修复
1. **为 Electron ABI 重建**：
   ```bash
   npm run rebuild        # electron-rebuild -f -w swisseph-v2
   ```
   结果：`✔ Rebuild Complete`，产出 `node_modules/swisseph-v2/build/Release/swisseph.node`（约 942 KB，Electron-ABI）。
2. **验证计算正确**（在 Electron 内）：J2000.0（儒略日 2451545.0）太阳黄经 = **280.369°**（摩羯座初度，正确）。
3. 打包配置见 §4。

### 2.4 结论
swisseph 后端**没有坏**，只是**没为 Electron 重建**。N-API 时代下，唯一需要"逐运行时重建"的就是这个 nan 模块——把它纳入标准构建流程即可（见 §3）。

---

## 3. 开发 / 测试工作流（ABI 切换）

`swisseph.node` 同一时刻只能服务一种运行时。`package.json` 提供两个脚本：

```jsonc
"rebuild":      "electron-rebuild -f -w swisseph-v2",  // → Electron ABI（跑 app / 打包用）
"rebuild:node": "npm rebuild swisseph-v2",             // → Node ABI（跑 npm test 用）
"predist":      "electron-rebuild -f -w swisseph-v2"   // dist 前自动重建为 Electron
```

- **要 `npm start` / `npm run dist`** → 先 `npm run rebuild`（dist 已通过 `predist` 自动执行）。
- **要 `npm test`**（RunAll 在纯 Node 跑，会 `require` swisseph） → 先 `npm run rebuild:node`。
- 忘了切：app 会报 `NODE_MODULE_VERSION` 不匹配 / 加载失败；测试会 `MODULE_NOT_FOUND` 或版本不匹配。

> 注：`hnswlib-node`、`onnxruntime-node` 不受影响，N-API 一次编译两端通用。

---

## 4. 打包（electron-builder）

关键配置（`package.json` 的 `build` 段）：

```jsonc
"npmRebuild": false,            // 不让 electron-builder 自动重建（避免它去重建 onnxruntime 的预编译件而失败）
"asarUnpack": [
  "src/core/ai/EmbeddingWorker.js",
  "node_modules/onnxruntime-node/**",
  "node_modules/@huggingface/transformers/**",
  "node_modules/hnswlib-node/**",
  "node_modules/swisseph-v2/**"   // 原生 .node 不能从 app.asar 内部加载，必须解包
],
"extraResources": [
  { "from": "assets",                "to": "assets" },         // 含星历 .se1（swisseph 以真实路径读取）
  { "from": "resources/models",      "to": "models" },         // 离线嵌入模型
  { "from": "resources/vector-index","to": "vector-index" }    // 预建向量索引
]
```

要点：
- **`npmRebuild: false` + `predist` 手动重建**：让 swisseph 用我们刚为 Electron 编好的 `.node`，同时不惊动 onnxruntime 的预编译产物。
- **`asarUnpack` swisseph-v2**：`swisseph-v2/lib/swisseph.js` 通过 `require(__dirname + '/../build/Release/swisseph.node')` 加载原生件；解包后 `__dirname` 指向 `app.asar.unpacked/...`，是真实路径，可被 dlopen。
- **星历文件走 `extraResources`**：swisseph 用 C 代码以**文件系统真实路径**读取 `*.se1`（不能读 asar 内），`Main.js` 据此用 `process.resourcesPath/assets/ephemeris`。

打包后核对（已验证）：
```
release/win-unpacked/resources/app.asar.unpacked/node_modules/swisseph-v2/build/Release/swisseph.node  (Electron-ABI)
release/win-unpacked/resources/assets/ephemeris/{seas_18,semo_18,sepl_18}.se1
```
启动安装版无 swisseph 加载报错 = 真正用上了 Swiss Ephemeris（否则会静默回退，见 §5）。

---

## 5. 容错：纯 JS 回退

即使 swisseph 加载失败，应用也不崩——`ChartStrategyFactory` 会回退到纯 JS 的 `HoroscopeAdapter`（`circular-natal-horoscope-js`）：

```js
// SwissephAdapter 加载失败 → SwissephAdapter=null → 用 HoroscopeAdapter
ChartCalculator = backend !== 'horoscope' && SwissephAdapter ? SwissephAdapter : HoroscopeAdapter;
```
区别：JS 引擎可用但精度/覆盖较弱（如凯龙、莉莉丝、真节点、宫位精度等不如 swisseph）。所以"swisseph 正常加载"才是目标态。

---

## 6. 未来：若 Electron 升级后再次编译失败

nan 与 V8 的兼容是历史包袱。若某次升级 Electron 后 `npm run rebuild` 再次报 V8 相关编译错：
- **快速解封**：临时降级 Electron 到兼容版本。
- **持久方案（推荐）**：迁移到 **N-API 绑定 `sweph`**（ABI 稳定，永久免疫 V8 升级）。改造面很小——swisseph 调用已全部隔离在
  `src/core/astrology/ephemeris/SwissEphCore.js` + `SwissEphConstants.js`（约 22 处调用 + 常量映射）。
- 改造期间应用仍可用（§5 的 JS 回退兜底）。

---

## 7. 验证清单

```bash
# Electron 内 swisseph 自检（应打印 SWISSEPH_OK ... sunLon=280.369...）
npm run rebuild
# （临时脚本：require SwissEphCore，计算 J2000 太阳）

# 打包并核对
npm run dist
#  → release/CHILLAST-<ver>-setup.exe
#  → app.asar.unpacked 内含 swisseph.node、resources/assets/ephemeris 内含 *.se1
```
