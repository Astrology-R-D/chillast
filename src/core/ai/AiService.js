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
const ConversationToolProvider = require('./tools/ConversationToolProvider');
const { build: buildChatPrompt } = require('./prompts/ChatPrompt');
const { toText } = require('./prompts/ChartSerializer');
const esm = require('./esm-bridge');
const { ContextManager, contextHistory } = require('./ContextManager');
const { chartToolResult, hash } = require('./ToolResult');
const { ANALYST_PROMPT, parseReport, reportCatalog, writerPrompt, needsAnalysis, hasReportContent } = require('./AnalysisProtocol');

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

    // Package selection is independent of chat configurations and the legacy index.
    this._packs = null;
    if (settings.knowledgePackPath) {
      try {
        this._packs = await new (require('./KnowledgePackManager'))({ root: settings.knowledgePackPath, modelProvider: this._mp,
          legacy: this._kb, onProgress: (p) => this._emitInit(p) }).initialize();
        if (settings.enableRag !== false) this._kb = this._packs;
      } catch (error) { console.error('[AiService] knowledge packages unavailable:', error.message); }
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
      maxTokensMode: this._mp._settings?.maxTokensMode,
      contextWindow: this._mp._settings?.contextWindow,
      maxOutputTokens: this._mp._settings?.maxOutputTokens,
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
  getKnowledgePacks() { return this._packs || null; }
  async refreshKnowledgeTools() { await this._registry?.get?.('kb')?.dispose(); }

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
    const question = `请分析当前${options.chartType || chartData.meta?.typeNameZh || '星盘'}，用自然语言回应，并保留可展开的判据。`;
    yield* this.chat([...(options.history || []), { role: 'user', content: question }], { ...options, chartData });
  }

  _contextManager() { return new ContextManager(this._mp, { catalog: this._catalog, esm: this._esm }); }
  _contextKey(chartData, knowledgeFingerprint = this._packs?.fingerprint()) { return hash(JSON.stringify({ profile: this._context?.activeProfile?.id, chart: chartData?.resultId || this._context?.resultId, type: chartData?.meta?.type || this._context?.chartType, knowledgeFingerprint })).slice(0, 24); }
  _chartText(context = {}) {
    if (this._context?.kind === 'chinese-chart' && this._context.lastBaziData && !context.chartData) return require('./ToolResult').baziToolResult(this._context.lastBaziData).content;
    return context.currentChartText || ((context.chartData || this._context?.lastChartData) ? toText(context.chartData || this._context.lastChartData) : null);
  }
  async _toolSchemas(tools) {
    if (!tools.length) return [];
    const { convertToOpenAITool } = await this._esm.load('@langchain/core/utils/function_calling');
    return tools.map((tool) => convertToOpenAITool(tool));
  }
  async _toolsForSession(session, currentCalls = [], chartSettings, knowledgeSnapshot) {
    let tools = this._registry ? await this._registry.getTools() : [];
    const knowledge = this._registry?.get?.('kb');
    if (knowledgeSnapshot && knowledge?.enabled) {
      const originals = new Set(await knowledge.listTools());
      tools = [...tools.filter((tool) => !originals.has(tool)), ...await new KnowledgeToolProvider(knowledgeSnapshot).listTools()];
    }
    const astro = this._registry?.get?.('astro');
    const settings = chartSettings || this._context?.successfulFilters?.settings || this._context?.lastChartData?.meta?.settings;
    if (settings && astro?.enabled && typeof astro.listToolsForSettings === 'function') {
      const originals = new Set(await astro.listTools());
      const replacements = new Map((await astro.listToolsForSettings(settings)).map((tool) => [tool.name, tool]));
      tools = tools.map((tool) => originals.has(tool) ? replacements.get(tool.name) || tool : tool);
    }
    return session?.messages?.length ? [...tools, ...await new ConversationToolProvider(session, currentCalls).listTools()] : tools;
  }
  async contextUsage(session, draft = '') {
    const tools = await this._toolsForSession(session);
    const schemas = await this._toolSchemas(tools);
    const history = [...contextHistory(session), ...(draft ? [{ role: 'user', content: draft }] : [])];
    const manager = this._contextManager();
    const workspace = this._workspaceFacts();
    const system = buildChatPrompt(this._chartText()) + ANALYST_PROMPT + '\n【可用判据目录】\n' + reportCatalog(workspace);
    const latestReport = [...(session?.messages || [])].reverse().find((m) => m.analysisReport)?.analysisReport;
    const analyst = manager.usage([{ role: 'system', content: system }, ...history], schemas);
    const writer = manager.usage([{ role: 'system', content: writerPrompt(latestReport) }, ...history]);
    return { ...(writer.used > analyst.used ? writer : analyst), compressedMessages: session?.contextSummary?.coveredMessages || 0 };
  }
  async compressSession(session) {
    this._ensureConfigured();
    if (this._abortControllers.has(session.id)) throw new Error('请等待当前回复完成后再压缩上下文。');
    const ac = new AbortController(); this._abortControllers.set(session.id, ac);
    try { return await this._contextManager().compressSession(session, { signal: ac.signal }); }
    finally { this._abortControllers.delete(session.id); }
  }

  _workspaceFacts() {
    const ctx = this._context;
    if (ctx?.kind === 'chinese-chart' && ctx.lastBaziData) return [{ callId: 'workspace', artifact: require('./ToolResult').baziToolResult(ctx.lastBaziData).artifact }];
    return ctx?.lastChartData ? [{ callId: 'workspace', artifact: chartToolResult(ctx.lastChartData, '').artifact }] : [];
  }

  /** Analyst owns tools; writer receives only validated findings and source snapshots. */
  async *chat(userMessages, context = {}) {
    this._ensureConfigured();
    const sessionId = context.sessionId || String(Date.now());
    if (this._abortControllers.has(sessionId)) throw new Error('该会话正在生成或压缩，请稍后重试。');
    const ac = new AbortController();
    this._abortControllers.set(sessionId, ac);
    try {
      const { HumanMessage, AIMessage, SystemMessage } = await this._esm.load('@langchain/core/messages');
      const model = this._mp.chatModel();
      const completed = [];
      const knowledgeSnapshot = this._packs?.createSnapshot();
      const tools = await this._toolsForSession(context.sessionSnapshot, completed, context.chartData?.meta?.settings, knowledgeSnapshot);
      const schemas = await this._toolSchemas(tools);
      const manager = this._contextManager();
      const notify = (event) => context.onContextEvent?.(event);
      const lcMessages = userMessages.filter((m) => m?.content).map((m) => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
      const contextKey = this._contextKey(context.chartData, knowledgeSnapshot?.fingerprint);
      const question = [...userMessages].reverse().find((m) => m.role === 'user')?.content || '';
      const questionTopic = question.split(/\n(?:\[|【|---)/)[0].replace(/\s+/g, ' ').slice(0, 100);
      let report = context.priorReport?.contextKey === contextKey && hasReportContent(context.priorReport) ? context.priorReport : null;
      const hasWorkspaceContext = Boolean(context.chartData || this._context?.lastChartData || this._context?.lastBaziData || this._context?.activeProfile);
      if (needsAnalysis(userMessages, context.priorReport, contextKey, { hasWorkspaceContext })) {
        yield { type: 'stage', data: 'analysis' };
        yield { type: 'activity', data: { phase: 'analysis', topic: questionTopic } };
        const calls = new Map();
        const currentChart = context.chartData || this._context?.lastChartData;
        if (currentChart) completed.push({ callId: 'workspace', tool: 'get_current_chart', artifact: chartToolResult(currentChart, '').artifact });
        else completed.push(...this._workspaceFacts());
        const systemPrompt = buildChatPrompt(this._chartText(context)) + ANALYST_PROMPT;
        const { createReactAgent } = await this._esm.load('@langchain/langgraph/prebuilt');
        const agent = createReactAgent({ llm: model, tools, prompt: async (state) => {
          const prompt = new SystemMessage(systemPrompt + '\n【可用判据目录】\n' + reportCatalog(completed));
          return manager.prepare([prompt, ...state.messages], schemas, { signal: ac.signal, notify });
        } });
        const stream = await agent.stream({ messages: lcMessages }, { streamMode: ['updates'], signal: ac.signal, recursionLimit: 25 });
        let finalText = '';
        let sequence = 0;
        let analysisTopic = questionTopic;
        for await (const chunk of stream) {
          if (ac.signal.aborted) break;
          const payload = Array.isArray(chunk) ? chunk[1] : chunk;
          for (const node of Object.values(payload || {})) for (const message of node?.messages || []) {
            const type = this._msgType(message);
            if (type === 'ai' && message.tool_calls?.length) {
              for (const tc of message.tool_calls) {
                const callId = tc.id || `${sessionId}-${++sequence}`;
                const call = { callId, tool: tc.name, args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}, null, 2),
                  startedAt: Date.now(), status: 'calling', argsDigest: this._digestArgs(tc.args), resultExcerpt: '', requiresConfirmation: false };
                calls.set(callId, call);
                if (typeof tc.args?.query === 'string') analysisTopic = tc.args.query.replace(/\s+/g, ' ').slice(0, 100);
                yield { type: 'tool-call', data: call };
              }
            } else if (type === 'tool') {
              const call = calls.get(message.tool_call_id) || [...calls.values()].find((entry) => entry.tool === message.name);
              const event = { ...call, tool: message.name || call?.tool || 'unknown',
                status: message.status === 'error' || /^计算失败|^联网搜索失败|^网页抓取失败/.test(this._extractText(message.content)) ? 'error' : 'done',
                result: this._extractText(message.content), artifact: message.artifact,
                durationMs: call ? Date.now() - call.startedAt : undefined, argsDigest: '', resultExcerpt: this._excerpt(message.content), requiresConfirmation: false };
              completed.push(event); if (call) calls.delete(call.callId);
              yield { type: 'tool-call', data: event };
              yield { type: 'activity', data: { phase: 'analysis', topic: analysisTopic } };
            } else if (type === 'ai') finalText = this._extractText(message.content);
          }
        }
        if (ac.signal.aborted) return;
        yield { type: 'stage', data: 'validation' };
        yield { type: 'activity', data: { phase: 'validation' } };
        try { report = parseReport(finalText, completed, contextKey); }
        catch (error) {
          yield { type: 'activity', data: { phase: 'validation', repair: true } };
          const repairPrompt = `${ANALYST_PROMPT}\n原报告格式或引用校验失败：${error.message}。只使用下列真实目录，修复报告；无法证实的判断删除。\n${reportCatalog(completed)}\n原报告：${finalText}`;
          const repairMessages = await manager.prepare([new SystemMessage(repairPrompt), new HumanMessage(`用户当前问题：${question}\n修复为协议要求的 JSON。`)], [], { signal: ac.signal, notify });
          const repair = await model.invoke(repairMessages, { signal: ac.signal });
          report = parseReport(this._extractText(repair.content), completed, contextKey);
        }
      }
      if (report) {
        if (knowledgeSnapshot) report = { ...report, knowledgeFingerprint: knowledgeSnapshot.fingerprint };
        yield { type: 'analysis-report', data: report };
      }
      if (ac.signal.aborted) return;
      yield { type: 'stage', data: 'answer' };
      yield { type: 'activity', data: { phase: 'answer', topic: report?.focus?.slice(0, 100) } };
      const writerMessages = await manager.prepare([new SystemMessage(writerPrompt(report)), ...lcMessages], [], { signal: ac.signal, notify });
      const answer = await model.stream(writerMessages, { signal: ac.signal });
      let finishReason = null;
      for await (const chunk of answer) {
        if (ac.signal.aborted) break;
        const text = this._extractText(chunk.content);
        if (text) yield { type: 'token', data: text };
        finishReason = this._finishReason(chunk) || finishReason;
      }
      if (finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };
    } catch (error) {
      if (!ac.signal.aborted) throw error;
    } finally { this._abortControllers.delete(sessionId); }
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

  /** Compact one-line digest of tool arguments (capped for the UI strip). */
  _digestArgs(args) {
    try {
      const s = typeof args === 'string' ? args : JSON.stringify(args || {});
      const flat = s.replace(/\s+/g, ' ').trim();
      return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
    } catch (_) { return ''; }
  }

  /** Result excerpt for the expandable tool row (capped at ~200 chars). */
  _excerpt(content) {
    const text = this._extractText(content).replace(/\s+/g, ' ').trim();
    return text.length > 200 ? `${text.slice(0, 197)}…` : text;
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
