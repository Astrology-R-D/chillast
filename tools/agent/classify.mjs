// classify.mjs — Stage 2: route cleaned book sections into per-domain files.
//
// Lossless reorganization: a cleaned book is split into sections (by ##/### or by
// size), each section is classified into one knowledge domain (LLM over the
// heading + a short excerpt, with a deterministic keyword fallback), then sections
// are written out grouped by (book, domain). No content is summarized or dropped —
// every section ends up in exactly one output file, and we assert char counts match.

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { extractText, mapWithConcurrency, withRetry, parseJsonArray } from './util.mjs';
import { CLEANED_DIR } from './pipeline.mjs';

const ROOT = process.cwd();
export const FINAL_DIR = process.env.KB_OUT_DIR || join(ROOT, 'assets', 'knowledge', 'builtin');

export const SEG_CHARS = Number(process.env.SPLIT_SEG_CHARS || 3500);
const MIN_SEG_CHARS = 200;
const CLASSIFY_BATCH = Number(process.env.SPLIT_BATCH || 18);
const CLASSIFY_CONCURRENCY = Number(process.env.SPLIT_CONCURRENCY || 3);

// Canonical domains. `zh` is the human label; the `id` is written as a marker the
// KnowledgeBase reads directly, so classification never depends on title wording.
export const DOMAINS = [
  { id: 'planets-signs', zh: '行星落座', kw: ['落座', '入座', '在白羊', '在金牛', '在双子', '在巨蟹', '在狮子', '在处女', '在天秤', '在天蝎', '在射手', '在摩羯', '在水瓶', '在双鱼', '星座的', '座的人'] },
  { id: 'planets-houses', zh: '行星落宫', kw: ['落宫', '宫位', '第一宫', '第二宫', '第三宫', '第四宫', '第五宫', '第六宫', '第七宫', '第八宫', '第九宫', '第十宫', '第十一宫', '第十二宫', '一宫', '二宫', '三宫', '四宫', '五宫', '六宫', '七宫', '八宫', '九宫', '十宫'] },
  { id: 'aspects', zh: '相位', kw: ['相位', '合相', '对分相', '四分相', '三分相', '六分相', '梅花相', '容许度', '刑克', '拱', '形成相位'] },
  { id: 'patterns', zh: '格局', kw: ['格局', '大三角', '大十字', 'T三角', 'T 三角', '风筝', '星群', '上帝之指'] },
  { id: 'retrograde', zh: '逆行', kw: ['逆行', '逆相', '停滞留', '顺行'] },
  { id: 'transit', zh: '行运', kw: ['行运', '流年', '推运', '过运', '行运盘', '次限'] },
  { id: 'synastry', zh: '合盘', kw: ['合盘', '关系盘', '比较盘', '组合盘', '配对盘', '中点盘'] },
  { id: 'bazi', zh: '命理八字', kw: ['八字', '命理', '五行', '天干', '地支', '十神', '生肖', '纳音', '日主'] },
  { id: 'general', zh: '综合', kw: [] },
];
const VALID = new Set(DOMAINS.map((d) => d.id));
const ZH = Object.fromEntries(DOMAINS.map((d) => [d.id, d.zh]));

const CLASSIFY_SYSTEM = `你是占星知识分类助手。给你若干文本片段（编号 + 标题 + 摘要），判断每段**主要**属于下列哪个领域，只能使用给定的英文 id：
- planets-signs：行星落入星座的含义（如"火星在天蝎座"）
- planets-houses：行星落入宫位、某一宫的主题（如"金星在第七宫""第十宫"）
- aspects：行星之间的相位（合/冲/刑/拱/六分/梅花等）
- patterns：星盘整体格局（大三角、大十字、T 三角、星群、上帝之指等）
- retrograde：行星逆行
- transit：行运 / 流年 / 推运
- synastry：合盘 / 关系盘 / 组合盘 / 中点盘
- bazi：中式命理（八字、五行、十神、天干地支、生肖）
- general：以上都不明确，或属于导论、概述、历史、方法论等通用内容
只输出一个 JSON 数组，元素形如 {"i":<编号>,"domain":"<id>"}，不要任何多余文字或解释。`;

function parseTitleAndBody(raw) {
  const lines = String(raw).split('\n');
  let title = '';
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+)/);
    if (m) { title = m[1].trim(); start = i + 1; break; }
  }
  if (!title) title = 'untitled';
  return { title, body: lines.slice(start).join('\n') };
}

/** Drop the generic overview line Stage 1 prepends, so it isn't routed as content. */
function stripBoilerplate(body) {
  return body.replace(/^\s*本文档由《[^》]*》OCR[^\n]*\n?/, '').replace(/^\s+/, '');
}

/**
 * Split a cleaned book body into classification units: primarily on ##/### head-
 * ings, then capping size by paragraph and merging tiny fragments.
 */
export function splitIntoSegments(body) {
  const lines = body.split('\n');
  const raw = [];
  let cur = { heading: '', lines: [] };
  const push = () => {
    const text = cur.lines.join('\n').trim();
    if (text) raw.push({ heading: cur.heading, text });
  };
  for (const line of lines) {
    if (/^#{2,3}\s+/.test(line)) {
      push();
      cur = { heading: line.replace(/^#{2,3}\s+/, '').trim(), lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  push();

  // Cap oversized sections by paragraph.
  const sized = [];
  for (const s of raw) {
    if (s.text.length <= SEG_CHARS) { sized.push(s); continue; }
    const paras = s.text.split(/\n\s*\n/);
    let buf = [];
    let len = 0;
    const flush = () => {
      if (buf.length) sized.push({ heading: s.heading, text: buf.join('\n\n').trim() });
      buf = []; len = 0;
    };
    for (const p of paras) {
      if (len && len + p.length > SEG_CHARS) flush();
      buf.push(p); len += p.length + 2;
    }
    flush();
  }

  // Merge only tiny *heading-less* fragments into the previous segment — never
  // collapse a distinct ##/### section, even a short one (it may be its own domain).
  const merged = [];
  for (const s of sized) {
    if (merged.length && !s.heading && s.text.length < MIN_SEG_CHARS) {
      merged[merged.length - 1].text += `\n\n${s.text}`;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** Deterministic keyword fallback when the LLM is unavailable or returns junk. */
export function heuristicDomain(seg) {
  // Weight the heading 2x — it's the strongest signal of a section's topic.
  const hay = `${seg.heading}\n${seg.heading}\n${seg.text}`;
  let best = 'general';
  let bestScore = 0;
  for (const d of DOMAINS) {
    if (!d.kw.length) continue;
    let score = 0;
    for (const k of d.kw) {
      let from = 0;
      let count = 0;
      while ((from = hay.indexOf(k, from)) !== -1) { count++; from += k.length; }
      if (count) score += count * (k.length >= 3 ? 2 : 1);
    }
    if (score > bestScore) { bestScore = score; best = d.id; }
  }
  return bestScore > 0 ? best : 'general';
}

async function classifyBatch(model, msgs, batch) {
  if (!model) return batch.map(heuristicDomain);
  const { SystemMessage, HumanMessage } = msgs;
  const body = batch
    .map((s, i) => `[${i}] 标题：${s.heading || '（无）'}\n摘要：${s.text.replace(/\s+/g, ' ').slice(0, 220)}`)
    .join('\n\n');
  try {
    const res = await withRetry(() => model.invoke([
      new SystemMessage(CLASSIFY_SYSTEM),
      new HumanMessage(body),
    ]));
    const arr = parseJsonArray(extractText(res));
    const map = new Map();
    if (arr) {
      for (const it of arr) {
        if (it && Number.isInteger(it.i) && VALID.has(it.domain)) map.set(it.i, it.domain);
      }
    }
    // Fall back per-item for anything the model missed.
    return batch.map((s, i) => map.get(i) || heuristicDomain(s));
  } catch (_) {
    return batch.map(heuristicDomain);
  }
}

/** Classify all segments via batched LLM calls (with heuristic fallback). */
export async function classifySegments(model, msgs, segments, { log = () => {} } = {}) {
  const batches = [];
  for (let i = 0; i < segments.length; i += CLASSIFY_BATCH) {
    batches.push(segments.slice(i, i + CLASSIFY_BATCH));
  }
  let done = 0;
  const results = await mapWithConcurrency(batches, CLASSIFY_CONCURRENCY, async (batch) => {
    const labels = await classifyBatch(model, msgs, batch);
    done += batch.length;
    log(`    └ 分类 ${done}/${segments.length}`);
    return labels;
  });
  return results.flat();
}

/** Safe filename from a book title (keep Chinese, strip path-hostile chars). */
function slugifyBook(title) {
  return title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '').trim() || 'book';
}

function renderDomainFile(title, domain, segs) {
  const zh = ZH[domain] || domain;
  const head = `<!-- domain: ${domain} -->\n# ${title} · ${zh}\n\n> 来源：《${title}》 ｜ 领域：${zh}\n`;
  return `${head}\n${segs.map((s) => s.text).join('\n\n')}\n`;
}

export async function listCleanedFiles() {
  if (!existsSync(CLEANED_DIR)) return [];
  const files = await readdir(CLEANED_DIR);
  return files.filter((f) => f.endsWith('.md')).sort();
}

/**
 * Split one cleaned book into per-domain files under FINAL_DIR. Returns stats
 * including a content-preservation check (output chars vs input section chars).
 */
export async function splitCleanedFile(model, msgs, filename, { log = () => {} } = {}) {
  const raw = await readFile(join(CLEANED_DIR, filename), 'utf-8');
  const { title, body } = parseTitleAndBody(raw);
  const segments = splitIntoSegments(stripBoilerplate(body));
  if (!segments.length) return { title, segments: 0, outputs: [], inputChars: 0, outputChars: 0 };

  log(`  · ${title}: ${segments.length} 段，分类中…`);
  const domains = await classifySegments(model, msgs, segments, { log });

  const buckets = new Map();
  segments.forEach((s, i) => {
    const d = VALID.has(domains[i]) ? domains[i] : 'general';
    if (!buckets.has(d)) buckets.set(d, []);
    buckets.get(d).push(s);
  });

  if (!existsSync(FINAL_DIR)) await mkdir(FINAL_DIR, { recursive: true });
  const slug = slugifyBook(title);
  const outputs = [];
  for (const [domain, segs] of buckets) {
    const outName = `${slug}-${domain}.md`;
    await writeFile(join(FINAL_DIR, outName), renderDomainFile(title, domain, segs), 'utf-8');
    outputs.push({ domain, outName, segs: segs.length, chars: segs.reduce((a, s) => a + s.text.length, 0) });
  }

  const inputChars = segments.reduce((a, s) => a + s.text.length, 0);
  const outputChars = outputs.reduce((a, o) => a + o.chars, 0);
  return { title, segments: segments.length, outputs, inputChars, outputChars };
}
