"use strict";

// A .kbunit is UTF-8 Markdown with one portable metadata comment, never an archive.
const { createHash } = require('node:crypto');
const { structureMarkdown, validateStructure } = require('./KnowledgeStructure.cjs');
const FORMAT = 'chillast.knowledge-unit';
const MAX_UNIT_BYTES = 16 * 1024 * 1024;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`知识单元无效：${message}`); };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(value);
const validCorpus = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
const validDomain = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const lineAt = (text, offset) => 1 + (text.slice(0, offset).match(/\n/g) || []).length;

function chunkMarkdown(text, maxChars = 1000) {
  if (!Number.isInteger(maxChars) || maxChars < 100 || maxChars > 1000) fail('分块大小必须为 100–1000 字符');
  const chunks = [];
  let start = 0, line = 1;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const floor = Math.floor(maxChars / 2);
      // Search only this window; long unbroken paragraphs otherwise cause quadratic work.
      const window = text.slice(start, end);
      const paragraph = window.lastIndexOf('\n\n');
      const newline = window.lastIndexOf('\n');
      if (paragraph >= floor) end = start + paragraph + 2;
      else if (newline >= floor) end = start + newline + 1;
      // Never cut an astral Unicode character in half.
      if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    }
    const fragment = text.slice(start, end), count = (fragment.match(/\n/g) || []).length;
    chunks.push({ start, end, lineStart: line, lineEnd: line + count - (fragment.endsWith('\n') ? 1 : 0) });
    line += count; start = end;
  }
  return { algorithm: 'markdown-boundaries-v1', maxChars, overlap: 0, chunks };
}

function validateChunking(text, chunking) {
  if (!chunking || chunking.algorithm !== 'markdown-boundaries-v1' || !Number.isInteger(chunking.maxChars) || chunking.maxChars < 100 || chunking.maxChars > 1000 || chunking.overlap !== 0 || !Array.isArray(chunking.chunks) || !chunking.chunks.length || chunking.chunks.length > 40000) fail('分块描述不兼容');
  let previous = 0, line = 1;
  for (const chunk of chunking.chunks) {
    if (!chunk || !Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start !== previous || chunk.end <= chunk.start || chunk.end > text.length || chunk.end - chunk.start > chunking.maxChars) fail('分块范围不连续或越界');
    if (chunk.end < text.length && /[\uD800-\uDBFF]/.test(text[chunk.end - 1]) && /[\uDC00-\uDFFF]/.test(text[chunk.end])) fail('分块截断 Unicode 字符');
    const fragment = text.slice(chunk.start, chunk.end), count = (fragment.match(/\n/g) || []).length;
    if (chunk.lineStart !== line || chunk.lineEnd !== line + count - (fragment.endsWith('\n') ? 1 : 0)) fail('分块行号不匹配');
    line += count; previous = chunk.end;
  }
  if (previous !== text.length) fail('分块未覆盖全文');
  return chunking;
}

function publicProvenance(value = {}) {
  const out = {};
  for (const key of ['sourceName', 'sourceHash', 'title', 'rawChars', 'cleanedChars', 'preservation', 'warnings', 'completedAt', 'importedFrom', 'unitSourceHash']) if (value[key] !== undefined) out[key] = value[key];
  if (out.sourceName) out.sourceName = String(out.sourceName).split(/[\\/]/).at(-1);
  if (out.importedFrom) out.importedFrom = String(out.importedFrom).split(/[\\/]/).at(-1);
  const prep = value.preparation || {};
  out.preparation = Object.fromEntries(['provider', 'model', 'corpus', 'corpusName', 'ocrEngine', 'ocrMode', 'visionMode', 'translateToSimplifiedChinese', 'languages', 'denoise', 'split', 'origin'].filter(key => key in prep).map(key => [key, prep[key]]));
  return { ...out, lineBasis: 'prepared-text', originalPageMapping: 'unverified' };
}

function validateDocument(doc) {
  if (!doc || !validId(doc.id) || typeof doc.title !== 'string' || !doc.title.trim() || doc.title.length > 240 || !validCorpus(doc.corpus) || !validDomain(doc.domain)) fail('标题、ID 或领域无效');
  if (typeof doc.text !== 'string' || !doc.text.trim() || Buffer.byteLength(doc.text) > MAX_UNIT_BYTES) fail('正文为空或超过 16 MiB');
  if (doc.book && (typeof doc.book !== 'object' || !validId(doc.book.id) || typeof doc.book.title !== 'string' || !doc.book.title.trim() || doc.book.title.length > 240)) fail('书籍信息无效');
  if (doc.lineBasis && doc.lineBasis !== 'prepared-text' || doc.originalPageMapping && doc.originalPageMapping !== 'unverified') fail('引用位置声明不受支持');
  validateChunking(doc.text, doc.chunking);
  if (doc.structure) validateStructure(doc.text, doc.structure);
  return doc;
}

function encodeUnit(document) {
  const doc = { ...document, corpus: document.corpus || 'general', domain: document.domain || 'general', chunking: document.chunking || chunkMarkdown(document.text) };
  validateDocument(doc);
  const meta = { format: FORMAT, schemaVersion: 1, id: doc.id, title: doc.title, corpus: doc.corpus, domain: doc.domain,
    book: doc.book || null, structure: doc.structure || structureMarkdown(doc.text), provenance: publicProvenance(doc.provenance), textSha256: sha256(doc.text), chunking: doc.chunking,
    lineBasis: 'prepared-text', originalPageMapping: 'unverified' };
  // Keep arbitrary titles inside a single valid HTML comment.
  const header = JSON.stringify(meta).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const unit = `<!-- kbunit: ${header} -->\n${doc.text}`;
  if (Buffer.byteLength(unit) > MAX_UNIT_BYTES) fail('文件超过 16 MiB');
  return unit;
}

function inferDocument(text, fileName = 'knowledge.kbunit', fallback = {}) {
  const name = String(fileName).split(/[\\/]/).at(-1);
  const stem = name.replace(/\.(kbunit|md)$/i, '');
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const domain = text.match(/^<!--\s*domain:\s*([a-z][a-z0-9-]*)\s*-->/m)?.[1] || fallback.domain || 'general';
  const corpus = /^(astrology|bazi|ziwei|vedic)-/i.exec(stem)?.[1]?.toLowerCase()
    || (/八字|四柱|bazi/i.test(stem + '\n' + (heading || '')) ? 'bazi' : /紫微|ziwei/i.test(stem + '\n' + (heading || '')) ? 'ziwei' : ['planets-signs', 'planets-houses', 'aspects', 'patterns', 'transit', 'synastry', 'retrograde'].includes(domain) ? 'astrology' : fallback.corpus || 'general');
  const bookTitle = heading?.split(/\s+·\s+/)[0] || stem;
  const book = { id: `B${sha256(bookTitle).slice(0, 32)}`, title: bookTitle };
  const id = `D${sha256(`${book.id}:${corpus}:${domain}:${stem}`).slice(0, 32)}`;
  return { id, title: heading || stem, text, corpus, domain, book, chunking: chunkMarkdown(text), structure: structureMarkdown(text), provenance: {
    sourceName: name, sourceHash: sha256(text), title: bookTitle, preparation: { origin: 'externally-prepared', corpus },
    warnings: ['外部已准备文本；未由本次导入重新清洗或验证原书页码。'], lineBasis: 'prepared-text', originalPageMapping: 'unverified' } };
}

function decodeUnit(value, { fileName, fallback } = {}) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  if (buffer.length > MAX_UNIT_BYTES) fail('文件超过 16 MiB');
  let raw;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (_) { fail('必须使用 UTF-8 编码'); }
  // Plain renamed Markdown remains importable; malformed structured headers do not silently downgrade.
  if (!raw.startsWith('<!-- kbunit:')) return validateDocument(inferDocument(raw, fileName, fallback));
  const close = raw.indexOf(' -->\n');
  if (close < 0 || close > 4 * 1024 * 1024) fail('元数据注释不完整');
  let meta;
  try { meta = JSON.parse(raw.slice('<!-- kbunit:'.length, close).trim()); } catch (_) { fail('元数据 JSON 无效'); }
  if (meta?.format !== FORMAT || meta.schemaVersion !== 1) fail('协议版本不兼容');
  if (meta.lineBasis !== 'prepared-text' || meta.originalPageMapping !== 'unverified') fail('引用位置声明不受支持');
  const text = raw.slice(close + ' -->\n'.length);
  if (meta.textSha256 !== sha256(text)) fail('正文哈希不匹配；编辑后请使用无元数据注释的 Markdown 重新导入');
  return validateDocument({ id: meta.id, title: meta.title, corpus: meta.corpus, domain: meta.domain, book: meta.book,
    structure: meta.structure, provenance: publicProvenance(meta.provenance), chunking: meta.chunking, text, lineBasis: meta.lineBasis, originalPageMapping: meta.originalPageMapping });
}

module.exports = { FORMAT, MAX_UNIT_BYTES, sha256, chunkMarkdown, validateChunking, encodeUnit, decodeUnit, inferDocument, lineAt };
