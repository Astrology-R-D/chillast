'use strict';

// Canonical v1 protocol. The preparer's src/vendor copy is byte-identical.
const AdmZip = require('adm-zip');
const { validateChunking } = require('./KnowledgeUnit.cjs');
const { createHash } = require('node:crypto');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const FORMAT = 'chillast.knowledge-pack';
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_FILE = 16 * 1024 * 1024;
const fail = (message) => { throw new Error(`知识包无效：${message}`); };
const json = (buffer) => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); } catch (_) { return fail('JSON 或文本编码无效'); } };
function safePath(value) {
  if (typeof value !== 'string' || value.length > 180 || !value || /[\\\x00-\x1f:*?"<>|]/.test(value) || value.startsWith('/')) return false;
  return value.split('/').every((part) => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function identity(value, field) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(value)) fail(`${field} 格式无效`);
}
function validatePack(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) fail('文件超过 256 MB');
  let entries;
  try { entries = new AdmZip(buffer).getEntries(); } catch (_) { fail('不是有效 ZIP 文件'); }
  if (entries.length > 20002) fail('文件数量过多');
  const files = new Map(), names = new Set(); let total = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    if (entry.isDirectory) { if (!safePath(name.replace(/\/$/, ''))) fail('目录路径无效'); continue; }
    if (!safePath(name) || !/^(manifest\.json|catalog\.json|documents\/[^/]+\.md|provenance\/[^/]+\.json)$/.test(name)) fail('文件路径或类型不受支持');
    if (names.has(name.toLowerCase())) fail('重复文件名');
    names.add(name.toLowerCase());
    if ((entry.attr >>> 16 & 0xf000) === 0xa000 || entry.header.flags & 1) fail('不允许链接或加密文件');
    total += entry.header.size;
    if (entry.header.size > MAX_FILE || total > MAX_BYTES) fail('解压后的文本过大');
    let data; try { data = entry.getData(); } catch (_) { fail('文件校验或解压失败'); }
    if (data.length !== entry.header.size) fail('文件长度不匹配');
    files.set(name, data);
  }
  if (!files.has('manifest.json') || !files.has('catalog.json')) fail('缺少 manifest 或 catalog');
  const manifest = json(files.get('manifest.json')), catalog = json(files.get('catalog.json'));
  if (manifest.format !== FORMAT || manifest.schemaVersion !== 1 || manifest.minReaderVersion !== 1) fail('知识包协议版本不兼容');
  identity(manifest.id, 'ID'); identity(manifest.version, '版本');
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 160) fail('名称无效');
  if (typeof manifest.description !== 'string' || manifest.description.length > 2000 || !Array.isArray(manifest.corpora) || manifest.corpora.length > 100 || manifest.corpora.some((c) => typeof c !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(c))) fail('说明或知识体系无效');
  if (typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))) fail('创建时间无效');
  if (!Array.isArray(manifest.files) || !Array.isArray(catalog.documents) || !catalog.documents.length || catalog.documents.length > 10000) fail('目录为空或无效');
  if (catalog.documents.length !== manifest.documentCount || manifest.files.length !== files.size - 1) fail('清单数量不匹配');
  const listed = new Set();
  for (const file of manifest.files) {
    if (!safePath(file.path) || file.path === 'manifest.json' || listed.has(file.path)) fail('文件清单无效');
    listed.add(file.path);
    const data = files.get(file.path);
    if (!data || data.length !== file.size || sha256(data) !== file.sha256) fail(`内容哈希不匹配：${file.path}`);
  }
  const ids = new Set(), paths = new Set();
  for (const doc of catalog.documents) {
    identity(doc.id, '文档 ID');
    if (ids.has(doc.id) || paths.has(doc.path)) fail('重复文档');
    ids.add(doc.id); paths.add(doc.path);
    if (typeof doc.title !== 'string' || !doc.title.trim() || doc.title.length > 240 || typeof doc.corpus !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(doc.corpus) || typeof doc.domain !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(doc.domain) || !manifest.corpora.includes(doc.corpus)) fail('文档元数据无效');
    if (doc.book && (typeof doc.book !== 'object' || typeof doc.book.title !== 'string' || doc.book.title.length > 240)) fail('书籍元数据无效');
    if (!/^documents\/.+\.md$/.test(doc.path) || !listed.has(doc.path) || !/^provenance\/.+\.json$/.test(doc.provenancePath) || !listed.has(doc.provenancePath)) fail('文档或来源信息缺失');
    if (doc.lineBasis !== 'prepared-text' || doc.originalPageMapping !== 'unverified') fail('引用位置声明不受支持');
    // v1 never claims that reordered prepared text maps reliably to PDF pages.
    const provenance = json(files.get(doc.provenancePath));
    if (!provenance || typeof provenance !== 'object' || (provenance.sourceName !== undefined && typeof provenance.sourceName !== 'string')) fail('来源元数据无效');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(files.get(doc.path)); } catch (_) { fail('Markdown 编码无效'); }
    if (doc.chunking) validateChunking(text, doc.chunking);
  }
  if ([...listed].some((name) => name.startsWith('documents/') && !paths.has(name))) fail('存在未编目的文档');
  return { manifest, catalog, files, fingerprint: sha256(files.get('manifest.json')) };
}

function preparationProvenance(report = {}) {
  const config = report.config || {};
  const publicConfig = Object.fromEntries(['provider', 'model', 'corpus', 'corpusName', 'ocrEngine', 'ocrMode', 'languages', 'denoise', 'split'].filter((k) => k in config).map((k) => [k, config[k]]));
  return { sourceName: String(report.source || '').split(/[\\/]/).at(-1), sourceHash: report.sourceHash || null, title: report.title || '',
    rawChars: report.rawChars, cleanedChars: report.cleanedChars, preservation: report.preservation,
    warnings: report.warnings || [], completedAt: report.completedAt || null, preparation: publicConfig,
    lineBasis: 'prepared-text', originalPageMapping: 'unverified' };
}

function createPack({ id, name, version, description = '', documents, createdAt = new Date().toISOString() }) {
  identity(id, 'ID'); identity(version, '版本');
  if (!Array.isArray(documents) || !documents.length) fail('没有文档');
  const files = new Map(), catalog = { documents: [] };
  for (const doc of documents) {
    const key = sha256(doc.id).slice(0, 32);
    const docPath = `documents/${key}.md`, provenancePath = `provenance/${key}.json`;
    files.set(docPath, Buffer.from(doc.text, 'utf8'));
    files.set(provenancePath, Buffer.from(JSON.stringify(doc.provenance || { lineBasis: 'prepared-text', originalPageMapping: 'unverified' }), 'utf8'));
    catalog.documents.push({ id: doc.id, title: doc.title, corpus: doc.corpus || 'general', domain: doc.domain || 'general',
      book: doc.book || null, ...(doc.chunking ? { chunking: doc.chunking } : {}), path: docPath, provenancePath, lineBasis: 'prepared-text', originalPageMapping: 'unverified' });
  }
  files.set('catalog.json', Buffer.from(JSON.stringify(catalog, null, 2), 'utf8'));
  const manifest = { format: FORMAT, schemaVersion: 1, minReaderVersion: 1, id, name, version, description, createdAt,
    corpora: [...new Set(catalog.documents.map((d) => d.corpus))].sort(), documentCount: catalog.documents.length,
    files: [...files].map(([path, data]) => ({ path, size: data.length, sha256: sha256(data) })).sort((a, b) => a.path.localeCompare(b.path)) };
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  const zip = new AdmZip(); for (const [path, data] of files) zip.addFile(path, data);
  const buffer = zip.toBuffer(); validatePack(buffer); return buffer;
}

module.exports = { FORMAT, MAX_BYTES, sha256, safePath, validatePack, createPack, preparationProvenance };
