# tools/ — 占星知识库构建流水线

把 OCR 提取的占星书籍纯文本，**分块清洗 → 按领域拆分**，构建成高质量的 RAG 知识库。

```
tools/raw-knowledge/*.p.txt   ──Stage 1 清洗──▶   tools/cleaned/*.md
                                                      │
                                                      └──Stage 2 拆分──▶  assets/knowledge/builtin/*.md
```

## 为什么分两段

整本书（常达 25 万~35 万字）一次性丢给 LLM，会被**输出 token 上限**截断，模型只能“摘要”，
导致大量信息丢失。本流水线针对性解决：

- **Stage 1（清洗，近无损）**：把每本书按段落切成小块（默认每块 ~4500 字），**每块独立**清洗，
  指令严格要求“逐句保留、只修复 OCR 与排版、禁止概括删减”，再按原序拼接。模型每次只看一小块，
  物理上无法丢内容。结束打印每本书的**保留率**（输出/输入字符）。
- **Stage 2（按领域拆分，无损路由）**：把清洗好的整书按 `##/###` 切成段落单元，用 LLM（带关键词
  兜底）判定每段所属领域（行星落座 / 落宫 / 相位 / 格局 / 逆行 / 行运 / 合盘 / 命理 / 综合），
  按 (书, 领域) 归类写出。只是“搬运”段落、不改写，结束会校验**内容保全率**（应接近 100%）。
  每个输出文件带 `<!-- domain: X -->` 标记，知识库据此精确分类（不再靠标题猜）。

## 用法

```bash
# 一键完成两步（推荐）
node tools/build-knowledge.mjs
node tools/build-knowledge.mjs --force        # 忽略 tools/cleaned 缓存，重新清洗
node tools/build-knowledge.mjs "内在的宇宙"    # 仅处理文件名匹配的书

# 或分步运行
node tools/clean-knowledge.mjs                # Stage 1 → tools/cleaned/
node tools/split-knowledge.mjs                # Stage 2 → assets/knowledge/builtin/
```

完成后删除 `userData/data/vector-index/` 目录以重建向量索引。

## 环境变量

API Key（无法从应用配置读取时）：
```bash
set OPENAI_API_KEY=sk-...      # 或 ANTHROPIC_API_KEY
```

| 变量 | 默认 | 阶段 | 说明 |
|------|------|------|------|
| `CLEAN_CHUNK_CHARS` | 4500 | 1 | 每块原文字符数。调小更稳但调用更多。 |
| `CLEAN_CONCURRENCY` | 4 | 1 | 并发清洗的块数。受供应商速率限制。 |
| `CLEAN_MAX_TOKENS` | 8192 | 1/2 | 单次输出 token 上限。**避免截断的关键。** |
| `CLEAN_TEMPERATURE` | 0.1 | 1/2 | 采样温度，越低越忠实。 |
| `SPLIT_SEG_CHARS` | 3500 | 2 | 分类单元的最大字符数。 |
| `SPLIT_BATCH` | 18 | 2 | 每次 LLM 分类的段落数（只发标题+摘要，便宜）。 |
| `SPLIT_CONCURRENCY` | 3 | 2 | 并发分类批数。 |
| `AI_PROVIDER` / `AI_MODEL` / `AI_BASE_URL` | 取应用配置 | — | 覆盖供应商/模型/端点。 |

## 健壮性

- **断点续跑**：Stage 1 已清洗过的书会自动跳过（`--force` 强制重清）。
- **重试**：每次 LLM 调用失败自动重试（线性退避），清洗块彻底失败时**保留原文**而非丢弃。
- **自检**：Stage 1 报告保留率，Stage 2 报告内容保全率与各领域段落数，低于阈值会标 ⚠。
- **产物清单**：Stage 2 在 `assets/knowledge/builtin/_manifest.json` 写出每本书的拆分明细。

> 说明：清洗一本大书会产生几十次 LLM 调用（chunk 数），这是无损清洗的必要代价。
> 嫌慢调大并发，担心截断调小 `CLEAN_CHUNK_CHARS`。

## 发布：预置模型 + 预建索引（开箱即用·离线）

让安装包自带嵌入模型和向量索引，用户装好即用、零下载、零构建：

```bash
node tools/split-knowledge.mjs       # 1. 确保 assets/knowledge/builtin/ 已是最终知识
npm run build:index                  # 2. 下模型到 resources/models/，建索引到 resources/vector-index/
#   HF_ENDPOINT=https://hf-mirror.com npm run build:index   # 国内走镜像
npm run dist                         # 3. electron-builder 把上面两者打进安装包
```

打包后运行时（`package.json` build 段已配好）：
- `extraResources` 把 `resources/models`、`resources/vector-index` 放到安装目录的 `resources/`；
- `asarUnpack` 解出 worker 与原生件（onnxruntime-node / @huggingface/transformers / hnswlib-node）；
- 首次启动：[Main.js](../src/main/Main.js) 把自带索引拷到 userData、并让嵌入用自带模型 `offline` 加载 → 秒开、离线。

注意：模型与索引是**一对**（同模型同维度）。换知识库或换模型后，重跑 `npm run build:index` 重新生成。`resources/` 已被 gitignore（按需生成，不入库）。

## 旧版 ReAct Agent（已弃用）

`agent/prompt.mjs` 与 `agent/tools.mjs` 是早期基于 LangGraph ReAct 的实现，会让模型一次吞下整本书
而丢失信息，**已不再被任何脚本使用**，仅作参考保留。当前实现见 `agent/pipeline.mjs`（清洗）与
`agent/classify.mjs`（拆分），共用 `agent/util.mjs`。
