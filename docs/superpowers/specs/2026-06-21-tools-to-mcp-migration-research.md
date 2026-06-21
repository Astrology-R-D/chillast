# 研究：将内置 Tools 迁移到 MCP 的可行性

> 状态：RESEARCH · 日期：2026-06-21 · 分支：`feat/enhance_ai`
> 问题：现有内置工具（占星计算、上下文、档案、知识库）是否应改为通过 MCP 暴露/调用？

---

## 1. “迁移到 MCP”的两种含义

A. **全量迁移**：所有工具都改为 MCP 协议提供，Registry 只剩 `McpToolProvider`。
B. **选择性暴露**：把适合的工具额外发布为一个 MCP 服务器（供本应用或外部客户端如 Claude Desktop 使用），不适合的保留进程内。

结论先行：**推荐 B（选择性暴露）**，不推荐 A。原因见下。

---

## 2. 逐工具评估

| 工具 | 类型 | 是否依赖应用实时状态 | MCP 候选 | 说明 |
|------|------|----------------------|----------|------|
| compute_natal_chart / transit / synastry / solar_return / progressed | 纯计算 | 否（输入→输出） | ✅ 强候选 | 无状态，最适合做成 MCP 服务器，且对外部客户端有复用价值 |
| compute_bazi | 纯计算 | 否 | ✅ 强候选 | 同上（且不依赖 swisseph，最容易先行） |
| search_knowledge (RAG) | 检索 | 是（向量库在进程内） | ⚠️ 可选 | 向量库/embeddings 在进程内；迁出需让 MCP 进程自带向量库，收益低 |
| list_profiles / find_profile_by_name | 数据 | 部分（读档案文件） | ⚠️ 可选 | 档案是磁盘文件，MCP 进程可访问，但要重复鉴权/路径，收益低 |
| get_current_context / get_current_chart / get_active_profile | 实时状态 | **是（getContext 实时内存）** | ❌ 阻断 | **依赖渲染层/主进程的实时 UI 状态**；独立 MCP 进程看不到，迁出需额外的状态同步，得不偿失 |

---

## 3. 关键约束

1. **实时状态是硬阻断**：`get_current_*` / `get_active_profile` 读的是 `AiService.getContext()` —— 由渲染层每次操作 `setContext` 推入的实时内存。独立进程的 MCP 服务器无法访问；若要迁，必须把上下文不断同步给 MCP 进程，纯属增加复杂度。
2. **性能**：进程内工具调用是同步函数调用（微秒级）；MCP 跨进程 + 序列化 + 协议往返是毫秒级。对应用自用而言是净损失。
3. **原生依赖**：占星计算依赖 swisseph（见 DEF-001，当前已坏）。MCP 服务器同样要编译该原生模块——同一构建难题不会因为换协议而消失。
4. **依赖脆弱性**：MCP SDK / zod 版本窗口很窄（见架构 spec §11 的锁定）。把核心能力压在该协议上会放大风险。
5. **安全**：外部 MCP = 跑外部代码。把自家可信工具“伪装”成外部 MCP 反而引入不必要的进程/授权面。

---

## 4. 真正有价值的方向：把无状态计算能力发布为 MCP 服务器

把**占星/八字计算**（§2 中的强候选）封装成一个独立的 stdio MCP 服务器 `astrology-mcp`，价值在于**对外复用**：Claude Desktop、其它 app、CI 都能直接调用 CHILLAST 的精算引擎，而不是锁死在本应用内。

这与“本应用自用”不冲突——本应用继续用进程内 Provider（更快），需要时也能通过现成的 `McpToolProvider` 反过来消费自己的 MCP 服务器（自测/一致性验证用），但日常自用没必要。

### 单一事实源 + 双重暴露（推荐落地形态）
保持工具**逻辑**只有一份，套两层薄壳：
```
AstrologyService / ChineseAstrologyService   ← 唯一逻辑源
   ├── buildComputeTools()  → DynamicStructuredTool  (进程内，应用自用，已存在)
   └── astrology-mcp 服务器  → 用 @modelcontextprotocol/sdk 暴露同一组函数  (对外)
```
两层都只是把同一批 `computeChart/computeBaZi` 调用包装成各自协议的工具描述，零逻辑重复。

---

## 5. 建议

- **不做 A（全量迁移）**：实时状态工具无法干净迁出，且自用性能/复杂度/依赖都变差。
- **保留**：context / profile / knowledge 工具留在进程内 Provider（现状最优）。
- **可选增量（B）**：若需要对外复用精算能力，单独做 `astrology-mcp`（stdio，先做 bazi + natal，无 swisseph 的 bazi 可最先落地），逻辑复用 `buildComputeTools` 背后的服务，不动现有 Registry。
- 现有 `ToolProvider`/`ToolRegistry`/`McpToolProvider` 架构已足以承接：真要消费它，只需在 mcpServers 配置里加一条指向 `astrology-mcp` 即可，**应用侧零改动**。

---

## 6. 待确认

1. 对外复用 MCP 服务器是否是当前优先级？（若只是自用，现状已最优，无需任何迁移。）
2. 若要做 `astrology-mcp`：先做 bazi（无原生依赖、可立即跑通），还是等 swisseph（DEF-001）修复后连星盘一起做？
