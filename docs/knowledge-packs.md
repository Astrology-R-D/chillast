# 可插拔知识库（v1）

CHILLAST 接收知识库预准备器生成的 `.kbpack`，并在本机使用自己的嵌入模型准备检索索引。包不携带向量、脚本或模型凭据。原有内建索引、可安装知识包和用户文档可以同时使用。

## 操作

1. 在 `knowledge_library` 中勾选已经完成处理的书籍，或通过 **导入已准备知识** 加入 `.kbunit` / 已清洗 `.md`，点击 **导出 CHILLAST 知识包**。最终文本产物现在是 `.kbunit`，也可以通过 **导出 .kbunit** 单独保存、重复组合。
2. 填写知识包 ID、名称、版本和说明，保存 `.kbpack`。更新同一知识库时保留 ID，使用新版本号；不同内容不能覆盖同一个 ID 与版本。
3. 在 CHILLAST 的 **设置 → 可插拔知识库** 点击 **导入知识包**，查看文档数、知识体系和版本，再点击 **安装知识包**。安装会准备本机检索索引，首次使用需要等待嵌入模型就绪。
4. 安装完成后点击 **启用此版本**。相同 ID 同时只有一个版本启用，不同 ID 可同时启用。新包默认未启用。
5. 导入新版本后，选择版本并点击 **切换版本**；回退旧版本也是同一操作。停用或切换版本后才可移除该版本。
6. 若要完全替换默认资料，取消 **使用原有内建知识库**。该开关不影响知识包或用户文档，也不删除旧索引。

需重启两个应用以载入新的主进程和 preload；知识包选择及版本随后会长期保存。切换聊天模型或已保存的 AI 配置不会重置知识包选择。

## 包协议

协议的规范实现位于 `src/shared/KnowledgePack.cjs`，预准备器的 `src/vendor/KnowledgePack.cjs` 是同一实现的字节一致副本；跨项目测试检查两者一致。

ZIP 内只接收以下 UTF-8 内容：

```text
manifest.json
catalog.json
documents/<hash>.md
provenance/<hash>.json
```

`manifest.json` 声明 `format: "chillast.knowledge-pack"`、`schemaVersion: 1`、`minReaderVersion: 1`、包 ID、名称、版本、创建时间、说明、知识体系、文档数及每个文件的长度和 SHA-256。包指纹是 manifest 内容的 SHA-256；清单本身列举其余所有文件。

`catalog.json` 的每条文档包含稳定 ID、标题、`corpus`（如 `bazi`、`astrology`）、`domain`（如 `shishen`、`aspects`）、书籍信息及对应文本/来源文件路径。预准备器的新处理产物根据源文件哈希、知识体系和子领域生成文档 ID；单元再次打包沿用其 ID，旧 Markdown 导入根据书名、文件名及领域生成稳定 ID。同一文档在不同包版本中保持身份。

来源报告保留原始文件名、源文件哈希、书名、处理方式、字符保留情况与警告，不导出 API Key、接口地址或本地目录。正文严格使用预准备器已完成的输出。

v1 只保证整理后文本的行号。整理会移动或合并原文，所以 `lineBasis` 为 `prepared-text`，`originalPageMapping` 为 `unverified`；引用卡片不把这些行号说成原 PDF 页码。后续协议可以扩展经过验证的原书页码映射。

校验拒绝内容篡改、重复文档、目录缺失、不兼容版本、路径穿越、Windows 保留路径、链接、加密文件或可执行文件。单文件上限 16 MiB，压缩包及累计解压内容上限 256 MiB，文档上限 10,000。SHA-256 检测损坏或内容变化，并非发布者签名。

## 可复用的知识单元 `.kbunit`

`.kbunit` 是 UTF-8 Markdown，不是压缩文件或向量索引。首行 `<!-- kbunit: {...} -->` 包含 `format: "chillast.knowledge-unit"`、`schemaVersion: 1`、文档 ID、标题、知识体系、子领域、书籍、已去除凭据/目录的来源信息、正文 SHA-256 与 `chunking`；后续内容为原始整理正文。

最终检索分块采用 `markdown-boundaries-v1`，最多 1000 UTF-16 字符，重叠为 0。每个范围包含 `start` / `end`（半开字符范围）和 `lineStart` / `lineEnd`（从 1 开始的正文行号）。范围必须连续覆盖全文，不能越界、漏段、截断 Unicode 代理对或伪造行号。行号以去掉元数据注释后的正文为准；对应打包后 `documents/*.md` 的文本行号。

导入已准备单元立即得到可打包队列条目，不运行 OCR 或 AI。旧 Markdown / 只改后缀的旧 `.kbunit` 可自动补齐元数据与分块，正文保持原样；缺少原书来源的文本不会伪造 PDF 页码或清洗记录。预准备器保存受管理的单元副本，避免原文件移动后队列失效；新文件不依赖外部 `report.json`。

打包时把单元正文写入包中的 `documents/*.md`，来源写入 `provenance/*.json`，分块描述写入 `catalog.documents[].chunking`，沿用 v1 容器布局。安装时直接将这些块提交嵌入模型并保留正文行号；没有 `chunking` 的旧知识包仍使用原有兼容切分。校验拒绝被篡改的正文或分块；向量化仍由 CHILLAST 完成。

批量复用当前仓库的旧文本，可运行预准备器的 `npm run build:knowledge -- ...`；完整命令见 `knowledge_library/README.md`。原 Markdown 与旧内建索引保留，新 `.kbunit` / `.kbpack` 输出到独立目录。

## 安装、索引和回退

包存储在 `userData/knowledge/packages/` 下，包含持久化注册表、不可变的各版本内容和独立的索引缓存。路径由 ID/版本哈希生成，不使用包提供的路径作为本地目录。

缓存键包含包内容指纹、嵌入模型配置、向量空间和分块参数，并包含读取预准备分块的实现版本。导入时在临时目录构建索引，完成后保存包并提交注册表；启用时也先准备索引，再提交版本选择。构建失败会保留原选择。嵌入模型或分块方式变化时，新包索引重新准备，聊天模型变化不影响索引。

移除版本从管理列表中隐藏它，保留不可变内容和缓存供正在生成的对话及重新导入使用；v1 尚不自动回收磁盘缓存。

旧内建知识库沿用原索引，文档清单来自加载的索引。源文件不在当前目录的资料标记为 **仅存于索引**，仍可以检索。不要用当前仓库中少量 Markdown 重建或替换旧索引。

## AI 检索与引用

`search_knowledge` 使用当前启用的内建资料、知识包和用户文档，支持可选 `corpus` 过滤，再合并相似度结果。旧资料没有 `corpus` 元数据时，含“八字/四柱/bazi”的文件名归为八字，其余保留西方占星的兼容分类；需要精确分类的资料应从预准备器重新导出。

每次用户发言开始时，AI 获取一次知识库快照，工具绑定到该次快照。生成中切换版本不会混入新版本，下次发言使用新的选择。分析报告缓存键包含知识库指纹；同一星盘在知识库更新后重新分析。

工具结果与判据保存引用正文、内容版本、包 ID/名称/版本、书籍及来源报告。历史引用展示生成时的正文和版本，不从当前知识包反查替换。

## 验证

```powershell
node --test tests/KnowledgePack.test.js tests/KnowledgePackIpc.test.js tests/KnowledgePackProducer.test.js tests/PreloadSubscriptions.test.js
npm run test:renderer
npm run typecheck
npm run smoke:knowledge
```

预准备器仓库另运行 `npm test` 与 `npm run smoke:knowledge`。两个 Electron smoke 都使用临时用户目录和离线样例，不修改日常配置或旧知识库。
