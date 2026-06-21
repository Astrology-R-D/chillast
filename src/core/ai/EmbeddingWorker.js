'use strict';

// EmbeddingWorker.js — runs the local embedding model (Transformers.js +
// onnxruntime) on a worker thread, so the heavy inference never blocks the main
// process event loop (UI stays fully responsive during the first-run index build).
//
// Protocol (main → worker):  { id, type: 'embed' | 'load', texts? }
//          (worker → main):  { id, ok, vectors? , error? }   or
//                            { type: 'model-progress', data }   (download progress)

const { parentPort, workerData } = require('worker_threads');

let pipePromise = null;

// Lazily create the feature-extraction pipeline. The first call downloads the
// model (reporting progress); subsequent calls reuse it.
function getPipeline() {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    const cfg = workerData || {};
    if (cfg.endpoint) env.remoteHost = cfg.endpoint;
    if (cfg.cacheDir) env.cacheDir = cfg.cacheDir;
    if (cfg.localPath) env.localModelPath = cfg.localPath;
    if (cfg.offline) env.allowRemoteModels = false;
    const model = cfg.model || 'Xenova/bge-small-zh-v1.5';
    return pipeline('feature-extraction', model, {
      progress_callback: (p) => {
        try { parentPort.postMessage({ type: 'model-progress', data: p }); } catch (_) { /* ignore */ }
      },
    });
  })();
  return pipePromise;
}

async function embed(texts) {
  const extractor = await getPipeline();
  // Mean-pool + normalize → sentence embeddings (matches LangChain's wrapper).
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

parentPort.on('message', async (msg) => {
  const { id, type, texts } = msg || {};
  try {
    if (type === 'embed') {
      parentPort.postMessage({ id, ok: true, vectors: await embed(texts) });
    } else if (type === 'load') {
      await getPipeline();
      parentPort.postMessage({ id, ok: true });
    }
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
});
