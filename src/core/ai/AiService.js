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
const { chartToolResult, evidenceCatalog, evidenceCalls, hash } = require('./ToolResult');
const { ANALYST_PROMPT, parseReport, reportCatalog, writerPrompt, answerProtocol, needsAnalysis, isAcknowledgement } = require('./AnalysisProtocol');
const { createTask, promoteFor, assessReport, taskPrompt, birthIdentity } = require('./AnalysisTask');
const { streamAnswerBlocks } = require('./AnswerBlocks');
const { diagnostics } = require('../diagnostics/DiagnosticLog');

class AiService {
  constructor(astrologyService, chineseAstrologyService, profileRepository, { catalog = null, esm: esmImpl = esm, now = () => new Date() } = {}) {
    this._astrology = astrologyService;
    this._chinese = chineseAstrologyService;
    this._profiles = profileRepository || null;
    this._catalog = catalog;
    this._esm = esmImpl;
    this._now = now;
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
    if (settings.toolCallLimits) this.setToolCallLimits(settings.toolCallLimits);

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

    // Publish package metadata before slow index/model work. Connection tests are
    // explicit user actions, never a dependency of local library initialization.
    this._packs = null;
    if (settings.knowledgePackPath) {
      try {
        const packs = new (require('./KnowledgePackManager'))({ root: settings.knowledgePackPath, modelProvider: this._mp,
          bundledPath: settings.knowledgeBundledPackPath, onProgress: p => this._emitInit(p) });
        await packs.initialize({ prepareIndexes: false });
        packs.busy = true;
        this._packs = packs;
      } catch (error) { console.error('[AiService] knowledge packages unavailable:', error.message); }
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

    if (this._packs) {
      this._packs.legacy = this._kb;
      this._packs.busy = false;
      this._kbInitializing = true;
      try { await this._packs.prepareIndexes(); }
      finally { this._kbInitializing = false; }
      if (settings.enableRag !== false) this._kb = this._packs;
      this._emitInit({ phase: 'ready', docs: this._packs.listDocuments().length });
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
  async _toolsForSession(session, currentCalls = [], chartSettings, knowledgeSnapshot, workspace = this._context, now = null) {
    let tools = this._registry ? await this._registry.getTools() : [];
    const knowledge = this._registry?.get?.('kb');
    if (knowledgeSnapshot && knowledge?.enabled) {
      const originals = new Set(await knowledge.listTools());
      tools = [...tools.filter((tool) => !originals.has(tool)), ...await new KnowledgeToolProvider(knowledgeSnapshot).listTools()];
    }
    const astro = this._registry?.get?.('astro');
    const settings = chartSettings || workspace?.successfulFilters?.settings || workspace?.lastChartData?.meta?.settings;
    if (settings && astro?.enabled && typeof astro.listToolsForSettings === 'function') {
      const originals = new Set(await astro.listTools());
      const replacements = new Map((await astro.listToolsForSettings(settings)).map((tool) => [tool.name, tool]));
      tools = tools.map((tool) => originals.has(tool) ? replacements.get(tool.name) || tool : tool);
    }
    const contextProvider = this._registry?.get?.('context');
    if (now && contextProvider?.enabled) {
      const originals = new Set(await contextProvider.listTools());
      const replacements = new Map((await require('./AstroToolkit').buildContextTools({ getContext: () => workspace || {}, getNow: () => now })).map(t => [t.name, t]));
      tools = tools.map(tool => originals.has(tool) ? replacements.get(tool.name) || tool : tool);
    }
    return session?.messages?.length ? [...tools, ...await new ConversationToolProvider(session, currentCalls).listTools()] : tools;
  }

  setToolCallLimits(limits) {
    if (!limits || typeof limits !== 'object' || Array.isArray(limits) || Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('工具次数必须为非负整数，0 表示无限制');
    this._lastSettings = { ...(this._lastSettings || {}), toolCallLimits: { ...(this._lastSettings?.toolCallLimits || {}), ...limits } };
  }
  async describeTools() {
    const providers = this._registry ? await this._registry.describe() : [];
    const conversation = await new ConversationToolProvider({ messages: [] }).listTools();
    providers.push({ id: 'conversation', category: 'context', enabled: true, ready: true, configurableEnabled: false,
      tools: conversation.map(t => ({ name: t.name, description: t.description })) });
    return providers.map(p => ({ ...p, tools: p.tools.map(t => ({ ...t, callLimit: this._lastSettings?.toolCallLimits?.[t.name] ?? 32 })) }));
  }
  async _budgetTools(tools) {
    if (!tools.length) return tools;
    const { DynamicStructuredTool } = await this._esm.load('@langchain/core/tools');
    const limits = { ...(this._lastSettings?.toolCallLimits || {}) };
    const counts = new Map();
    const available = name => (limits[name] ?? 32) === 0 || (counts.get(name) || 0) < (limits[name] ?? 32);
    const budget = { used: 0, reason: 'limit', get closed() { return tools.every(t => !available(t.name)); }, available };
    const wrapped = tools.map(tool => new DynamicStructuredTool({ name: tool.name, description: tool.description, schema: tool.schema, responseFormat: 'content_and_artifact',
      func: async (...args) => {
        if (!available(tool.name)) {
          const text = `${tool.name} 本轮调用次数已达上限，此调用未执行。请使用已有结果或其他可用工具。`;
          return [text, { version: 1, kind: 'budget', data: text, reason: 'limit' }];
        }
        counts.set(tool.name, (counts.get(tool.name) || 0) + 1); budget.used++;
        const result = await tool.func(...args);
        return tool.responseFormat === 'content_and_artifact' ? result : [result, undefined];
      } }));
    Object.defineProperty(wrapped, 'budget', { value: budget });
    return wrapped;
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
    const started = Date.now();
    try {
      const { HumanMessage, AIMessage, SystemMessage } = await this._esm.load('@langchain/core/messages');
      const model = this._mp.chatModel();
      const completed = [];
      const now = this._now();
      const workspace = structuredClone(this._context || {});
      const knowledgeSnapshot = this._packs?.createSnapshot();
      const tools = await this._budgetTools(await this._toolsForSession(context.sessionSnapshot, completed, context.chartData?.meta?.settings, knowledgeSnapshot, workspace, now));
      const schemas = await this._toolSchemas(tools);
      const manager = this._contextManager();
      const notify = (event) => context.onContextEvent?.(event);
      const lcMessages = userMessages.filter((m) => m?.content).map((m) => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
      const contextKey = this._contextKey(context.chartData, knowledgeSnapshot?.fingerprint);
      const question = [...userMessages].reverse().find((m) => m.role === 'user')?.content || '';
      const questionTopic = question.split(/\n(?:\[|【|---)/)[0].replace(/\s+/g, ' ').slice(0, 100);
      let report = null;
      const task = createTask({ question, messages: [...(context.sessionSnapshot?.messages || []), ...userMessages], previous: context.priorReport?.task, now, workspace, profiles: this._profiles?.list?.() || [], knowledgeFingerprint: knowledgeSnapshot?.fingerprint });
      if (context.chartData?.meta?.settings) task.settings = structuredClone(context.chartData.meta.settings);
      const hasWorkspaceContext = Boolean(context.chartData || workspace.lastChartData || workspace.lastBaziData || workspace.activeProfile);
      let analysis = needsAnalysis(userMessages, context.priorReport, contextKey, { hasWorkspaceContext });
      let route = analysis ? 'analysis' : isAcknowledgement(String(question).trim()) ? 'conversation' : 'tools';
      let analysisMessages = lcMessages;
      diagnostics.info('ai-turn-start', { route, hasWorkspaceContext, hasChart: Boolean(context.chartData || this._context?.lastChartData || this._context?.lastBaziData), tools: tools.map((tool) => tool.name), provider: this._mp._settings?.provider, model: this._mp._settings?.model });
      if (route === 'tools') {
        yield { type: 'stage', data: 'analysis' };
        yield { type: 'activity', data: { phase: 'analysis', topic: questionTopic } };
        const prompt = buildChatPrompt(null, now) + taskPrompt(task) + `\n本轮先识别任务并使用工具。工具能力不依赖用户生成星盘。根据问题自主使用已启用的档案、网页、检索或 MCP 工具；无关的问题不要求出生信息或星盘。用户提供网址并要求阅读时，调用 read_webpage；要求联网查询时调用 web_search。只有实际工具返回失败或相关工具未启用时才说明无法访问。引用网页时使用真实标题和 URL。若需要星盘、命理或知识解释，先调用相关工具，程序随后进入分析报告阶段。`;
        const result = yield* this._agentEvents({ model, tools, schemas, messages: lcMessages, manager, prompt, ac, notify, completed, sessionId, questionTopic, streamText: false, promoteOnTools: true });
        if (result.promoted) {
          analysis = true; route = 'analysis'; analysisMessages = result.messages;
          diagnostics.info('ai-route-promoted', { from: 'tools', to: route });
        } else if (!ac.signal.aborted) {
          if (result.finalText) yield { type: 'token', data: result.finalText };
          if (result.finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };
          diagnostics.info('ai-turn-done', { route, durationMs: Date.now() - started });
          yield { type: 'done', data: { sessionId } };
          return;
        }
      }
      if (ac.signal.aborted) return;
      if (analysis) {
        yield { type: 'stage', data: 'analysis' };
        yield { type: 'activity', data: { phase: 'analysis', topic: questionTopic } };
        const currentChart = context.chartData || workspace.lastChartData;
        if (currentChart) completed.push({ callId: 'workspace', tool: 'get_current_chart', artifact: chartToolResult(currentChart, '').artifact });
        else if (workspace.lastBaziData) completed.push({ callId: 'workspace', artifact: require('./ToolResult').baziToolResult(workspace.lastBaziData, { subjectKeys: [birthIdentity(workspace.activeProfile?.birthData)] }).artifact });
        const systemPrompt = buildChatPrompt(currentChart ? toText(currentChart) : null, now) + ANALYST_PROMPT + taskPrompt(task);
        let result = yield* this._agentEvents({ model, tools, schemas, messages: analysisMessages, manager, prompt: systemPrompt, ac, notify, completed, sessionId, questionTopic, streamText: false });
        if (ac.signal.aborted) return;
        const validation = { completed, contextKey, task, model, manager, systemPrompt, ac, notify };
        ({ report, result } = yield* this._validateAnalysisReport({ ...validation, result }));
        let readiness = assessReport(report, completed, task);
        for (let attempt = 0; readiness.issues.length && attempt < 2 && !tools.budget?.closed; attempt++) {
          yield { type: 'stage', data: 'analysis' };
          yield { type: 'activity', data: { phase: 'analysis', topic: '补齐时间、对象和解释适用条件' } };
          diagnostics.info('ai-readiness-retry', { attempt: attempt + 1, codes: [...new Set(readiness.issues.map(i => i.code))] });
          const gaps = `程序完整性检查未通过：${JSON.stringify(readiness.issues)}。继续调用工具补齐可获取的资料，再输出完整报告。不能只改写措辞或把未完成标成已完成。不能取得的资料只限制相关判断。`;
          result = yield* this._agentEvents({ model, tools, schemas, messages: [...result.messages, new HumanMessage(gaps)], manager, prompt: systemPrompt, ac, notify, completed, sessionId, questionTopic, streamText: false });
          if (ac.signal.aborted) return;
          ({ report, result } = yield* this._validateAnalysisReport({ ...validation, result }));
          readiness = assessReport(report, completed, task);
        }
        const { accepted, ...assessment } = readiness;
        report = { ...report, claims: accepted, task, readiness: assessment };
        diagnostics.info('ai-readiness-checked', { status: assessment.status, accepted: accepted.length, codes: [...new Set(assessment.issues.map(i => i.code))] });
      }
      if (report) {
        if (knowledgeSnapshot) report = { ...report, knowledgeFingerprint: knowledgeSnapshot.fingerprint };
        yield { type: 'analysis-report', data: report };
      }
      if (ac.signal.aborted) return;
      if (report && !report.claims.length && report.validationIssues?.length) {
        yield { type: 'token', data: '这轮分析经自动修正后，仍有依据未能核对，因此暂时不输出相关结论。已保留工具取得的资料，可以缩小到一个具体问题继续分析。' };
        yield { type: 'done', data: { sessionId } }; return;
      }
      yield { type: 'stage', data: 'answer' };
      yield { type: 'activity', data: { phase: 'answer', topic: report?.focus?.slice(0, 100) } };
      // Gaps remain in the report and writer context. They do not automatically
      // prepend an abstention or prevent grounded support and useful questions.
      const writerMessages = await manager.prepare([new SystemMessage(report?.claims.length ? answerProtocol(report) : writerPrompt(report)), ...lcMessages], [], { signal: ac.signal, notify });
      if (report?.claims.length) {
        yield* streamAnswerBlocks({ model, messages: writerMessages, report, signal: ac.signal, extract: c => this._extractText(c), finishReason: c => this._finishReason(c),
          repairMessages: prompt => manager.prepare([...writerMessages, new HumanMessage(prompt)], [], { signal: ac.signal, notify }) });
        diagnostics.info('ai-turn-done', { route, durationMs: Date.now() - started });
        yield { type: 'done', data: { sessionId } }; return;
      }
      const answer = await model.stream(writerMessages, { signal: ac.signal });
      let finishReason = null;
      for await (const chunk of answer) {
        if (ac.signal.aborted) break;
        const text = this._extractText(chunk.content);
        if (text) yield { type: 'token', data: text };
        finishReason = this._finishReason(chunk) || finishReason;
      }
      if (finishReason === 'length') yield { type: 'truncated', data: { reason: 'length' } };
      diagnostics.info('ai-turn-done', { route, durationMs: Date.now() - started });
    } catch (error) {
      diagnostics.error(ac.signal.aborted ? 'ai-turn-stopped' : 'ai-turn-failed', { error, durationMs: Date.now() - started });
      if (!ac.signal.aborted) throw error;
    } finally { this._abortControllers.delete(sessionId); }
    yield { type: 'done', data: { sessionId } };
  }

  /** Every analyst pass, including completeness retries, uses the same gate. */
  async *_validateAnalysisReport({ result, completed, contextKey, task, model, manager, systemPrompt, ac, notify }) {
    const { SystemMessage, HumanMessage, AIMessage } = await this._esm.load('@langchain/core/messages');
    const options = { userEvidence: task.userEvidence };
    const originalText = result.finalText;
    yield { type: 'stage', data: 'validation' };
    yield { type: 'activity', data: { phase: 'validation' } };
    try { return { report: parseReport(result.finalText, completed, contextKey, options), result }; }
    catch (error) {
      const catalog = evidenceCatalog(completed);
      diagnostics.warn('ai-analysis-repair', { error, validation: error.issues, facts: catalog.facts.size, sources: catalog.sources.size });
      yield { type: 'activity', data: { phase: 'validation', repair: true } };
      const instruction = new HumanMessage(`程序校验失败：${JSON.stringify(error.issues || [{ message: error.message }])}。修复上面的完整报告并只输出协议 JSON。逐项检查指出的路径，factRefs/sourceIds 必须从本轮目录逐字复制，不能拼接或猜测编号。保留已有的有效判断，不改动它们的依据；仅在原始资料确实支持时修正错误引用，否则删除整条依赖它的判断，不能只删引用留下结论。不能改标签绕过计算、来源或用户原话校验。`);
      // Retain the original question, tool text and report. A list of book titles
      // alone cannot justify repairing an attribution to a different passage.
      const messages = await manager.prepare([new SystemMessage(systemPrompt + '\n【可用判据目录】\n' + reportCatalog(completed)), ...result.messages, instruction], [], { signal: ac.signal, notify });
      const repair = await model.invoke(messages, { signal: ac.signal });
      const finalText = this._extractText(repair.content);
      result = { ...result, finalText, messages: [...result.messages, instruction, new AIMessage(finalText)] };
      let report;
      try { report = parseReport(finalText, completed, contextKey, { ...options, allowPartial: true }); }
      catch (parseError) {
        // A malformed repair is a content failure, not a failed API request.
        // Preserve valid original claims when possible instead of throwing.
        try { report = parseReport(originalText, completed, contextKey, { ...options, allowPartial: true }); }
        catch (_) { report = { version: 1, dialogueVersion: 2, contextKey, focus: task.question, claims: [], sources: [], questions: [],
          validationIssues: [{ code: 'invalid-report-format', message: parseError.message }] }; }
      }
      if (report.validationIssues?.length) diagnostics.warn('ai-analysis-claims-rejected', { validation: report.validationIssues, retained: report.claims.length, facts: catalog.facts.size, sources: catalog.sources.size });
      return { report, result };
    }
  }

  /** The same enabled tools are available before and after chart calculation. */
  async *_agentEvents({ model, tools, schemas, messages, manager, prompt, ac, notify, completed, sessionId, questionTopic, streamText, promoteOnTools = false }) {
    const { SystemMessage } = await this._esm.load('@langchain/core/messages');
    const { createReactAgent } = await this._esm.load('@langchain/langgraph/prebuilt');
    const calls = new Map();
    const history = [...messages];
    let sequence = 0, finalText = '', finishReason = null, analysisTopic = questionTopic, writing = false;
    while (!ac.signal.aborted) {
      let answered = false;
      if (tools.budget?.closed) {
        diagnostics.info('ai-tool-budget-closed', { used: tools.budget.used, reason: tools.budget.reason });
        yield { type: 'activity', data: { phase: 'analysis', topic: '探索已结束，正在整理已有资料' } };
        const system = new SystemMessage(prompt + '\n【可用判据目录】\n' + reportCatalog(completed) + '\n本轮工具探索已结束，工具已关闭。只根据已取得的真实资料完成当前输出协议；不再要求或假装调用工具。不足的资料只限制依赖它的判断，不编造引用。');
        const prepared = await manager.prepare([system, ...history], [], { signal: ac.signal, notify });
        const response = await model.invoke(prepared, { signal: ac.signal });
        if (response.tool_calls?.length) throw new Error('工具探索已经结束，但模型未返回整理结果。已保留工具记录，请重新生成回答。');
        finalText = this._extractText(response.content); finishReason = this._finishReason(response);
        history.push(response);
        if (streamText && finalText) yield { type: 'token', data: finalText };
        return { finalText, finishReason, messages: history };
      }
      const activeTools = tools.budget ? tools.filter(t => tools.budget.available(t.name)) : tools;
      const activeSchemas = tools.budget ? await this._toolSchemas(activeTools) : schemas;
      const agent = createReactAgent({ llm: model, tools: activeTools, interruptAfter: ['tools'], prompt: async (state) => {
        const system = new SystemMessage(prompt + (streamText ? '' : '\n【可用判据目录】\n' + reportCatalog(evidenceCalls(completed, state.messages))));
        return manager.prepare([system, ...state.messages], activeSchemas, { signal: ac.signal, notify });
      } });
      const before = completed.length;
      const stream = await agent.stream({ messages: history }, { streamMode: streamText ? ['messages', 'updates'] : ['updates'], signal: ac.signal, recursionLimit: 25 });
      for await (const chunk of stream) {
        if (ac.signal.aborted) break;
        const [mode, payload] = Array.isArray(chunk) ? chunk : ['updates', chunk];
        if (mode === 'messages') {
          const message = Array.isArray(payload) ? payload[0] : payload;
          if (this._msgType(message) === 'ai') {
            const text = this._extractText(message.content);
            if (text) {
              if (!writing) { yield { type: 'activity', data: { phase: 'answer' } }; writing = true; }
              yield { type: 'token', data: text };
            }
            finishReason = this._finishReason(message) || finishReason;
          }
          continue;
        }
        for (const node of Object.values(payload || {})) for (const message of node?.messages || []) {
          history.push(message);
          const type = this._msgType(message);
          if (type === 'ai' && message.tool_calls?.length) {
            for (const tc of message.tool_calls) {
              const callId = tc.id || `${sessionId}-${++sequence}`;
              const call = { callId, tool: tc.name, args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}, null, 2),
                startedAt: Date.now(), status: 'calling', argsDigest: this._digestArgs(tc.args), resultExcerpt: '', requiresConfirmation: false };
              calls.set(callId, call);
              if (typeof tc.args?.query === 'string') analysisTopic = tc.args.query.replace(/\s+/g, ' ').slice(0, 100);
              diagnostics.info('ai-tool-start', { tool: tc.name, callId });
              yield { type: 'tool-call', data: call };
            }
          } else if (type === 'tool') {
            const call = calls.get(message.tool_call_id) || [...calls.values()].find((entry) => entry.tool === message.name);
            const event = { ...call, callId: message.tool_call_id || call?.callId, tool: message.name || call?.tool || 'unknown',
              status: message.status === 'error' || message.artifact?.kind === 'budget' || /^Error:|^计算失败|^联网搜索失败|^网页抓取失败/.test(this._extractText(message.content)) ? 'error' : 'done',
              result: this._extractText(message.content), artifact: message.artifact,
              durationMs: call ? Date.now() - call.startedAt : undefined, argsDigest: '', resultExcerpt: this._excerpt(message.content), requiresConfirmation: false };
            completed.push(event); if (call) calls.delete(call.callId);
            diagnostics.info('ai-tool-done', { tool: event.tool, status: event.status, durationMs: event.durationMs });
            yield { type: 'tool-call', data: event };
            yield { type: 'activity', data: { phase: 'analysis', topic: analysisTopic } };
            writing = false;
          } else if (type === 'ai') {
            answered = true;
            finalText = this._extractText(message.content);
            finishReason = this._finishReason(message) || finishReason;
          }
        }
      }
      // Consume the complete, interrupted graph before switching roles: returning
      // mid-stream otherwise lets LangGraph start another background model/tool step.
      if (promoteOnTools && !calls.size && promoteFor(completed)) return { finalText: '', finishReason, promoted: true, messages: history };
      if (ac.signal.aborted || answered || completed.length === before) break;

    }
    return { finalText, finishReason, messages: history };
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
