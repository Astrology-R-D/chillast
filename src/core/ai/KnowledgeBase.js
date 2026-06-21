'use strict';

const path = require('path');
const fs = require('fs');
const esm = require('./esm-bridge');

class KnowledgeBase {
  constructor(modelProvider) {
    this._mp = modelProvider;
    this._store = null;
    this._docs = [];
    this._userPath = null;
    this._indexDir = null;
    this._ragTopK = 6;
    this._onProgress = null;
  }

  setRagTopK(k) { this._ragTopK = k; }

  /** Register a progress sink for the (slow) first-run index build. */
  setProgressHandler(fn) { this._onProgress = fn; }
  _emit(p) { if (this._onProgress) { try { this._onProgress(p); } catch (_) { /* ignore */ } } }

  async initialize(builtinPath, userDataPath, indexDir) {
    const embeddings = this._mp.embeddings();
    if (!embeddings) return;

    this._indexDir = indexDir || null;
    const { RecursiveCharacterTextSplitter } = await esm.load('langchain/text_splitter');
    const { HNSWLib } = await esm.load('@langchain/community/vectorstores/hnswlib');

    // Try loading persisted index first
    if (this._indexDir && fs.existsSync(this._indexDir)) {
      try {
        this._store = await HNSWLib.load(this._indexDir, embeddings);
        this._docs = this._rebuildDocList(builtinPath, userDataPath);
        this._emit({ phase: 'ready', fromCache: true, docs: this._docs.length });
        return;
      } catch (e) {
        console.error('[KnowledgeBase] load index failed, rebuilding:', e.message);
      }
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n## ', '\n### ', '\n\n', '\n', '。', ''],
    });

    const allChunks = [];

    const loadDir = async (dir, source) => {
      if (!dir || !fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.txt'));
      for (const f of files) {
        const filePath = path.join(dir, f);
        const content = fs.readFileSync(filePath, 'utf-8');
        const docs = await splitter.createDocuments(
          [content],
          [{ source, fileName: f, domain: this._extractDomain(content) }],
        );
        allChunks.push(...docs);
        this._docs.push({ id: filePath, name: f, source, importedAt: new Date().toISOString() });
      }
    };

    await loadDir(builtinPath, 'builtin');
    if (userDataPath) {
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      this._userPath = userDataPath;
      await loadDir(userDataPath, 'user');
    }

    try {
      if (allChunks.length) {
        this._emit({ phase: 'preparing', total: allChunks.length });
        this._store = await this._buildStore(allChunks, embeddings, HNSWLib);
        if (this._indexDir) {
          if (!fs.existsSync(this._indexDir)) fs.mkdirSync(this._indexDir, { recursive: true });
          await this._store.save(this._indexDir);
        }
      }
      this._emit({ phase: 'ready', docs: this._docs.length, chunks: allChunks.length });
    } catch (e) {
      this._emit({ phase: 'error', message: e.message });
      throw e;
    }
  }

  /**
   * Build the vector store in small batches, yielding to the event loop between
   * each so the main process stays responsive (UI + IPC) during the heavy embed,
   * while emitting progress. The first batch triggers the lazy model download.
   */
  async _buildStore(allChunks, embeddings, HNSWLib) {
    const BATCH = 32;
    let store = null;
    for (let i = 0; i < allChunks.length; i += BATCH) {
      const batch = allChunks.slice(i, i + BATCH);
      if (!store) {
        this._emit({ phase: 'model' }); // first embed downloads/loads the model
        store = await HNSWLib.fromDocuments(batch, embeddings);
      } else {
        await store.addDocuments(batch);
      }
      this._emit({ phase: 'indexing', done: Math.min(i + BATCH, allChunks.length), total: allChunks.length });
      await new Promise((r) => setImmediate(r)); // yield: flush IPC, keep UI alive
    }
    return store;
  }

  _extractDomain(content) {
    // Explicit marker (written by the cleaning pipeline) is authoritative and
    // avoids guessing from title wording.
    const marker = content.match(/<!--\s*domain:\s*([a-z-]+)\s*-->/i);
    if (marker) return marker[1].toLowerCase();
    const firstLine = content.split('\n').find((l) => l.trim());
    if (!firstLine) return 'general';
    const title = firstLine.replace(/^#+\s*/, '');
    if (title.includes('行星') || title.includes('落座')) return 'planets-signs';
    if (title.includes('宫位') || title.includes('落宫')) return 'planets-houses';
    if (title.includes('相位')) return 'aspects';
    if (title.includes('格局')) return 'patterns';
    if (title.includes('逆行')) return 'retrograde';
    if (title.includes('行运')) return 'transit';
    if (title.includes('合盘')) return 'synastry';
    if (title.includes('八字') || title.includes('命理')) return 'bazi';
    return 'general';
  }

  _rebuildDocList(builtinPath, userDataPath) {
    const docs = [];
    const scan = (dir, source) => {
      if (!dir || !fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md') && !f.endsWith('.txt')) continue;
        docs.push({ id: path.join(dir, f), name: f, source, importedAt: new Date().toISOString() });
      }
    };
    scan(builtinPath, 'builtin');
    if (userDataPath) scan(userDataPath, 'user');
    return docs;
  }

  async retrieve(query, k) {
    if (!this._store) return [];
    const topK = k || this._ragTopK || 6;
    const results = await this._store.similaritySearch(query, topK);
    return results.map((r) => ({
      content: r.pageContent,
      source: (r.metadata && r.metadata.source) || 'unknown',
      fileName: (r.metadata && r.metadata.fileName) || '',
      domain: (r.metadata && r.metadata.domain) || 'general',
    }));
  }

  listDocuments() {
    return [...this._docs];
  }

  isReady() {
    return this._store !== null;
  }

  async importDocuments(filePaths) {
    const embeddings = this._mp.embeddings();
    if (!embeddings) throw new Error('当前模型不支持嵌入，无法导入文档');

    const { RecursiveCharacterTextSplitter } = await esm.load('langchain/text_splitter');
    const { HNSWLib } = await esm.load('@langchain/community/vectorstores/hnswlib');

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n## ', '\n### ', '\n\n', '\n', '。', ''],
    });

    const allChunks = [];
    for (const filePath of filePaths) {
      const f = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.md' && ext !== '.txt' && ext !== '.pdf') continue;

      let content;
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(buffer);
        content = pdfData.text;
      } else {
        content = fs.readFileSync(filePath, 'utf-8');
      }

      const docs = await splitter.createDocuments([content], [{ source: 'user', fileName: f, domain: this._extractDomain(content) }]);
      allChunks.push(...docs);
      this._docs.push({ id: filePath, name: f, source: 'user', importedAt: new Date().toISOString() });
    }

    if (allChunks.length && this._store) {
      await this._store.addDocuments(allChunks);
    } else if (allChunks.length) {
      this._store = await HNSWLib.fromDocuments(allChunks, embeddings);
    }

    if (this._indexDir && this._store) {
      await this._store.save(this._indexDir);
    }

    return allChunks.length;
  }

  removeDocument(docId) {
    const idx = this._docs.findIndex((d) => d.id === docId);
    if (idx === -1) return false;
    this._docs.splice(idx, 1);
    return true;
  }
}

module.exports = KnowledgeBase;
