'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const esm = require('./esm-bridge');
const { validatePack, MAX_BYTES, sha256 } = require('../../shared/KnowledgePack.cjs');
const { structureMarkdown } = require('../../shared/KnowledgeStructure.cjs');
const { createReader } = require('./KnowledgeRetrieval');
const SPLITTER = { chunkSize: 1000, chunkOverlap: 200, separators: ['\n## ', '\n### ', '\n\n', '\n', '。', ''] };
const legacyCorpus = (metadata) => metadata.corpus || (/八字|四柱|bazi/i.test(metadata.fileName || '') ? 'bazi' : 'astrology');
const recordKey = (id, version) => `${id}@${version}`;

/** Immutable package versions + independently cached indexes, overlaying the legacy KB. */
class KnowledgePackManager {
  constructor({ root, modelProvider, legacy = null, bundledPath = null, onProgress = () => {} }) {
    this.bundledPath = bundledPath;
    this.root = path.resolve(root); this.provider = modelProvider; this.legacy = legacy; this.progress = onProgress;
    this.stateFile = path.join(this.root, 'registry.json');
    this.state = { version: 1, builtinEnabled: true, active: {}, installed: [], hiddenUserDocs: [] };
    this.runtime = new Map(); this.errors = new Map(); this.busy = false;
  }
  async initialize({ prepareIndexes = true } = {}) {
    fs.mkdirSync(this.root, { recursive: true });
    if (fs.existsSync(this.stateFile)) {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.installed) || !saved.active || typeof saved.builtinEnabled !== 'boolean') throw new Error('知识包注册表格式无效');
      this.state = { ...this.state, ...saved };
    }
    this._registerBundledPacks();
    this.legacyFingerprint = this.legacy?._indexDir && fs.existsSync(path.join(this.legacy._indexDir, 'docstore.json'))
      ? sha256(fs.readFileSync(path.join(this.legacy._indexDir, 'docstore.json'))) : 'empty';
    if (prepareIndexes) await this.prepareIndexes();
    return this;
  }
  async prepareIndexes() {
    return this._change(async () => {
      this.legacyFingerprint = this.legacy?._indexDir && fs.existsSync(path.join(this.legacy._indexDir, 'docstore.json'))
        ? sha256(fs.readFileSync(path.join(this.legacy._indexDir, 'docstore.json'))) : 'empty';
      for (const entry of this._activeEntries()) {
        try { await this._prepare(entry); }
        catch (error) { this.errors.set(recordKey(entry.id, entry.version), error.message); }
      }
    });
  }
  _activeEntries() { return this.state.installed.filter((e) => !e.removed && this.state.active[e.id] === e.version); }
  // Register immutable shipped payloads even before an embedding model is ready.
  // Existing selections (including explicit removal/disable) always win.
  _registerBundledPacks() {
    if (!this.bundledPath || !fs.existsSync(this.bundledPath)) return;
    for (const file of fs.readdirSync(this.bundledPath).filter(name => name.endsWith('.kbpack')).sort()) {
      const source = path.join(this.bundledPath, file);
      if (fs.statSync(source).size > MAX_BYTES) throw new Error('随附知识包过大');
      const buffer = fs.readFileSync(source), pack = validatePack(buffer);
      const { id, version, name, description, corpora, documentCount, createdAt } = pack.manifest;
      const old = this.state.installed.find(e => e.id === id && e.version === version);
      if (old) {
        if (old.fingerprint !== pack.fingerprint) throw new Error('随附知识包与已安装同版本内容不一致');
        continue;
      }
      const destination = this._folder(id, version);
      if (!fs.existsSync(destination)) {
        const parent = path.dirname(destination); fs.mkdirSync(parent, { recursive: true });
        const staging = fs.mkdtempSync(path.join(parent, '.bundled-'));
        fs.writeFileSync(path.join(staging, 'package.kbpack'), buffer);
        fs.renameSync(staging, destination);
      } else if (sha256(fs.readFileSync(path.join(destination, 'package.kbpack'))) !== sha256(buffer)) {
        throw new Error('随附知识包目标目录内容不一致');
      }
      const entry = { id, version, name, description, corpora, documentCount, createdAt, fingerprint: pack.fingerprint,
        installedAt: new Date().toISOString(), removed: false, bundled: true };
      const active = { ...this.state.active };
      if (!this.state.installed.some(e => e.id === id)) active[id] = version;
      this._commit({ ...this.state, installed: [...this.state.installed, entry], active });
    }
  }
  _folder(id, version) { return path.join(this.root, 'packs', sha256(id).slice(0, 24), sha256(version).slice(0, 24)); }
  _commit(next) {
    const temp = `${this.stateFile}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next, null, 2)); fs.renameSync(temp, this.stateFile); this.state = next;
  }
  async _change(operation) {
    if (this.busy) throw new Error('知识库正在准备，请等待当前操作完成');
    this.busy = true; try { return await operation(); } finally { this.busy = false; }
  }
  _embeddingKey() {
    const cfg = this.provider._settings?.embeddings || {};
    const embeddings = this.provider.embeddings();
    return sha256(JSON.stringify({ provider: cfg.provider || embeddings?.constructor?.name, model: cfg.model || embeddings?._config?.model || embeddings?.model,
      baseUrl: cfg.baseUrl || null, dimensions: cfg.dimensions || embeddings?.dimensions || null, splitter: SPLITTER, space: 'cosine', metadataVersion: 2, preparedChunkReader: 2 }));
  }
  async _prepare(entry, suppliedPack) {
    const embeddings = this.provider.embeddings();
    if (!embeddings) throw new Error('请先启用嵌入模型，再准备知识包检索索引');
    const pack = suppliedPack || validatePack(fs.readFileSync(path.join(this._folder(entry.id, entry.version), 'package.kbpack')));
    if (pack.fingerprint !== entry.fingerprint || pack.manifest.id !== entry.id || pack.manifest.version !== entry.version) throw new Error('已安装知识包的内容被修改');
    const key = sha256(`${pack.fingerprint}:${this._embeddingKey()}`);
    if (this.runtime.has(key)) return this.runtime.get(key);
    const { HNSWLib } = await esm.load('@langchain/community/vectorstores/hnswlib');
    const cacheRoot = path.join(this.root, 'indexes'); fs.mkdirSync(cacheRoot, { recursive: true });
    const cache = path.join(cacheRoot, key);
    let store;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(cache, 'knowledge-index.json'), 'utf8'));
      if (meta.key !== key || meta.fingerprint !== pack.fingerprint) throw new Error('索引版本不匹配');
      store = await HNSWLib.load(cache, embeddings);
    } catch (_) {
      const chunks = [];
      for (const doc of pack.catalog.documents) {
        const text = pack.files.get(doc.path).toString('utf8');
        const metadata = { source: 'pack', fileName: doc.title, domain: doc.domain, corpus: doc.corpus,
          documentId: `pack:${entry.id}:${doc.id}`, title: doc.title, book: doc.book, provenance: JSON.parse(pack.files.get(doc.provenancePath).toString('utf8')),
          pack: { id: entry.id, name: entry.name, version: entry.version, fingerprint: entry.fingerprint }, lineBasis: 'prepared-text', originalPageMapping: 'unverified' };
        const structure = doc.structure || structureMarkdown(text);
        const sections = new Map(structure.sections.map(section => [section.id, section]));
        for (const range of structure.chunks) {
          const section = sections.get(range.sectionId);
          const pageContent = text.slice(range.start, range.end);
          if (pageContent.trim()) chunks.push({ pageContent, metadata: { ...metadata,
            chapterPath: section.chapterPath, sectionId: section.id, contentType: section.type, tags: section.tags,
            loc: { lines: { from: range.lineStart, to: range.lineEnd } }, preparedChunk: { start: range.start, end: range.end } } });
        }
      }
      if (!chunks.length) throw new Error('知识包没有可检索文本');
      this.progress({ phase: 'preparing', total: chunks.length });
      for (let i = 0; i < chunks.length; i += 32) {
        const batch = chunks.slice(i, i + 32);
        if (!store) this.progress({ phase: 'model' });
        if (store) await store.addDocuments(batch); else store = await HNSWLib.fromDocuments(batch, embeddings);
        this.progress({ phase: 'indexing', done: Math.min(i + 32, chunks.length), total: chunks.length });
        await new Promise((resolve) => setImmediate(resolve));
      }
      const staging = fs.mkdtempSync(path.join(cacheRoot, '.staging-'));
      await store.save(staging);
      fs.writeFileSync(path.join(staging, 'knowledge-index.json'), JSON.stringify({ key, fingerprint: pack.fingerprint, embedding: this._embeddingKey(), splitter: SPLITTER }));
      if (fs.existsSync(cache)) fs.renameSync(cache, `${cache}.old-${randomUUID()}`);
      fs.renameSync(staging, cache);
    }
    const runtime = { key, store, pack, entry }; this.runtime.set(key, runtime); this.errors.delete(recordKey(entry.id, entry.version)); return runtime;
  }
  _runtimeFor(entry) { return this.runtime.get(sha256(`${entry.fingerprint}:${this._embeddingKey()}`)); }
  listPacks() {
    return { builtinEnabled: this.state.builtinEnabled, busy: this.busy,
      legacyDocuments: this.legacy?.listDocuments().length || 0,
      packs: this.state.installed.filter((e) => !e.removed).map((e) => ({ ...e, active: this.state.active[e.id] === e.version,
        ready: Boolean(this._runtimeFor(e)), error: this.errors.get(recordKey(e.id, e.version)) || null })) };
  }
  async inspectPack(filePath) {
    if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.kbpack') throw new Error('请选择 .kbpack 文件');
    const stat = fs.statSync(filePath); if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('知识包文件无效或过大');
    const pack = validatePack(await fs.promises.readFile(filePath));
    return { ...pack.manifest, fingerprint: pack.fingerprint };
  }
  async install(filePath, expectedFingerprint) {
    return this._change(async () => {
      await this.inspectPack(filePath);
      const buffer = await fs.promises.readFile(filePath), pack = validatePack(buffer);
      if (expectedFingerprint && expectedFingerprint !== pack.fingerprint) throw new Error('所选知识包已改变，请重新预览');
      const { id, version, name, description, corpora, documentCount, createdAt } = pack.manifest;
      const old = this.state.installed.find((e) => e.id === id && e.version === version);
      if (old && old.fingerprint !== pack.fingerprint) throw new Error('同一 ID 与版本已有不同内容，请导出新的版本号');
      const entry = { id, version, name, description, corpora, documentCount, createdAt, fingerprint: pack.fingerprint, installedAt: old?.installedAt || new Date().toISOString(), removed: false };
      await this._prepare(entry, pack); // Never change the active selection until this succeeds.
      const destination = this._folder(id, version);
      if (!fs.existsSync(destination)) {
        const parent = path.dirname(destination); fs.mkdirSync(parent, { recursive: true });
        const staging = fs.mkdtempSync(path.join(parent, '.staging-'));
        for (const [name, data] of pack.files) { const file = path.join(staging, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
        fs.writeFileSync(path.join(staging, 'package.kbpack'), buffer); fs.renameSync(staging, destination);
      }
      const installed = this.state.installed.filter((e) => !(e.id === id && e.version === version)); installed.push(entry);
      this._commit({ ...this.state, installed }); this.progress({ phase: 'ready', docs: this.listDocuments().length }); return entry;
    });
  }
  async activate(id, version) {
    return this._change(async () => {
      const entry = this.state.installed.find((e) => !e.removed && e.id === id && e.version === version);
      if (!entry) throw new Error('知识包版本未安装');
      await this._prepare(entry);
      this._commit({ ...this.state, active: { ...this.state.active, [id]: version } }); return this.listPacks();
    });
  }
  async disable(id) { return this._change(async () => { const active = { ...this.state.active }; delete active[id]; this._commit({ ...this.state, active }); return this.listPacks(); }); }
  async setBuiltinEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('知识库启用状态无效');
    return this._change(async () => { this._commit({ ...this.state, builtinEnabled: enabled }); return this.listPacks(); });
  }
  async remove(id, version) {
    return this._change(async () => {
      if (this.state.active[id] === version) throw new Error('请先停用或切换版本，再移除知识包');
      this._commit({ ...this.state, installed: this.state.installed.map((e) => e.id === id && e.version === version ? { ...e, removed: true } : e) });
      // Retain immutable payloads for outstanding snapshots and recoverable reimport.
      return this.listPacks();
    });
  }
  fingerprint() {
    return sha256(JSON.stringify({ legacy: this.legacyFingerprint, builtin: this.state.builtinEnabled, hidden: this.state.hiddenUserDocs,
      packages: this._activeEntries().map((e) => e.fingerprint).sort(), embedding: this._embeddingKey() }));
  }
  createSnapshot() {
    const selected = this._activeEntries().map((e) => this._runtimeFor(e)).filter(Boolean);
    const legacyStore = this.legacy?._store;
    const legacyDocuments = new Set(legacyStore?.docstore._docs.values() || []);
    const builtin = this.state.builtinEnabled, hidden = new Set(this.state.hiddenUserDocs);
    const fingerprint = this.fingerprint();
    const filter = (doc) => (doc.metadata.source === 'pack' || legacyDocuments.has(doc))
      && (doc.metadata.source !== 'builtin' || builtin) && !(doc.metadata.source === 'user' && hidden.has(doc.metadata.fileName));
    const stores = [...(legacyStore ? [legacyStore] : []), ...selected.map(r => r.store)];
    let reader;
    const getReader = () => reader ||= createReader(stores, filter, doc => this._result(doc));
    return { fingerprint, isReady: () => Boolean(legacyStore || selected.length),
      retrieve: (query, k, options) => getReader().search(query, k, options),
      read: (id, radius) => getReader().read(id, radius) };
  }

  _result(doc) {
    const m = doc.metadata || {};
    return { content: doc.pageContent, source: m.source || 'unknown', fileName: m.fileName || '', title: m.title || m.fileName,
      documentId: m.documentId || `${m.source}:${m.fileName}`, domain: m.domain || 'general', corpus: m.source === 'pack' ? m.corpus : legacyCorpus(m),
      location: m.loc?.lines ? { lines: m.loc.lines, basis: m.lineBasis || 'prepared-text', originalPageMapping: 'unverified' } : null,
      ...(m.pack ? { pack: m.pack, provenance: m.provenance, book: m.book } : {}) };
  }
  retrieve(query, k, options) { return this.createSnapshot().retrieve(query, k, options); }
  read(id, radius) { return this.createSnapshot().read(id, radius); }
  isReady() { return this.createSnapshot().isReady(); }
  setRagTopK(k) { this.legacy?.setRagTopK(k); }
  listDocuments() {
    const docs = (this.legacy?.listDocuments() || []).filter((d) => (d.source !== 'builtin' || this.state.builtinEnabled) && !(d.source === 'user' && this.state.hiddenUserDocs.includes(d.name)));
    for (const entry of this._activeEntries()) for (const doc of this._runtimeFor(entry)?.pack.catalog.documents || []) docs.push({
      id: `pack:${entry.id}:${doc.id}`, name: doc.title, source: 'pack', importedAt: entry.installedAt, packId: entry.id, packVersion: entry.version, corpus: doc.corpus, domain: doc.domain,
    });
    return docs;
  }
  async importDocuments(files) {
    if (!this.legacy) throw new Error('请先启用嵌入模型');
    return this._change(async () => {
      const count = await this.legacy.importDocuments(files);
      const names = new Set(files.map((f) => path.basename(f)));
      this._commit({ ...this.state, hiddenUserDocs: this.state.hiddenUserDocs.filter((n) => !names.has(n)) });
      this.legacyFingerprint = this.legacy._indexDir ? sha256(fs.readFileSync(path.join(this.legacy._indexDir, 'docstore.json'))) : randomUUID(); return count;
    });
  }
  async removeDocument(id) {
    return this._change(async () => {
      const doc = this.legacy?.listDocuments().find((d) => d.id === id);
      if (!doc || doc.source !== 'user') return false;
      this._commit({ ...this.state, hiddenUserDocs: [...new Set([...this.state.hiddenUserDocs, doc.name])] }); return true;
    });
  }
}

module.exports = KnowledgePackManager;
