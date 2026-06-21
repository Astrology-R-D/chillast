#!/usr/bin/env node
//
// build-index.mjs — 发布前预构建：把嵌入模型下载到 resources/models/，并用应用自身的
// KnowledgeBase 构建向量索引到 resources/vector-index/。两者随后由 electron-builder
// 的 extraResources 一起打包（见 package.json build 段）。
//
// 用法:
//   node tools/build-index.mjs
//   HF_ENDPOINT=https://hf-mirror.com node tools/build-index.mjs   # 指定镜像
//
// 产物:
//   resources/models/Xenova/<model>/...   （离线嵌入模型，~95MB）
//   resources/vector-index/{args,docstore,hnswlib.index}  （预建索引，~13MB）

import { rm, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const RES = join(ROOT, 'resources');
const MODELS_DIR = join(RES, 'models');
const INDEX_DIR = join(RES, 'vector-index');
const BUILTIN = join(ROOT, 'assets', 'knowledge', 'builtin');

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   预构建：嵌入模型 + 向量索引（发布用）          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (!existsSync(BUILTIN)) {
    console.error(`✗ 知识库目录不存在: ${BUILTIN}（请先跑 tools/split-knowledge.mjs）`);
    process.exit(1);
  }

  const appCfg = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf-8'));
  const emb = appCfg.embeddings || {};
  if ((emb.provider || 'local') !== 'local') {
    console.error(`✗ config.json embeddings.provider = "${emb.provider}"，本脚本只用于本地模型预构建。`);
    process.exit(1);
  }

  // Fresh index so we never accidentally ship a stale/cached one.
  if (existsSync(INDEX_DIR)) await rm(INDEX_DIR, { recursive: true, force: true });
  await mkdir(MODELS_DIR, { recursive: true });

  const { default: WorkerEmbeddings } = await import('../src/core/ai/WorkerEmbeddings.js');
  const { default: KnowledgeBase } = await import('../src/core/ai/KnowledgeBase.js');

  const model = emb.model || 'Xenova/bge-small-zh-v1.5';
  const endpoint = process.env.HF_ENDPOINT || emb.endpoint;
  console.log(`模型: ${model}`);
  console.log(`镜像: ${endpoint || '(默认 huggingface.co)'}`);
  console.log(`模型输出: ${MODELS_DIR}`);
  console.log(`索引输出: ${INDEX_DIR}\n`);

  // Download the model INTO the bundle dir (cacheDir layout == localModelPath layout).
  const embeddings = new WorkerEmbeddings({ model, endpoint, cacheDir: MODELS_DIR });
  const kb = new KnowledgeBase({ embeddings: () => embeddings });

  let lastLine = '';
  kb.setProgressHandler((p) => {
    if (p.phase === 'model') { if (lastLine !== 'model') { process.stdout.write('  下载/加载嵌入模型…\n'); lastLine = 'model'; } }
    else if (p.phase === 'indexing') { process.stdout.write(`\r  建立索引 ${p.done}/${p.total}    `); lastLine = 'idx'; }
    else if (p.phase === 'ready') { process.stdout.write(`\n  ✓ 索引完成（${p.chunks || 0} 片段）\n`); }
    else if (p.phase === 'error') { process.stdout.write(`\n  ✗ ${p.message}\n`); }
  });

  try {
    await kb.initialize(BUILTIN, null, INDEX_DIR);
  } finally {
    await embeddings.close();
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log('完成。下一步：');
  console.log('  1) 确认 resources/models 与 resources/vector-index 已生成');
  console.log('  2) npm run dist  （electron-builder 会把它们打进安装包）');
}

main().catch((e) => { console.error('✗ 错误:', e.message); process.exit(1); });
