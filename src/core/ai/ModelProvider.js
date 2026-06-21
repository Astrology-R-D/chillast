'use strict';

const esm = require('./esm-bridge');

/**
 * Provider registry — each entry maps an engine key to its LangChain chat
 * model class and optional embeddings class.
 *
 * `pkg` is the ESM module path (loaded via dynamic import).
 * `chatCls` is the named export for the chat model.
 * `emb` is optional: `{ pkg, cls }` for embeddings. null = no embeddings.
 * `needsKey` — false for local providers like Ollama.
 * `defaults` — provider-specific default options merged into chatOpts.
 */
const PROVIDER_MAP = {
  openai: {
    pkg: '@langchain/openai', chatCls: 'ChatOpenAI',
    emb: { pkg: '@langchain/openai', cls: 'OpenAIEmbeddings' },
    needsKey: true,
    defaults: { model: 'gpt-4o' },
  },
  anthropic: {
    pkg: '@langchain/anthropic', chatCls: 'ChatAnthropic',
    emb: null,
    needsKey: true,
    defaults: { model: 'claude-sonnet-4-6' },
  },
  deepseek: {
    pkg: '@langchain/openai', chatCls: 'ChatOpenAI',
    emb: { pkg: '@langchain/openai', cls: 'OpenAIEmbeddings' },
    needsKey: true,
    defaults: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  },
  moonshot: {
    pkg: '@langchain/community/chat_models/moonshot', chatCls: 'ChatMoonshot',
    emb: null,
    needsKey: true,
    defaults: { model: 'moonshot-v1-8k' },
  },
  zhipuai: {
    pkg: '@langchain/community/chat_models/zhipuai', chatCls: 'ChatZhipuAI',
    emb: null,
    needsKey: true,
    defaults: { model: 'glm-4' },
  },
  tongyi: {
    pkg: '@langchain/community/chat_models/alibaba_tongyi', chatCls: 'ChatAlibabaTongyi',
    emb: null,
    needsKey: true,
    defaults: { model: 'qwen-max' },
  },
  ollama: {
    pkg: '@langchain/community/chat_models/ollama', chatCls: 'ChatOllama',
    emb: null,
    needsKey: false,
    defaults: { model: 'qwen2.5:7b', baseUrl: 'http://localhost:11434' },
  },
  openai_compat: {
    pkg: '@langchain/openai', chatCls: 'ChatOpenAI',
    emb: null,
    needsKey: true,
    defaults: { model: '' },
  },
};

class ModelProvider {
  constructor() {
    this._model = null;
    this._embeddings = null;
    this._settings = null;
  }

  static listProviders() {
    return Object.entries(PROVIDER_MAP).map(([key, def]) => ({
      key,
      needsKey: def.needsKey,
      defaultModel: def.defaults.model || '',
      defaultBaseUrl: def.defaults.baseUrl || '',
    }));
  }

  async configure(settings) {
    this._settings = { ...settings };
    const provider = settings.provider || 'openai';
    const map = PROVIDER_MAP[provider];
    if (!map) throw new Error(`不支持的 AI 提供商: ${provider}`);

    const mod = await esm.load(map.pkg);
    const ChatCls = mod[map.chatCls];

    // Merge defaults with user settings
    const defaults = map.defaults || {};
    const chatOpts = {
      model: settings.model || defaults.model || 'gpt-4o',
      temperature: settings.temperature ?? 0.7,
      maxTokens: settings.maxTokens ?? 4096,
    };

    // Provider-specific option wiring
    const baseUrl = settings.baseUrl || defaults.baseUrl;

    if (provider === 'ollama') {
      // ChatOllama uses baseUrl directly, not inside configuration
      if (baseUrl) chatOpts.baseUrl = baseUrl;
    } else {
      if (settings.apiKey) chatOpts.apiKey = settings.apiKey;
      if (baseUrl) chatOpts.configuration = { baseURL: baseUrl };
    }

    this._model = new ChatCls(chatOpts);

    // Tear down a previous embeddings worker (if any) before building the new one.
    if (this._embeddings && typeof this._embeddings.close === 'function') {
      try { await this._embeddings.close(); } catch (_) { /* best-effort */ }
    }
    this._embeddings = await this._resolveEmbeddings(settings, { provider, baseUrl, map });
  }

  /**
   * Build the embeddings model. Embeddings are configured INDEPENDENTLY of the
   * chat provider (e.g. DeepSeek has no embeddings API), via settings.embeddings:
   *   { provider: 'local', model, endpoint, localPath, offline, cacheDir }
   *   { provider: 'openai' | 'openai_compat', model, baseUrl, apiKey }
   *   { provider: 'none' }
   * Falls back to the chat provider's embeddings for back-compat when unset.
   */
  async _resolveEmbeddings(settings, { provider, baseUrl, map }) {
    const emb = settings.embeddings || null;

    if (emb && emb.provider) {
      if (emb.provider === 'none') return null;

      if (emb.provider === 'local') {
        // Local, offline-capable Chinese embeddings via Transformers.js (no API
        // key). Inference runs on a WORKER THREAD so the heavy embed never blocks
        // the main process during the first-run index build.
        const WorkerEmbeddings = require('./WorkerEmbeddings');
        return new WorkerEmbeddings({
          model: emb.model || 'Xenova/bge-small-zh-v1.5',
          endpoint: process.env.HF_ENDPOINT || emb.endpoint,
          cacheDir: emb.cacheDir,
          localPath: emb.localPath,
          offline: emb.offline,
        });
      }

      // openai / openai_compat / any OpenAI-compatible embeddings endpoint.
      const embMod = await esm.load('@langchain/openai');
      const opts = { model: emb.model || 'text-embedding-3-small' };
      const key = emb.apiKey || settings.apiKey;
      if (key) opts.apiKey = key;
      if (emb.baseUrl) opts.configuration = { baseURL: emb.baseUrl };
      return new embMod.OpenAIEmbeddings(opts);
    }

    // Back-compat: derive from the chat provider's embeddings (if it has any).
    if (map && map.emb) {
      const embMod = await esm.load(map.emb.pkg);
      const EmbCls = embMod[map.emb.cls];
      const opts = {};
      if (settings.apiKey) opts.apiKey = settings.apiKey;
      if (baseUrl && provider !== 'ollama') opts.configuration = { baseURL: baseUrl };
      return new EmbCls(opts);
    }
    return null;
  }

  /** Release the embeddings worker thread (if local). */
  async close() {
    if (this._embeddings && typeof this._embeddings.close === 'function') {
      try { await this._embeddings.close(); } catch (_) { /* best-effort */ }
    }
    this._embeddings = null;
  }

  chatModel() { return this._model; }
  embeddings() { return this._embeddings; }
  isConfigured() { return this._model !== null; }

  /**
   * Test LLM connectivity by sending a minimal 1-token prompt.
   * @returns {Promise<{ ok: true }>}
   * @throws {Error} if the model is not configured or the API call fails
   */
  async testConnection() {
    if (!this._model) throw new Error('模型未初始化');
    const response = await this._model.invoke(
      [{ role: 'user', content: 'Hi' }],
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response) throw new Error('API 返回空响应');
    return { ok: true };
  }

  /**
   * Test connectivity with given settings WITHOUT persisting configuration.
   * Creates a temporary ModelProvider, configures it, and tests.
   * @param {object} settings — same shape as configure()
   * @returns {Promise<{ ok: true }>}
   */
  static async testWithSettings(settings) {
    const temp = new ModelProvider();
    await temp.configure(settings);
    return await temp.testConnection();
  }
}

module.exports = ModelProvider;
