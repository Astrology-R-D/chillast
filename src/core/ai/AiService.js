'use strict';

const ModelProvider = require('./ModelProvider');
const KnowledgeBase = require('./KnowledgeBase');
const ChainFactory = require('./ChainFactory');
const ToolRegistry = require('./tools/ToolRegistry');
const AstroToolProvider = require('./tools/AstroToolProvider');
const ContextToolProvider = require('./tools/ContextToolProvider');
const KnowledgeToolProvider = require('./tools/KnowledgeToolProvider');
const WebSearchToolProvider = require('./tools/WebSearchToolProvider');
const ProfileToolProvider = require('./tools/ProfileToolProvider');
const McpToolProvider = require('./tools/McpToolProvider');
const McpManager = require('./mcp/McpManager');
const { build: buildChatPrompt } = require('./prompts/ChatPrompt');
const { toText } = require('./prompts/ChartSerializer');
const esm = require('./esm-bridge');

class AiService {
  constructor(astrologyService, chineseAstrologyService, profileRepository, { catalog = null, esm: esmImpl = esm } = {}) {
    this._astrology = astrologyService;
    this._chinese = chineseAstrologyService;
    this._profiles = profileRepository || null;
    this._catalog = catalog;
    this._esm = esmImpl;
    this._mp = new ModelProvider(catalog ? { catalog } : {});
    this._kb = null;
    this._chainFactory = null;
    this._registry = null;
    this._mcpManager = null;
    this._configured = false;
    this._abortControllers = new Map();
    this._context = null;
    this._initProgress = null;
    this._initProgressHandler = null;
    this._kbInitializing = false;
    this._lastSettings = null;
  }

  /** Sink for knowledge-base init progress (model download + index build). */
  setInitProgressHandler(fn) { this._initProgressHandler = fn; }
  getInitStatus() { return this._initProgress; }
  _emitInit(p) {
    this._initProgress = p;
    if (this._initProgressHandler) { try { this._initProgressHandler(p); } catch (_) { /* ignore */ } }
  }

  async configure(settings) {
    // Re-configures from the settings UI only carry chat fields (provider/model/
    // key/…). Merge over the first (startup) settings so server-owned fields —
    // knowledge paths, embeddings, search — are never lost, else the KB silently
    // stops loading after the user saves a key.
    const merged = { ...(this._lastSettings || {}), ...settings };
    let accepted = false;
    let configureError = null;

    // A failed chat-model build (e.g. no key yet) must NOT abort KB/tool init.
    try {
      await this._mp.configure(merged);
      this._lastSettings = merged;
      accepted = true;
    } catch (e) {
      configureError = e && e.message ? e.message : String(e);
      console.error('[AiService] model provider configure failed (continuing):', e.message);
    }
    settings = accepted ? merged : (this._lastSettings || merged);

    // Surface local embedding-model download progress in the startup overlay —
    // but ONLY while the KB index is initializing. A model load triggered later
    // (e.g. the first chat query, or the silent warm-up) must not pop the overlay.
    const emb = this._mp.embeddings();
    if (emb && typeof emb.setModelProgressHandler === 'function') {
      emb.setModelProgressHandler((d) => {
        if (this._kbInitializing && d && d.status === 'progress' && d.total) {
          this._emitInit({ phase: 'model', percent: Math.round((d.loaded / d.total) * 100), file: d.file });
        }
      });
    }

    // Verify chat model works — don't block on failure, just log
    if (accepted && this._mp.isConfigured()) {
      try {
        await this._mp.testConnection();
      } catch (e) {
        console.error('[AiService] Chat model test failed:', e.message);
        // Don't throw — user may still want to use the service with a different model later
      }
    }

    // KB initialization — skip if enableRag is explicitly false
    if (settings.enableRag === false) {
      this._kb = null;
    } else {
      try {
        this._kb = new KnowledgeBase(this._mp);
        this._kb.setRagTopK(settings.ragTopK || 6);
        this._kb.setProgressHandler((p) => this._emitInit(p));
        if (settings.knowledgeBuiltinPath) {
          this._emitInit({ phase: 'preparing' });
          this._kbInitializing = true;
          try {
            await this._kb.initialize(settings.knowledgeBuiltinPath, settings.knowledgeUserPath || null, settings.knowledgeIndexDir || null);
          } finally {
            this._kbInitializing = false;
          }
          // Warm the embedding model up in the background (silent — no overlay) so
          // the first retrieval query doesn't pay the model-load cost on demand.
          if (emb && typeof emb.warmup === 'function') {
            emb.warmup().catch(() => { /* best-effort */ });
          }
        }
      } catch (e) {
        console.error('[AiService] KnowledgeBase init failed, continuing without RAG:', e.message);
        this._kbInitializing = false;
        this._emitInit({ phase: 'error', message: e.message });
        this._kb = null;
      }
    }

    // Build the pluggable tool registry. Adding a capability later = register a
    // new provider here (or an MCP provider) — the agent loop never changes.
    try {
      if (this._registry) await this._registry.disposeAll();
      this._mcpManager = new McpManager(settings.mcpServers || {});
      this._registry = new ToolRegistry();
      this._registry.register(new AstroToolProvider(this._astrology, this._chinese));
      this._registry.register(new ContextToolProvider(this));
      this._registry.register(new ProfileToolProvider(this._profiles));
      this._registry.register(new KnowledgeToolProvider(this._kb));
      this._registry.register(new WebSearchToolProvider(settings.search));
      // External MCP servers (off unless explicitly enabled in mcpServers config).
      this._registry.register(new McpToolProvider(this._mcpManager));
      await this._registry.initAll();
      // Apply persisted per-provider enable preferences.
      if (settings.toolProviders) {
        for (const [id, en] of Object.entries(settings.toolProviders)) {
          this._registry.setEnabled(id, !!en);
        }
      }
    } catch (e) {
      console.error('[AiService] Tool registry init failed:', e.message);
      this._registry = new ToolRegistry();
    }

    this._chainFactory = new ChainFactory(this._mp, this._kb);
    this._configured = this._mp.isConfigured();
    return accepted ? { accepted: true } : { accepted: false, error: configureError };
  }

  /** Expose the tool registry (for the settings UI / introspection). */
  getToolRegistry() { return this._registry; }

  /** Expose the MCP manager (server list / status for the settings UI). */
  getMcpManager() { return this._mcpManager; }

  /**
   * Replace the MCP server set live (from the settings UI) without a full
   * reconfigure: swap the 'mcp' provider, reconnecting only enabled servers.
   */
  async updateMcp(servers) {
    if (!this._registry) return;
    const old = this._registry.unregister('mcp');
    if (old) { try { await old.dispose(); } catch (_) { /* best-effort */ } }
    this._mcpManager = new McpManager(servers || {});
    const provider = new McpToolProvider(this._mcpManager);
    this._registry.register(provider);
    try { await provider.init(); }
    catch (e) { console.error('[AiService] MCP update failed:', e.message); }
  }

  status() {
    return {
      configured: this._mp.isConfigured(),
      provider: (this._mp._settings && this._mp._settings.provider) || '',
      model: (this._mp._settings && this._mp._settings.model) || '',
      baseUrl: (this._mp._settings && this._mp._settings.baseUrl) || '',
      temperature: this._mp._settings && this._mp._settings.temperature,
      maxTokens: this._mp._settings && this._mp._settings.maxTokens,
      knowledgeDocCount: this._kb ? this._kb.listDocuments().length : 0,
    };
  }

  async testConnection() {
    if (!this._configured) throw new Error('AI 服务未配置');
    return await this._mp.testConnection();
  }

  /**
   * Test connectivity with given settings WITHOUT persisting.
   * Used by the settings page "test connection" button before saving.
   * @param {object} settings — { provider, model, apiKey, baseUrl, temperature, maxTokens }
   */
  async testWithSettings(settings) {
    const ModelProvider = require('./ModelProvider');
    return await ModelProvider.testWithSettings(settings, this._catalog);
  }

  getKnowledgeBase() { return this._kb; }

  getCatalogProviders() { return this._catalog ? this._catalog.getProviders() : []; }
  getCatalogModels(providerKey) { return this._catalog ? this._catalog.getModels(providerKey) : []; }

  setContext(context) {
    this._context = context;
  }

  getContext() {
    return this._context || {};
  }

  /**
   * Interpret a chart — one-shot RAG + prompt -> stream.
   * @param {object} chartData - ChartData DTO from AstrologyService
   * @param {object} [options]
   * @yields {{ type: 'token'|'done', data: string|object }}
   */
  async *interpret(chartData, options = {}) {
    this._ensureConfigured();
    const sessionId = options.sessionId || String(Date.now());
    const ac = new AbortController();
    this._abortControllers.set(sessionId, ac);

    try {
      const chartText = toText(chartData);
      const chartType = options.chartType || (chartData.meta && chartData.meta.typeNameZh) || '星盘';
      const stream = await this._chainFactory.buildInterpretStream(chartText, chartType, ac.signal);

      let finishReason = null;
      for await (const chunk of stream) {
        if (ac.signal.aborted) break;
        const token = typeof chunk === 'string' ? chunk : (chunk.content || '');
        if (token) yield { type: 'token', data: token };
        const fr = this._finishReason(chunk);
        if (fr) finishReason = fr;
      }
      if (finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };
    } finally {
      this._abortControllers.delete(sessionId);
    }
    yield { type: 'done', data: { sessionId } };
  }

  /**
   * Interactive chat via a LangGraph ReAct agent. The agent owns the
   * tool-calling loop and tool execution; tools come from the ToolRegistry, so
   * the model autonomously chooses among compute / knowledge / (future) MCP
   * tools. We translate the agent's event stream into token / tool-call events.
   * @param {Array} userMessages - [{ role: 'user'|'assistant'|'ai', content }]
   * @param {object} [context]
   * @yields {{ type: 'token'|'tool-call'|'done', data }}
   */
  async *chat(userMessages, context = {}) {
    this._ensureConfigured();
    const sessionId = context.sessionId || String(Date.now());
    const ac = new AbortController();
    this._abortControllers.set(sessionId, ac);

    try {
      const model = this._mp.chatModel();
      const tools = this._registry ? await this._registry.getTools() : [];
      const systemPrompt = buildChatPrompt(context.currentChartText || null);

      const { createReactAgent } = await this._esm.load('@langchain/langgraph/prebuilt');
      const { HumanMessage, AIMessage } = await this._esm.load('@langchain/core/messages');

      const agent = createReactAgent({ llm: model, tools, prompt: systemPrompt });

      const lcMessages = [];
      for (const m of userMessages) {
        if (!m || !m.content) continue;
        if (m.role === 'user') lcMessages.push(new HumanMessage(m.content));
        // Session store persists AI turns as role 'ai'; map to assistant message.
        else if (m.role === 'assistant' || m.role === 'ai') lcMessages.push(new AIMessage(m.content));
      }

      const stream = await agent.stream(
        { messages: lcMessages },
        { streamMode: ['messages', 'updates'], signal: ac.signal, recursionLimit: 25 },
      );

      let finishReason = null;
      try {
        for await (const chunk of stream) {
          if (ac.signal.aborted) break;
          const [mode, payload] = chunk;

          if (mode === 'messages') {
            // payload = [messageChunk, metadata]; stream only AI text tokens.
            const msg = Array.isArray(payload) ? payload[0] : payload;
            if (msg && this._msgType(msg) === 'ai') {
              const text = this._extractText(msg.content);
              if (text) yield { type: 'token', data: text };
              const fr = this._finishReason(msg);
              if (fr) finishReason = fr;
            }
          } else if (mode === 'updates') {
            // payload = { nodeName: { messages: [...] } }; surface tool activity.
            for (const node of Object.keys(payload || {})) {
              const msgs = (payload[node] && payload[node].messages) || [];
              for (const m of msgs) {
                const t = this._msgType(m);
                if (t === 'ai' && m.tool_calls && m.tool_calls.length) {
                  for (const tc of m.tool_calls) {
                    yield { type: 'tool-call', data: { tool: tc.name, status: 'calling' } };
                  }
                } else if (t === 'tool') {
                  yield { type: 'tool-call', data: { tool: m.name, status: 'done' } };
                }
              }
            }
          }
        }
        if (finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };
      } catch (e) {
        // A user-initiated stop aborts the stream; treat that as a clean end.
        if (!ac.signal.aborted) throw e;
      }
    } finally {
      this._abortControllers.delete(sessionId);
    }
    yield { type: 'done', data: { sessionId } };
  }

  /** Robustly read a LangChain message's type across versions. */
  _msgType(msg) {
    if (typeof msg.getType === 'function') return msg.getType();
    if (typeof msg._getType === 'function') return msg._getType();
    return '';
  }

  /**
   * Read a chunk's stop signal across LangChain model families.
   * OpenAI-family: response_metadata.finish_reason ('length' = output cap hit).
   * Anthropic-family (incl. MiniMax): additional_kwargs.stop_reason
   * ('max_tokens' = output cap hit) — normalized to 'length' here.
   * ChatOllama surfaces no stop reason at all — truncation is undetectable there.
   */
  _finishReason(chunk) {
    if (!chunk || typeof chunk !== 'object') return null;
    const meta = chunk.response_metadata || null;
    const finish = meta && meta.finish_reason;
    if (finish) return finish === 'max_tokens' ? 'length' : String(finish);
    const stop = (meta && meta.stop_reason)
      || (chunk.additional_kwargs && chunk.additional_kwargs.stop_reason);
    if (stop) return stop === 'max_tokens' ? 'length' : String(stop);
    return null;
  }

  /** Normalize message content (string or content-part array) to text. */
  _extractText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('');
    }
    return '';
  }

  /**
   * Generate a short conversation title (≤12 Chinese chars) from messages.
   * Uses a single non-streaming LLM call. Returns '' on any failure so the
   * caller can fall back to the first user message.
   * @param {Array} messages - [{ role, content }]
   */
  async summarizeTitle(messages) {
    if (!this._configured) return '';
    const model = this._mp.chatModel();
    if (!model) return '';
    const convo = (messages || [])
      .filter((m) => m && m.content)
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n')
      .slice(0, 2000);
    if (!convo) return '';
    try {
      const { SystemMessage, HumanMessage } = await this._esm.load('@langchain/core/messages');
      const res = await model.invoke([
        new SystemMessage('你是对话标题生成器。根据对话内容用不超过12个汉字概括主题，只输出标题本身，不要任何标点、引号或解释。'),
        new HumanMessage(convo),
      ]);
      let title = typeof res === 'string' ? res : (res && res.content) || '';
      if (Array.isArray(title)) {
        title = title.map((p) => (typeof p === 'string' ? p : p.text || '')).join('');
      }
      return String(title)
        .replace(/[\r\n]+/g, ' ')
        .replace(/^["'「『《\s]+|["'」』》\s]+$/g, '')
        .slice(0, 20)
        .trim();
    } catch (_) {
      return '';
    }
  }

  stop(sessionId) {
    const ac = this._abortControllers.get(sessionId);
    if (ac) {
      ac.abort();
      this._abortControllers.delete(sessionId);
    }
  }

  async close() {
    for (const ac of this._abortControllers.values()) ac.abort();
    this._abortControllers.clear();
    if (this._registry) {
      try { await this._registry.disposeAll(); } catch (_) { /* best-effort */ }
    }
    if (this._mp && typeof this._mp.close === 'function') {
      try { await this._mp.close(); } catch (_) { /* best-effort */ }
    }
  }

  _ensureConfigured() {
    if (!this._configured) throw new Error('AI 服务未配置，请先在设置中配置 API Key');
  }
}

module.exports = AiService;
