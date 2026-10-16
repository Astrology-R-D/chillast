'use strict';

const esm = require('./esm-bridge');
const { PROVIDER_WHITELIST, resolveProviderEntry } = require('./ProviderCatalogWhitelist');
const { modelTokenLimits, resolveTokenBudget } = require('./TokenBudget');
const { diagnostics } = require('../diagnostics/DiagnosticLog');

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
    diagnostics.registerSecrets(settings);
    if (settings.maxTokensMode !== undefined && !['custom', 'context'].includes(settings.maxTokensMode)) throw new Error('输出额度模式无效');
    for (const key of ['contextWindow', 'maxOutputTokens']) {
      if (settings[key] !== undefined && (!Number.isSafeInteger(settings[key]) || settings[key] < 0)) throw new Error('模型上下文参数必须为非负整数');
    }
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
      maxTokens: resolveTokenBudget(settings, modelTokenLimits(settings, catalogModel)),
    };
    if (engine === ENGINE_MAP.ollama) chatOpts.numPredict = chatOpts.maxTokens;

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
    if (nextModel && modelTokenLimits(settings, catalogModel).context) {
      const limits = modelTokenLimits(settings, catalogModel);
      // LangGraph binds the tool schemas before these model methods run. Recalculate
      // for each invocation, including new tool results, without mutating shared settings.
      for (const method of ['_generate', '_streamResponseChunks']) {
        const original = nextModel[method];
        if (typeof original !== 'function') continue;
        nextModel[method] = function(messages, options, runManager) {
          const maxTokens = resolveTokenBudget(settings, limits, messages, options?.tools);
          const scoped = new ChatCls({ ...chatOpts, maxTokens, ...(engine === ENGINE_MAP.ollama ? { numPredict: maxTokens } : {}) });
          return original.call(scoped, messages, options, runManager);
        };
      }
    }
    const nextEmbeddings = await this._resolveEmbeddings(settings, { engine });
    const previousEmbeddings = this._embeddings;

    this._settings = nextSettings;
    this._resolvedBaseUrl = baseUrl;
    this._model = nextModel;
    this._modelFactory = (maxTokens) => new ChatCls({ ...chatOpts, maxTokens: Math.min(maxTokens, chatOpts.maxTokens || Infinity), ...(engine === ENGINE_MAP.ollama ? { numPredict: maxTokens } : {}) });
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

  chatModel(maxTokens) { return maxTokens && this._modelFactory ? this._modelFactory(maxTokens) : this._model; }
  embeddings() { return this._embeddings; }
  isConfigured() { return this._model !== null; }

  async testConnection({ timeoutMs = 60000 } = {}) {
    if (!this._model) throw new Error('模型未初始化');
    const signal = AbortSignal.timeout(timeoutMs);
    const started = Date.now();
    const details = { provider: this._settings?.provider, model: this._settings?.model, endpoint: this._resolvedBaseUrl, timeoutMs };
    diagnostics.info('ai-connection-test-start', details);
    try {
      // A connectivity probe should not inherit an unlimited generation budget.
      const response = await this.chatModel(1024).invoke(
        [{ role: 'user', content: 'This is an API connectivity test. Reply only OK.' }], { signal },
      );
      if (!response) throw new Error('API 返回空响应');
      diagnostics.info('ai-connection-test-success', { ...details, durationMs: Date.now() - started });
      return { ok: true };
    } catch (error) {
      const status = error.status || error.response?.status;
      const code = error.code || error.cause?.code;
      const timedOut = signal.aborted || /timeout|timed out/i.test(`${error.name} ${error.message}`);
      diagnostics.error('ai-connection-test-failed', { ...details, durationMs: Date.now() - started, status, code, timedOut, error });
      let message;
      if (timedOut) message = `AI 连接测试超时（${Math.ceil(timeoutMs / 1000)} 秒），未收到完整响应。请检查 API 地址、网络/代理及模型响应速度；可在设置中导出诊断日志。`;
      else if (status === 401 || status === 403) message = `AI API 认证或权限失败（HTTP ${status}），请检查 API Key 和模型访问权限。`;
      else if (status === 404) message = 'AI API 返回 HTTP 404，请检查 API 地址、接口协议和模型名称。';
      else if (status === 429) message = 'AI API 返回 HTTP 429，可能达到请求限额或账户额度，请查看服务商状态。';
      else if (status >= 500) message = `AI 服务商暂时不可用（HTTP ${status}），请稍后重试。`;
      else if (/abort/i.test(`${error.name} ${error.message}`)) message = 'AI 连接测试被中止，请重试；若持续出现，可在设置中导出诊断日志。';
      else if (/ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|connection error/i.test(`${code || ''} ${error.message}`)) message = '无法连接 AI API，请检查 API 地址、网络/代理或证书；可在设置中导出诊断日志。';
      else message = error.message || 'AI 连接测试失败，可在设置中导出诊断日志。';
      throw new Error(message, { cause: error });
    }
  }

  /**
   * Test connectivity with given settings WITHOUT persisting. `catalog` resolves
   * catalog-driven endpoints exactly like the save path (final-review blocker);
   * `load` is the same injectable loader seam as the constructor (tests).
   */
  static async testWithSettings(settings, catalog = null, load = esm.load) {
    const temp = new ModelProvider(catalog ? { catalog, load } : { load });
    try {
      // Testing chat connectivity must not create an embeddings worker or require RAG.
      await temp.configure({ ...settings, embeddings: { provider: 'none' } });
      return await temp.testConnection();
    } finally { await temp.close(); }
  }
}

module.exports = ModelProvider;
module.exports.ENGINE_MAP = ENGINE_MAP;
