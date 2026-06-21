'use strict';

// WorkerEmbeddings.js — a LangChain-compatible embeddings proxy whose actual
// inference runs on a worker thread (see EmbeddingWorker.js). It exposes the two
// methods vector stores call — embedDocuments / embedQuery — and forwards them to
// the worker, keeping the main process free during the heavy embed.

const path = require('path');
const { Worker } = require('worker_threads');

class WorkerEmbeddings {
  constructor(config) {
    this._config = config || {};
    this._worker = null;
    this._seq = 0;
    this._pending = new Map();
    this._modelProgressHandler = null;
    // bge-zh retrieval works best when the QUERY is prefixed with this instruction.
    this._instruction = /bge.*zh/i.test(this._config.model || '')
      ? '为这个句子生成表示以用于检索相关文章：'
      : '';
  }

  /** Receive raw Transformers.js download-progress events (status/loaded/total). */
  setModelProgressHandler(fn) { this._modelProgressHandler = fn; }

  _ensureWorker() {
    if (this._worker) return;
    // worker_threads can't load from inside app.asar; point at the unpacked copy
    // (electron-builder asarUnpack) when packaged.
    let workerPath = path.join(__dirname, 'EmbeddingWorker.js');
    if (workerPath.includes(`app.asar${path.sep}`) && !workerPath.includes('app.asar.unpacked')) {
      workerPath = workerPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    }
    this._worker = new Worker(workerPath, { workerData: this._config });
    this._worker.on('message', (msg) => {
      if (msg && msg.type === 'model-progress') {
        if (this._modelProgressHandler) {
          try { this._modelProgressHandler(msg.data); } catch (_) { /* ignore */ }
        }
        return;
      }
      const p = this._pending.get(msg.id);
      if (!p) return;
      this._pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.vectors);
      else p.reject(new Error(msg.error || 'embedding failed'));
    });
    const failAll = (err) => {
      for (const p of this._pending.values()) p.reject(err);
      this._pending.clear();
    };
    this._worker.on('error', (err) => failAll(err));
    this._worker.on('exit', (code) => {
      this._worker = null;
      if (code !== 0) failAll(new Error(`embedding worker exited with code ${code}`));
    });
  }

  _send(texts) {
    this._ensureWorker();
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ id, type: 'embed', texts });
    });
  }

  /** Pre-load the model in the worker (download/load from cache) without embedding. */
  warmup() {
    this._ensureWorker();
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ id, type: 'load' });
    });
  }

  async embedDocuments(texts) {
    if (!texts || !texts.length) return [];
    return this._send(texts);
  }

  async embedQuery(text) {
    const q = this._instruction ? `${this._instruction}${text}` : text;
    const vectors = await this._send([q]);
    return vectors[0];
  }

  async close() {
    if (this._worker) {
      try { await this._worker.terminate(); } catch (_) { /* best-effort */ }
      this._worker = null;
    }
  }
}

module.exports = WorkerEmbeddings;
