#!/usr/bin/env node
//
// Stage 1 — OCR 文本清洗（分块·近无损）。输出整书 Markdown 到 tools/cleaned/。
// 之后运行 `node tools/split-knowledge.mjs` 按领域拆分到知识库，
// 或直接用 `node tools/build-knowledge.mjs` 一键完成两步。
//
// 用法:
//   node tools/clean-knowledge.mjs                 # 清洗 tools/raw-knowledge/ 下所有 .p.txt
//   node tools/clean-knowledge.mjs "内在的宇宙"     # 仅清洗文件名包含该关键词的文件
//   node tools/clean-knowledge.mjs --force         # 忽略已清洗缓存，重新清洗
//
// 可调环境变量: CLEAN_CHUNK_CHARS / CLEAN_CONCURRENCY / CLEAN_MAX_TOKENS / CLEAN_TEMPERATURE

import { loadConfig, createChatModel } from './agent/config.mjs';
import { listRawFiles, cleanFile, CHUNK_CHARS, CONCURRENCY } from './agent/pipeline.mjs';

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     占星知识库数据清洗（Stage 1·分块近无损）      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const config = await loadConfig();
  if (!config.apiKey) {
    console.error('✗ 未找到 API Key。请设置 OPENAI_API_KEY 环境变量，或在应用中配置 AI 设置。');
    process.exit(1);
  }
  console.log(`✓ LLM: ${config.provider} / ${config.model}`);
  console.log(`✓ 参数: chunk=${CHUNK_CHARS} 字符 · 并发=${CONCURRENCY} · maxTokens=${config.maxTokens} · temp=${config.temperature}\n`);

  const model = await createChatModel(config);
  const { SystemMessage, HumanMessage } = await import('@langchain/core/messages');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const filter = args.find((a) => !a.startsWith('--'));

  let files = await listRawFiles();
  if (!files.length) {
    console.error('✗ tools/raw-knowledge/ 下没有 .p.txt 文件。');
    process.exit(1);
  }
  if (filter) {
    files = files.filter((f) => f.includes(filter));
    if (!files.length) { console.error(`✗ 没有文件名包含 "${filter}" 的 .p.txt 文件。`); process.exit(1); }
  }

  console.log(`📚 待清洗文件 (${files.length}):`);
  for (const f of files) console.log(`   - ${f}`);
  console.log('');

  const stats = [];
  for (const filename of files) {
    console.log(`🤖 清洗: ${filename}`);
    try {
      const s = await cleanFile(model, { SystemMessage, HumanMessage }, filename, {
        log: (m) => console.log(m),
        force,
      });
      stats.push(s);
      if (!s.skipped) {
        console.log(`  ✓ 输出 tools/cleaned/${s.outName}: ${s.inputChars} → ${s.outputChars} 字符（保留率约 ${s.ratio}%）`);
      }
      console.log('');
    } catch (e) {
      console.error(`  ✗ 失败: ${e.message}\n`);
    }
  }

  console.log('────────────────────────────────────────────────────');
  console.log('清洗汇总（保留率 = 输出正文 / 输入原文，越接近 100% 越无损）:');
  for (const s of stats) {
    if (s.skipped) { console.log(`  ${s.title}: (已存在，跳过)`); continue; }
    const warn = s.ratio < 50 ? '  ⚠ 偏低，请检查' : '';
    console.log(`  ${s.title}: ${s.ratio}% (${s.inputChars}→${s.outputChars})${warn}`);
  }
  console.log('────────────────────────────────────────────────────');
  console.log('\n✓ Stage 1 完成。输出在 tools/cleaned/。');
  console.log('  下一步：node tools/split-knowledge.mjs   （按领域拆分到知识库）');
}

main().catch((e) => {
  console.error('✗ 错误:', e.message);
  process.exit(1);
});
