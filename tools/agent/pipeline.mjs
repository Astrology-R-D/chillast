// pipeline.mjs — Stage 1: deterministic, chunked, near-lossless OCR cleaning.
//
// Why not the ReAct agent? Asking an LLM to read a whole book and re-emit the
// cleaned book in one turn forces summarization (and is capped by the output
// token limit). Instead we split each file into small chunks, clean each chunk
// independently with a strict "preserve everything" instruction, then stitch the
// results back together. The model only ever processes one small chunk, so it
// physically cannot drop most of the content.
//
// Output: one cleaned `.md` per book into tools/cleaned/ (intermediate). Stage 2
// (classify.mjs) then routes sections into per-domain files under the live KB dir.

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { extractText, stripFence, mapWithConcurrency, withRetry } from './util.mjs';

const ROOT = process.cwd();
export const INPUT_DIR = process.env.CLEAN_IN_DIR || join(ROOT, 'tools', 'raw-knowledge');
export const CLEANED_DIR = process.env.CLEAN_OUT_DIR || join(ROOT, 'tools', 'cleaned');

// Per-chunk size (characters of raw OCR text). Small enough that the cleaned
// output comfortably fits under the model's output-token limit.
export const CHUNK_CHARS = Number(process.env.CLEAN_CHUNK_CHARS || 4500);
// How many chunks to clean in parallel. Order is preserved regardless.
export const CONCURRENCY = Number(process.env.CLEAN_CONCURRENCY || 4);

const CHUNK_SYSTEM_PROMPT = `你是占星书籍 OCR 文本清洗专家。下面给你的是从一本书中 OCR 提取的**一段**原始纯文本（整本书的一部分）。请把它清洗成规范的简体中文 Markdown。

【第一原则：这是清洗，不是摘要】
- 逐句保留原文的**全部实质内容**，禁止概括、缩写、改写、删减或省略任何正文。
- 不要因为"看起来重复"就删除正文——不同段落的相似论述都要保留。
- 清洗后的中文正文字数应与输入正文相当（通常 ≥ 输入正文的 90%）。宁可多保留，也不要丢内容。

【需要修复的 OCR 问题】
- 删除：纯乱码片段（如 {l hmrt {ee）、页眉页脚、孤立页码、纯英文的版权/目录噪声。
- 修正：明显错字（依据上下文，如"占量学"→"占星学"）、被错误拆分的英文词（ChartInterpretation→Chart Interpretation）。
- 合并：被错误断行/分页切断的句子和段落，恢复成通顺的整段。
- 保留：占星专业术语与符号（☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ☊ ☋ 等），以及人名、星座、宫位等专有名词。

【格式要求】
- 若本段中出现章节或小节标题，用 ## / ### 还原；正文用普通段落。
- 不要新增原文没有的标题、解释或总结。
- 直接输出清洗后的 Markdown 正文本身，不要任何前言、说明、不要用 \`\`\` 代码块包裹，不要写"以下是清洗结果"之类的话。

【特例】
- 如果这一段几乎全是乱码、版权页、目录或空白、没有任何实质正文，只回复一个词：SKIP`;

/**
 * Split text into chunks of at most ~maxChars, breaking on blank-line paragraph
 * boundaries so we never cut mid-sentence. Oversized single paragraphs are hard
 * split as a fallback.
 */
export function splitIntoChunks(text, maxChars = CHUNK_CHARS) {
  const paragraphs = String(text).split(/\n\s*\n/);
  const chunks = [];
  let buf = '';
  const flush = () => { if (buf.trim()) chunks.push(buf); buf = ''; };

  for (const para of paragraphs) {
    const p = para.replace(/\s+$/g, '');
    if (!p.trim()) continue;
    if (p.length > maxChars) {
      flush();
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
      continue;
    }
    if (buf && buf.length + p.length + 2 > maxChars) flush();
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  flush();
  return chunks;
}

/** Clean one chunk. Returns cleaned markdown, or '' if the model said SKIP. */
async function cleanChunk(model, SystemMessage, HumanMessage, chunk) {
  const res = await withRetry(() => model.invoke([
    new SystemMessage(CHUNK_SYSTEM_PROMPT),
    new HumanMessage(chunk),
  ]));
  const out = stripFence(extractText(res));
  if (/^skip$/i.test(out.trim())) return '';
  return out;
}

/** Derive a readable book title from the raw OCR filename. */
export function titleFromFilename(filename) {
  return filename
    .replace(/\.p\.txt$/i, '')
    .replace(/^\[OCR\]_?/i, '')
    .replace(/_\d{6,}(?:_\d{3,})?$/, '') // trailing _YYYYMMDD_HHMM timestamp
    .trim() || filename.replace(/\.p\.txt$/i, '');
}

/** List the raw .p.txt OCR files available for cleaning. */
export async function listRawFiles() {
  if (!existsSync(INPUT_DIR)) return [];
  const files = await readdir(INPUT_DIR);
  return files.filter((f) => /\.p\.txt$/i.test(f)).sort();
}

/**
 * Clean a single raw file end-to-end and write the result to tools/cleaned/.
 * Returns stats so the caller can verify how much content was preserved.
 * Skips files already cleaned unless { force } is set.
 */
export async function cleanFile(model, messages, filename, { log = () => {}, force = false } = {}) {
  const { SystemMessage, HumanMessage } = messages;
  const title = titleFromFilename(filename);
  const outName = `${title}.md`;
  const outPath = join(CLEANED_DIR, outName);

  if (!force && existsSync(outPath)) {
    log(`  · 跳过（已存在）：${outName}（用 --force 重新清洗）`);
    return { title, outName, skipped: true };
  }

  const raw = await readFile(join(INPUT_DIR, filename), 'utf-8');
  const chunks = splitIntoChunks(raw);
  log(`  · ${title}: ${raw.length} 字符 → ${chunks.length} 块（并发 ${CONCURRENCY}）`);

  let done = 0;
  const cleaned = await mapWithConcurrency(chunks, CONCURRENCY, async (chunk, idx) => {
    try {
      const out = await cleanChunk(model, SystemMessage, HumanMessage, chunk);
      done++;
      log(`    └ 块 ${idx + 1}/${chunks.length} ✓ (${done}/${chunks.length})`);
      return out;
    } catch (e) {
      done++;
      log(`    └ 块 ${idx + 1}/${chunks.length} ✗ ${e.message}（保留原文）`);
      // On hard failure keep the raw chunk so no content is silently lost.
      return chunk;
    }
  });

  const body = cleaned.filter((s) => s && s.trim()).join('\n\n');
  const overview = `本文档由《${title}》OCR 文本清洗整理而成，覆盖该书的占星知识内容。`;
  const md = `# ${title}\n\n${overview}\n\n${body}\n`;

  if (!existsSync(CLEANED_DIR)) await mkdir(CLEANED_DIR, { recursive: true });
  await writeFile(outPath, md, 'utf-8');

  const ratio = raw.length ? Math.round((body.length / raw.length) * 100) : 0;
  return { title, outName, inputChars: raw.length, outputChars: body.length, chunks: chunks.length, ratio };
}
