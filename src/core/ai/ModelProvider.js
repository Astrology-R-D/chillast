'use strict';

const esm = require('./esm-bridge');

const PROVIDER_MAP = {
  openai:    { chat: ['@langchain/openai', 'ChatOpenAI'],      emb: ['@langchain/openai', 'OpenAIEmbeddings'] },
  anthropic: { chat: ['@langchain/anthropic', 'ChatAnthropic'], emb: null },
  deepseek:  { chat: ['@langchain/openai', 'ChatOpenAI'],      emb: ['@langchain/openai', 'OpenAIEmbeddings'] },
};

class ModelProvider {
  constructor() {
    this._model = null;
    this._embeddings = null;
    this._settings = null;
  }

  async configure(settings) {
    this._settings = { ...settings };
    const provider = settings.provider || 'openai';
    const map = PROVIDER_MAP[provider];
    if (!map) throw new Error(`不支持的 AI 提供商: ${provider}`);

    const [chatPkg, chatClass] = map.chat;
    const mod = await esm.load(chatPkg);
    const ChatCls = mod[chatClass];

    const chatOpts = {
      model: settings.model || 'gpt-4o',
      temperature: settings.temperature ?? 0.7,
      maxTokens: settings.maxTokens ?? 4096,
    };
    if (settings.apiKey) chatOpts.apiKey = settings.apiKey;
    if (provider === 'deepseek' && !settings.baseUrl) {
      chatOpts.configuration = { baseURL: 'https://api.deepseek.com' };
    } else if (settings.baseUrl) {
      chatOpts.configuration = { baseURL: settings.baseUrl };
    }

    this._model = new ChatCls(chatOpts);

    if (map.emb) {
      const [embPkg, embClass] = map.emb;
      const embMod = await esm.load(embPkg);
      const EmbCls = embMod[embClass];
      const embOpts = {};
      if (settings.apiKey) embOpts.apiKey = settings.apiKey;
      if (provider === 'deepseek' && !settings.baseUrl) {
        embOpts.configuration = { baseURL: 'https://api.deepseek.com' };
      } else if (settings.baseUrl) {
        embOpts.configuration = { baseURL: settings.baseUrl };
      }
      this._embeddings = new EmbCls(embOpts);
    } else {
      this._embeddings = null;
    }
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
      { options: { maxTokens: 1 } },
    );
    if (!response) throw new Error('API 返回空响应');
    return { ok: true };
  }
}

module.exports = ModelProvider;
