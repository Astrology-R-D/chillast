'use strict';

const esm = require('./esm-bridge');
const { PROVIDER_WHITELIST, resolveProviderEntry } = require('./ProviderCatalogWhitelist');

const FALLBACK_OUTPUT_LIMIT = 8192;

/**
 * Engine registry — maps an engine kind (see ProviderCatalogWhitelist) to its
 * LangChain chat model package/class. Everything OpenAI-compatible (deepseek /
 * moonshot / zhipu / … + the custom endpoint) rides ChatOpenAI + baseURL;
 * openai and anthropic (incl. minimax) get their native classes. `emb` is the
 * back-compat embeddings fallback for the openai engine when
 * settings.embeddings is unset.
 */
const ENGINE_MAP = {
  openai: {
    pkg: '@langchain/openai', chatCls: 'ChatOpenAI',
    emb: { pkg: '@langchain/openai', cls: 'OpenAIEmbeddings' }, needsKey: true,
  },
  anthropic: { pkg: '@langchain/anthropic', chatCls: 'ChatAnthropic', emb: null, needsKey: true },
  openai_compat: { pkg: '@langchain/openai', chatCls: 'ChatOpenAI', emb: null, needsKey: true },
  ollama: { pkg: '@langchain/community/chat_models/ollama', chatCls: 'ChatOllama', emb: null, needsKey: false },
};

/**
 * maxTokens resolution order (spec §5):
 *   1. user-set value (kept, but clamped to the model limit — the API would
 *      reject anything above it anyway)
 *   2. catalog limit.output for the selected model
 *   3. conservative 8192 for models the catalog doesn't know
 */
function resolveMaxTokens(userMax, modelLimit) {
  if (Number.isFinite(userMax) && userMax > 0) {
    const floored = Math.floor(userMax);
    return Number.isFinite(modelLimit) && modelLimit > 0 ? Math.min(floored, modelLimit) : floored;
  }
  if (Number.isFinite(modelLimit) && modelLimit > 0) return modelLimit;
  return FALLBACK_OUTPUT_LIMIT;
}

class ModelProvider {
  /** @param {{ load?: Function, catalog?: object }} [deps] — injectable for tests. */
  constructor({ load = esm.load, catalog = null } = {}) {
    this._load = load;
    this._catalog = catalog;
    this._model = null;
    this._embeddings = null;
    this._settings = null;
  }

  /** Whitelist summaries for the settings UI / ai:providers IPC. */
  static listProviders() {
    return PROVIDER_WHITELIST.map(({ key, label, catalogId, needsKey }) => ({ key, label, catalogId, needsKey }));
  }

  async configure(settings) {
    const nextSettings = { ...settings };
    const entry = resolveProviderEntry(settings.provider);
    // Unknown provider ids degrade to OpenAI-compatible semantics (user baseUrl)
    const engine = ENGINE_MAP[entry ? entry.engine : 'openai_compat'] || ENGINE_MAP.openai_compat;

    const mod = await this._load(engine.pkg);
    const ChatCls = mod[engine.chatCls];
    if (typeof ChatCls !== 'function') throw new Error(`AI 提供商模块缺少 ${engine.chatCls}`);

    const modelId = settings.model || '';
    const catalogModel = this._catalog ? this._catalog.getModel(entry ? entry.key : settings.provider, modelId) : null;

    const chatOpts = {
      model: modelId,
      temperature: settings.temperature ?? 0.7,
      maxTokens: resolveMaxTokens(Number(settings.maxTokens), catalogModel ? catalogModel.limitOutput : NaN),
    };

    // baseURL: user override wins (cn/intl switching), then the catalog default.
    const baseUrl = settings.baseUrl
      || (entry && entry.catalogId && this._catalog ? this._catalogBaseUrl(entry) : null)
      || (engine === ENGINE_MAP.ollama ? 'http://localhost:11434' : null);

    if (engine === ENGINE_MAP.ollama) {
      if (baseUrl) chatOpts.baseUrl = baseUrl; // ChatOllama takes baseUrl directly
    } else {
      if (settings.apiKey) chatOpts.apiKey = settings.apiKey;
      if (baseUrl) {
        // ChatOpenAI takes `configuration.baseURL`; ChatAnthropic takes `clientOptions.baseURL`.
        if (engine === ENGINE_MAP.anthropic) {
          // Anthropic SDK appends /v1/messages itself — strip a trailing /v1 from
          // catalog bases (models.dev gives e.g. https://api.minimax.cn/anthropic/v1).
          const anthropicBase = baseUrl.replace(/\/v1\/?$/, '');
          chatOpts.clientOptions = { baseURL: anthropicBase };
        } else {
          chatOpts.configuration = { baseURL: baseUrl };
        }
      }
    }

    const nextModel = engine.needsKey && !settings.apiKey ? null : new ChatCls(chatOpts);
    const nextEmbeddings = await this._resolveEmbeddings(settings, { engine });
    const previousEmbeddings = this._embeddings;

    this._settings = nextSettings;
    this._model = nextModel;
    this._embeddings = nextEmbeddings;

    if (previousEmbeddings && previousEmbeddings !== nextEmbeddings && typeof previousEmbeddings.close === 'function') {
      try { await previousEmbeddings.close(); } catch (_) { /* best-effort after commit */ }
    }
  }

  /** Catalog base URL for a whitelist entry's provider (null when unknown/offline). */
  _catalogBaseUrl(entry) {
    try {
      return this._catalog.getApi(entry.key) || null;
    } catch (_) { return null; }
  }

  /**
   * Build the embeddings model. Embeddings are configured INDEPENDENTLY of the
   * chat provider via settings.embeddings; the engine `emb` entry is only a
   * back-compat fallback for the openai engine.
   */
  async _resolveEmbeddings(settings, { engine }) {
    const emb = settings.embeddings || null;

    if (emb && emb.provider) {
      if (emb.provider === 'none') return null;

      if (emb.provider === 'local') {
        const WorkerEmbeddings = require('./WorkerEmbeddings');
        return new WorkerEmbeddings({
          model: emb.model || 'Xenova/bge-small-zh-v1.5',
          endpoint: process.env.HF_ENDPOINT || emb.endpoint,
          cacheDir: emb.cacheDir,
          localPath: emb.localPath,
          offline: emb.offline,
        });
      }

      const key = emb.apiKey || settings.apiKey;
      if (!key) return null;
      const embMod = await this._load('@langchain/openai');
      const opts = { model: emb.model || 'text-embedding-3-small' };
      if (key) opts.apiKey = key;
      if (emb.baseUrl) opts.configuration = { baseURL: emb.baseUrl };
      return new embMod.OpenAIEmbeddings(opts);
    }

    if (engine.emb && settings.apiKey) {
      const embMod = await this._load(engine.emb.pkg);
      const EmbCls = embMod[engine.emb.cls];
      return new EmbCls({ apiKey: settings.apiKey });
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

  async testConnection() {
    if (!this._model) throw new Error('模型未初始化');
    const response = await this._model.invoke(
      [{ role: 'user', content: 'Hi' }],
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response) throw new Error('API 返回空响应');
    return { ok: true };
  }

  static async testWithSettings(settings) {
    const temp = new ModelProvider();
    await temp.configure(settings);
    return await temp.testConnection();
  }
}

module.exports = ModelProvider;
