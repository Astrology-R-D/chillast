#!/usr/bin/env node
//
// 一键构建知识库：Stage 1（清洗）→ Stage 2（按领域拆分）。
//
// 用法:
//   node tools/build-knowledge.mjs            # 全量
//   node tools/build-knowledge.mjs --force    # 重新清洗（忽略 tools/cleaned 缓存）
//   node tools/build-knowledge.mjs "内在的宇宙"  # 仅处理匹配的书
//
// 环境变量见 tools/README.md。

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig, createChatModel } from './agent/config.mjs';
import { listRawFiles, cleanFile, CHUNK_CHARS, CONCURRENCY } from './agent/pipeline.mjs';
import { listCleanedFiles, splitCleanedFile, FINAL_DIR } from './agent/classify.mjs';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const filter = args.find((a) => !a.startsWith('--'));

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   占星知识库构建：清洗 → 按领域拆分               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const config = await loadConfig();
  if (!config.apiKey) {
    console.error('✗ 未找到 API Key。请设置 OPENAI_API_KEY，或在应用中配置 AI 设置。');
    process.exit(1);
  }
  console.log(`✓ LLM: ${config.provider} / ${config.model}`);
  console.log(`✓ 清洗参数: chunk=${CHUNK_CHARS} · 并发=${CONCURRENCY} · maxTokens=${config.maxTokens} · temp=${config.temperature}\n`);

  const model = await createChatModel(config);
  const m = await import('@langchain/core/messages');
  const msgs = { SystemMessage: m.SystemMessage, HumanMessage: m.HumanMessage };

  // ── Stage 1: clean ─────────────────────────────────────────
  let rawFiles = await listRawFiles();
  if (filter) rawFiles = rawFiles.filter((f) => f.includes(filter));
  if (!rawFiles.length) { console.error('✗ tools/raw-knowledge/ 下没有匹配的 .p.txt'); process.exit(1); }

  console.log(`【Stage 1 清洗】共 ${rawFiles.length} 本\n`);
  const cleanStats = [];
  for (const f of rawFiles) {
    console.log(`🤖 清洗: ${f}`);
    try {
      const s = await cleanFile(model, msgs, f, { log: (x) => console.log(x), force });
      cleanStats.push(s);
      if (!s.skipped) console.log(`  ✓ ${s.outName}: ${s.inputChars}→${s.outputChars}（保留率 ${s.ratio}%）`);
      console.log('');
    } catch (e) { console.error(`  ✗ 失败: ${e.message}\n`); }
  }

  // ── Stage 2: classify & split ──────────────────────────────
  let cleaned = await listCleanedFiles();
  if (filter) cleaned = cleaned.filter((f) => f.includes(filter));
  console.log(`【Stage 2 按领域拆分】共 ${cleaned.length} 本\n`);
  const manifest = [];
  for (const f of cleaned) {
    console.log(`🔀 拆分: ${f}`);
    try {
      const s = await splitCleanedFile(model, msgs, f, { log: (x) => console.log(x) });
      const keep = s.inputChars ? Math.round((s.outputChars / s.inputChars) * 100) : 100;
      console.log(`  ✓ ${s.segments} 段 → ${s.outputs.length} 领域文件（保全 ${keep}%）\n`);
      manifest.push({ book: s.title, segments: s.segments, preservedPct: keep, outputs: s.outputs });
    } catch (e) { console.error(`  ✗ 失败: ${e.message}\n`); }
  }
  await writeFile(join(FINAL_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('────────────────────────────────────────────────────');
  console.log('Stage 1 保留率:');
  for (const s of cleanStats) {
    if (s.skipped) { console.log(`  ${s.title}: (跳过)`); continue; }
    console.log(`  ${s.title}: ${s.ratio}%${s.ratio < 50 ? '  ⚠' : ''}`);
  }
  const byDomain = {};
  for (const mm of manifest) for (const o of mm.outputs) byDomain[o.domain] = (byDomain[o.domain] || 0) + o.segs;
  console.log('各领域段落数:');
  for (const [d, n] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) console.log(`  ${d}: ${n}`);
  console.log('────────────────────────────────────────────────────');
  console.log('\n✓ 全部完成。最终知识库在 assets/knowledge/builtin/。');
  console.log('  提示：删除 userData/data/vector-index/ 目录以强制重建向量索引。');
}

main().catch((e) => { console.error('✗ 错误:', e.message); process.exit(1); });
