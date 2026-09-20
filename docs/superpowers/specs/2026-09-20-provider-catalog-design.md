# Provider 目录化与输出上限修复设计 · Provider Catalog Design

> 日期：2026-09-20
> 状态：待 review
> 前置调查：RAG 输出中途截断问题（根因：全局 `maxTokens: 4096` 静默截断 + 全管线无 `finish_reason` 检查）

## 0. 背景与动机

2026-09-20 调查确认了两个长期存在的问题：

1. **RAG 输出静默截断**：`ModelProvider` 硬编码 `maxTokens ?? 4096`，模型撞输出上限时 API 以
   `finish_reason=length` 正常结束流，LangChain 不抛错，全代码库无任何环节检查
   `finish_reason`——UI 只当"正常完成"，用户看到解读断在半句且无任何提示。RAG 注入的参考
   知识（6×1000 字符）让答案更长，撞上限更频繁。
2. **PROVIDER_MAP 过时**：2026-06-20 初版一次性写死的默认模型（`moonshot-v1-8k`、`glm-4`、
   `gpt-4o` 等）已被各家淘汰或标记 deprecated；设置页 maxTokens 滑条上限 8192 是当时
   "所有内置 provider 都不炸"的最大公约数，与当前模型真实输出上限（普遍 128k+）严重脱节。

参考对象：**opencode**（sst/opencode）。其 provider 体系不硬编码任何模型清单，以社区维护的
**models.dev 目录**（222 家 provider，每个模型带 `limit:{context,output}`、`cost`、`status`、
`release_date`、能力位）为唯一事实来源，用户配置深合并于其上。目录中已确认：

- 国产厂商（deepseek / moonshotai / zhipuai / alibaba / volcengine / siliconflow / stepfun）
  **标注 `npm: openai-compatible`**——统一走 OpenAI 兼容协议，映射到本项目的
  `ChatOpenAI + baseURL` 即可，零新依赖。**例外**：`minimax-cn` 为 Anthropic 协议端点
  （`api.minimax.cn/anthropic/v1`，目录标注 `@ai-sdk/anthropic`，2026-09-20 实测），
  映射到 `ChatAnthropic + baseURL`。
- `status: deprecated` 的模型（含本项目现用的 `gpt-4o-2024-05-13`、`moonshot-v1-8k` 一代）已被
  社区标记淘汰。
- 目录不含本地 `ollama`（仅 ollama-cloud），本地推理需保留现有手动配置。

## 1. 目标与非目标

**目标**

1. 模型清单、输出上限、价格、上下文窗口来自 models.dev 目录，新模型上线**不再需要改代码**。
2. maxTokens 控件模型感知（滑条 + 数字输入联动）：默认值 = 所选模型真实输出上限，
   上限 = 真实上限，用户可往下调（成本控制），也可直接键入精确数值。
3. 修复静默截断：`finish_reason=length` 时 UI 明确提示。
4. 白名单新增主流国产/国际 provider（minimax、火山方舟、硅基流动、阶跃星辰、OpenRouter）。
5. 退役 `@langchain/community` 中的 ChatMoonshot / ChatZhipuAI / ChatAlibabaTongyi 专用适配类。

**非目标**

- 不接入目录全部 222 家 provider（用户已决策：精选白名单 + 自定义兼容端点兜底）。
- 不引入 opencode 式用户自定义 provider 定义语言（YAGNI）。
- 不改动 embeddings 体系（本地 Transformers.js，独立于 chat provider）。
- 不做自动续写（检测到截断后自动发"继续"请求拼接）——仅提示。

## 2. 架构总览

```
models.dev 社区目录 (api.json, ~4.7MB, 222 家)
      │ scripts/fetch-catalog.mjs（开发/打包前手动执行）
      ▼ 投影白名单 provider + 精简字段 → ~200-400KB
assets/catalog-snapshot.json（随应用打包，离线兜底）
      │ 启动加载
      ▼
CatalogService (src/core/ai/CatalogService.js，main 进程)
  • getProviders() / getModels(providerId) / getModel(providerId, modelId)
  • userData/catalog-cache.json 缓存，TTL 24h，后台异步刷新（失败静默）
      ▲
      │ 查询
ModelProvider.configure()（改造）
  • (providerId, model) → 目录解析 → { LangChain 类, baseURL, 模型输出上限 }
      ▲
      │ maxTokens 解析
AiService.interpret / chat（流）
      │ finish_reason=length 检测
      ▼ yield { type:'truncated' }
IpcRouter → 渲染进程 AiSidebar（⚠️ 提示元素）
```

## 3. Provider 白名单与 LangChain 映射

| 白名单项 | 目录 id | LangChain 类 | 说明 |
|---|---|---|---|
| OpenAI | `openai` | `ChatOpenAI` | 原生，无 baseURL |
| Anthropic | `anthropic` | `ChatAnthropic` | 依赖已安装 |
| DeepSeek | `deepseek` | `ChatOpenAI` + baseURL | |
| 月之暗面 | `moonshotai-cn` | `ChatOpenAI` + baseURL | 国内端点优先 |
| 智谱 AI | `zhipuai` | `ChatOpenAI` + baseURL | |
| 通义千问 | `alibaba-cn` | `ChatOpenAI` + baseURL | |
| Minimax | `minimax-cn` | `ChatAnthropic` + baseURL | 新增；Anthropic 协议端点（目录实测） |
| 火山方舟 | `volcengine` | `ChatOpenAI` + baseURL | 新增 |
| 硅基流动 | `siliconflow` | `ChatOpenAI` + baseURL | 新增（聚合多家） |
| 阶跃星辰 | `stepfun` | `ChatOpenAI` + baseURL | 新增 |
| OpenRouter | `openrouter` | `ChatOpenAI` + baseURL | 新增（聚合国际） |
| Ollama | （不在目录） | `ChatOllama` | 本地推理，保留现状 |
| 自定义兼容端点 | （不在目录） | `ChatOpenAI` + 用户 baseURL | 现有 openai_compat 保留 |

**旧 id 别名兼容**（用户已存的 provider 值无感迁移）：

```
moonshot     → moonshotai-cn
tongyi       → alibaba-cn
zhipuai      → zhipuai（不变）
deepseek     → deepseek（不变）
openai / anthropic / ollama / openai_compat → 不变
```

## 4. CatalogService 设计

**数据投影**（快照与缓存仅保留以下字段）：

```jsonc
{
  "fetchedAt": 1761234567890,  // epoch 毫秒（缓存与快照共用此类型）
  "providers": {
    "deepseek": {
      "name": "DeepSeek", "api": "https://api.deepseek.com",
      "env": ["DEEPSEEK_API_KEY"],
      "models": {
        "deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash",
          "limit": { "context": 1000000, "output": 384000 },
          "cost": { "input": 0.15, "output": 0.6 },
          "status": "active", "release_date": "2026-09-10", "tool_call": true
          // 注：目录中 active 模型的 status 字段缺省（仅 deprecated/alpha 有值），
          // 投影时归一化为 "active"
        }
      }
    }
  }
}
```

补充契约：

- 只投影**输出含文本的聊天模型**（`modalities.output` 缺省视为保留；embedding/图像/音频模型过滤掉，不进设置页模型下拉）。
- 快照写入走 tmp + rename 原子替换，中断不会留下截断文件。

**加载顺序**：userData 缓存 → 缓存缺失/超 24h 时用打包快照 + 后台异步刷新（成功写缓存，
失败静默保留现有数据）。**离线与首次启动永不被网络阻塞。**

**接口**：

- `getProviders()` → 白名单 id 列表（含 UI 显示名、是否需要 key）
- `getModels(providerId)` → 非 deprecated 模型，按 `release_date` 倒序
- `getModel(providerId, modelId)` → 单模型条目（maxTokens 解析用）；目录外返回 null

## 5. ModelProvider 改造

`configure(settings)` 流程：

1. provider id 归一化（别名映射）→ 白名单校验，未知 id 回退 `openai_compat` 语义。
2. 查目录解析 `{ chatCls, baseURL }`：openai → ChatOpenAI 原生；anthropic → ChatAnthropic；
   目录内 openai-compatible 家 → ChatOpenAI + 目录 `api` 作 baseURL 默认值（用户 settings
   里的 baseUrl 优先，便于切 cn/intl 端点）；ollama → ChatOllama。
3. **maxTokens 解析优先级**：`settings.maxTokens（用户调过）> 目录 limit.output > 保守回退 8192`
   （回退仅当模型名不在目录，如自定义模型）。
4. embeddings 解析逻辑不动。

**PROVIDER_MAP 静态默认值删除**，由目录数据取代；`listProviders()` 改为读 CatalogService。

## 6. 设置 UI（老渲染层最小同步）

完整设置页的 React 实装见
`docs/superpowers/specs/2026-09-20-react-settings-page-design.md`（迁移 Phase 7）。
老渲染层 `SettingsView.js` 在 Phase 9 cutover 前仍是默认渲染层的服役代码，只做**最小同步**：

- **模型选择**：provider 选定后，model 从自由文本变为 `<select>`，选项来自
  `ai:catalog:models` IPC（deprecated 过滤、release_date 倒序、每项显示名称 + 上下文窗口 +
  价格）；末尾保留"自定义…"选项恢复自由文本输入（openai_compat 及目录外模型用）。
- **maxTokens 控件（滑条 + 数字输入联动）**：滑条与一个 number `<input>` 双向联动——拖动滑条
  同步输入框数值，直接键入数字同步滑条位置；两者都 clamp 到 `[512, 模型 limit.output]`。
  选中模型后滑条 max 与默认值 = `limit.output`；控件旁显示"当前模型上限 N"。模型上限 < 512
  的极端情况 clamp 到 512。
- **新增 IPC**：`ai:catalog:providers`、`ai:catalog:models`（IpcRouter 注册，读
  CatalogService）；preload 桥接补对应方法。
- baseUrl 输入框保留：目录 `api` 仅作初始默认值。

## 7. 截断检测（修复原始 bug）

**事件链**：`AiService` 流式循环中记录 AI 消息 chunk 的
`response_metadata.finish_reason`（最后出现者生效）→ 为 `length` 时在 `done` 前
`yield { type:'truncated' }` → IpcRouter 经现有 `ai:token` 通道透传 → 渲染端 AiSidebar
收到后：

- 在当前回合末尾追加**独立提示元素**："⚠️ 输出因达到 token 上限被截断，可在设置中调高"
  （i18n key `ai.truncated`，中英双语）。**不混入 markdown 正文**——半截 markdown 不能再往里
  塞内容。
- `chat`（LangGraph messages 模式）与 `interpret` 两条流都检测。
- 截断提示是 UI 事件，不写入 session store。

## 8. 迁移与兼容

- `config.json` / `ai-settings.json` 的 `provider`/`model`/`baseUrl` 字段形状不变，provider 走
  别名归一化，无感升级。
- 已存的 maxTokens（如 4096）不强制迁移——仍在合法范围内则照常生效，用户看到滑条上限放宽后
  自行决定。**无破坏性升级。**
- 目录中不存在 / 已 deprecated 的已存模型名：照常可用（自定义语义），滑条按保守回退处理。
- `@langchain/community` 依赖保留（HNSWLib 向量库仍需要），仅 chat model 专用类退役。

## 9. 测试策略

- **单测**（`npm test`，core 层无 Electron 依赖）：
  - CatalogService：快照投影、缓存读写、TTL 过期回退（mock fs + fetch）。
  - ModelProvider：id 别名归一化、chatCls/baseURL 解析、maxTokens 三级优先级、未知模型回退。
  - 截断检测：mock 流（末 chunk finish_reason=length / stop）验证 interpret 产出 truncated 事件。
- **回归**：现有 `npm test` 全绿；`npm run smoke` 不涉及本改动面。
- **手工验证**：设置页切换 3 家不同 provider 观察模型列表与滑条范围变化；maxTokens 拉到 512
  触发解读复现"⚠️ 截断"提示。

## 10. 否决的备选方案

| 方案 | 否决原因 |
|---|---|
| 完整仿 opencode（全量 222 家 + 用户配置深合并 + 自定义 provider DSL） | 对占星桌面应用过度设计；UI 需搜索式选择器；与"精选白名单"决策冲突 |
| 纯静态更新 PROVIDER_MAP（手动改模型名和上限） | 治标不治本，下次新模型上线又会过时 |
| 检测到截断后自动续写拼接 | 成本与复杂度高，先做提示即可（非目标，可未来再评估） |
