#!/usr/bin/env node
//
// Stage 2 — 按领域拆分。把 tools/cleaned/ 下清洗好的整书 Markdown，按知识领域
// （行星落座 / 落宫 / 相位 / 格局 / 逆行 / 行运 / 合盘 / 命理 / 综合）无损拆分，
// 输出到 assets/knowledge/builtin/，每个文件带 <!-- domain: X --> 标记供知识库识别。
//
// 用法:
//   node tools/split-knowledge.mjs                 # 拆分 tools/cleaned/ 下全部
//   node tools/split-knowledge.mjs "内在的宇宙"     # 仅拆分文件名含该关键词的
//
// 环境变量: SPLIT_SEG_CHARS / SPLIT_BATCH / SPLIT_CONCURRENCY（见 README）

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig, createChatModel } from './agent/config.mjs';
import { listCleanedFiles, splitCleanedFile, FINAL_DIR } from './agent/classify.mjs';

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     占星知识库 · 按领域拆分（Stage 2）            ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const config = await loadConfig();
  let model = null;
  let msgs = null;
  if (config.apiKey) {
    model = await createChatModel(config);
    const m = await import('@langchain/core/messages');
    msgs = { SystemMessage: m.SystemMessage, HumanMessage: m.HumanMessage };
    console.log(`✓ 分类 LLM: ${config.provider} / ${config.model}\n`);
  } else {
    console.log('⚠ 未配置 API Key，将仅用关键词启发式分类（准确度较低）。\n');
  }

  let files = await listCleanedFiles();
  if (!files.length) {
    console.error('✗ tools/cleaned/ 下没有 .md 文件。请先运行 node tools/clean-knowledge.mjs');
    process.exit(1);
  }
  const filter = process.argv[2];
  if (filter) files = files.filter((f) => f.includes(filter));
  if (!files.length) { console.error(`✗ 没有匹配 "${filter}" 的文件。`); process.exit(1); }

  console.log(`📚 待拆分 (${files.length}):`);
  for (const f of files) console.log(`   - ${f}`);
  console.log('');

  const manifest = [];
  for (const filename of files) {
    console.log(`🔀 拆分: ${filename}`);
    try {
      const s = await splitCleanedFile(model, msgs, filename, { log: (m) => console.log(m) });
      const keep = s.inputChars ? Math.round((s.outputChars / s.inputChars) * 100) : 100;
      console.log(`  ✓ ${s.segments} 段 → ${s.outputs.length} 个领域文件（内容保全 ${keep}%）`);
      for (const o of s.outputs) console.log(`     · ${o.outName}  (${o.segs} 段, ${o.chars} 字)`);
      console.log('');
      manifest.push({ book: s.title, segments: s.segments, preservedPct: keep, outputs: s.outputs });
    } catch (e) {
      console.error(`  ✗ 失败: ${e.message}\n`);
    }
  }

  await writeFile(join(FINAL_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('────────────────────────────────────────────────────');
  const byDomain = {};
  for (const m of manifest) for (const o of m.outputs) byDomain[o.domain] = (byDomain[o.domain] || 0) + o.segs;
  console.log('各领域段落总数:');
  for (const [d, n] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) console.log(`  ${d}: ${n}`);
  const low = manifest.filter((m) => m.preservedPct < 98);
  if (low.length) {
    console.log('\n⚠ 内容保全率偏低（应接近 100%，可能有段落被合并/丢弃）:');
    for (const m of low) console.log(`  ${m.book}: ${m.preservedPct}%`);
  }
  console.log('────────────────────────────────────────────────────');
  console.log('\n✓ 完成。输出在 assets/knowledge/builtin/（含 _manifest.json）。');
  console.log('  提示：删除 userData/data/vector-index/ 目录以强制重建向量索引。');
}

main().catch((e) => { console.error('✗ 错误:', e.message); process.exit(1); });
