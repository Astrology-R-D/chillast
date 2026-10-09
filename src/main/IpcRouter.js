'use strict';

const { CITIES } = require('../core/data/Cities');
const { searchScore } = require('../core/util/FuzzySearch');
const { contextHistory } = require('../core/ai/ContextManager');
const { assertAiContext } = require('../shared/WesternChartAiContext');

/**
 * IpcRouter — Mediator between the renderer (via IPC) and the application
 * services. It is the only place that knows the channel names, and it normalises
 * every response into a `{ ok, data | error }` envelope so the renderer has a
 * single, predictable error-handling path. Business logic lives in the injected
 * services, never here.
 */
class IpcRouter {
  /**
   * @param {object} deps
   * @param {Electron.IpcMain} deps.ipcMain
   * @param {ProfileRepository} deps.profileRepository
   * @param {AstrologyService} deps.astrologyService
   */
  constructor({ ipcMain, profileRepository, astrologyService, chineseAstrologyService, config, locale, aiService, aiSessionStore, aiConfigurationStore, locationResolver, closeDecision }) {
    this.ipcMain = ipcMain;
    this.profiles = profileRepository;
    this.astrology = astrologyService;
    this.chinese = chineseAstrologyService;
    this.config = config || {};
    this.locale = locale || {};
    this.ai = aiService;
    this.aiSessionStore = aiSessionStore || null;
    this.aiConfigurationStore = aiConfigurationStore || null;
    this._configurationBusy = false;
    this.locationResolver = locationResolver || null;
    this.closeDecision = typeof closeDecision === 'function' ? closeDecision : null;
    this.webContents = null;
    this._sessionTasks = new Set();
  }

  setWebContents(wc) { this.webContents = wc; }

  /** Register every channel handler. Call once during app startup. */
  register() {
    this._handle('config:get', () => this.config);
    this._handle('locale:get', () => this.locale);
    this._handle('reference:get', () => this.astrology.referenceData());
    this._handle('chartTypes:get', () => this.astrology.chartTypes());

    this._handle('profiles:list', () => this.profiles.list());
    this._handle('profiles:get', (_e, id) => this.profiles.get(id));
    this._handle('profiles:save', (_e, profileJson) => this.profiles.save(profileJson));
    this._handle('profiles:remove', (_e, id) => this.profiles.remove(id));

    if (this.locationResolver) {
      this._handle('locations:resolve', (_e, input) => this.locationResolver.resolve(input));
    }
    if (this.closeDecision) {
      this._handle('app:closeDecision', (_e, decision) => {
        if (decision !== 'proceed' && decision !== 'cancel') throw new Error('Invalid close decision');
        return this.closeDecision(decision);
      });
    }

    this._handle('chart:compute', (_e, request) => this.astrology.computeChart(request));

    this._handle('chinese:reference', () => this.chinese.referenceData());
    this._handle('chinese:computeBazi', (_e, profileData) => this.chinese.computeBaZi(profileData));
    this._handle('chinese:solarTerms', (_e, year) => {
      const { getSolarTermCalendar } = require('../core/chinese/SolarTermCalendar');
      return getSolarTermCalendar(year);
    });
    this._handle('chinese:searchCities', (_e, query) => {
      const { searchChineseCities } = require('../core/chinese/ChineseCityDatabase');
      return searchChineseCities(query);
    });

    // AI handlers
    if (this.ai) {
      this._handle('ai:status', () => this.ai.status());
      this._handle('ai:initStatus', () => (this.ai.getInitStatus ? this.ai.getInitStatus() : null));
      this._handle('ai:testConnection', () => this.ai.testConnection());
      this._handle('ai:testWithSettings', (_e, settings) => this.ai.testWithSettings(settings));
      this._handle('ai:providers', () => {
        const ModelProvider = require('../core/ai/ModelProvider');
        return ModelProvider.listProviders();
      });
      this._handle('ai:catalog:providers', () => this.ai.getCatalogProviders());
      this._handle('ai:catalog:models', (_e, providerKey) => this.ai.getCatalogModels(providerKey));
      this._handle('ai:configurations:list', () => this.aiConfigurationStore?.list() || { activeId: null, configurations: [] });
      this._handle('ai:configurations:save', (_e, input) => this._changeAiConfiguration(async () => {
        const entry = this.aiConfigurationStore.prepareSave(input);
        return this._commitAiConfiguration(entry, () => this.aiConfigurationStore.commit(entry));
      }));
      this._handle('ai:configurations:activate', (_e, id) => this._changeAiConfiguration(async () => {
        const entry = this.aiConfigurationStore.get(id);
        return this._commitAiConfiguration(entry, () => this.aiConfigurationStore.activate(id));
      }));
      this._handle('ai:configurations:remove', (_e, id) => this._changeAiConfiguration(() => this.aiConfigurationStore.remove(id)));
      this._handle('ai:configurations:test', (_e, input) => {
        const entry = this.aiConfigurationStore.prepareSave({ ...input, name: input.id ? this.aiConfigurationStore.get(input.id).name : require('node:crypto').randomUUID() });
        return this.ai.testWithSettings({ ...entry.settings, apiKey: entry.apiKey });
      });
      this._handle('ai:configure', (_e, settings) => this._withAiConfigurationLock(async () => {
        const { app, safeStorage } = require('electron');
        const fs = require('fs');
        const path = require('path');
        const persistedSettings = this._readAiSettings();
        const merged = { ...persistedSettings, ...settings };
        const configureResult = await this.ai.configure(merged);
        if (!configureResult || !configureResult.accepted) {
          const reason = configureResult && configureResult.error
            ? configureResult.error
            : 'model provider rejected the settings';
          throw new Error(`AI configuration was not accepted: ${reason}`);
        }

        // Save API key — try safeStorage, fallback to plain JSON
        if (Object.prototype.hasOwnProperty.call(settings, 'apiKey')) {
          const dataDir = path.join(app.getPath('userData'), 'data');
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          const credPath = path.join(dataDir, 'ai-credentials.json');
          const credJson = JSON.stringify({ apiKey: settings.apiKey });
          try {
            if (safeStorage.isEncryptionAvailable()) {
              const encrypted = safeStorage.encryptString(credJson);
              fs.writeFileSync(credPath, encrypted);
            } else {
              throw new Error('safeStorage not available');
            }
          } catch (_) {
            fs.writeFileSync(credPath, credJson, 'utf-8');
          }
        }

        // Persist non-secret settings, preserving fields owned by other panels
        // (mcpServers, toolProviders) so saving the provider doesn't wipe them.
        this._writeAiSettings({
          ...persistedSettings,
          provider: settings.provider,
          model: settings.model,
          baseUrl: settings.baseUrl || '',
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          maxTokensMode: settings.maxTokensMode,
          contextWindow: settings.contextWindow,
          maxOutputTokens: settings.maxOutputTokens,
        });
        if (this.aiConfigurationStore) {
          const active = this.aiConfigurationStore.getActive();
          if (active) this.aiConfigurationStore.commit(this.aiConfigurationStore.prepareSave({ id: active.id, name: active.name, settings: { ...active.settings, ...settings } }));
        }

        if (this.webContents) this.webContents.send('ai:statusChanged', this.ai.status());
        return { ok: true };
      }));
      this._handle('ai:tools:describe', async () => {
        const reg = this.ai.getToolRegistry();
        return reg ? reg.describe() : [];
      });
      this._handle('ai:tools:setProviderEnabled', (_e, id, enabled) => {
        const reg = this.ai.getToolRegistry();
        if (reg) reg.setEnabled(id, !!enabled);
        const s = this._readAiSettings();
        s.toolProviders = { ...(s.toolProviders || {}), [id]: !!enabled };
        this._writeAiSettings(s);
        return { ok: true };
      });
      this._handle('ai:mcp:list', () => {
        const m = this.ai.getMcpManager();
        if (!m) return { servers: {}, toolCount: 0, connected: false };
        return { servers: m.getConfig(), toolCount: m.getTools().length, connected: m.isConnected() };
      });
      this._handle('ai:mcp:save', async (_e, servers) => {
        const s = this._readAiSettings();
        s.mcpServers = servers || {};
        this._writeAiSettings(s);
        if (this.ai.updateMcp) await this.ai.updateMcp(servers || {});
        if (this.webContents) this.webContents.send('ai:statusChanged', this.ai.status());
        return { ok: true };
      });
      this._handle('ai:interpret', (_e, chartData, options = {}) => this._runAiChat(
        [{ role: 'user', content: `请分析当前${options.chartType || '星盘'}，保留判据和引用。` }], { ...options, chartData }));
      this._handle('ai:chat', (_e, messages, context = {}) => this._runAiChat(messages, context));
      this._handle('ai:context:usage', async (_e, sessionId, draft = '') => {
        const session = this.aiSessionStore?.get(String(sessionId));
        if (!session) throw new Error('未找到会话');
        if (typeof draft !== 'string' || draft.length > 300000) throw new Error('输入过长');
        return this.ai.contextUsage(session, draft);
      });
      this._handle('ai:context:compress', async (_e, sessionId) => {
        if (this._configurationBusy) throw new Error('AI 配置正在切换，请稍后压缩上下文');
        sessionId = String(sessionId);
        if (this._sessionTasks.has(sessionId)) throw new Error('该会话正在生成或压缩，请稍后重试。');
        const session = this.aiSessionStore?.get(sessionId);
        if (!session) throw new Error('未找到会话');
        this._sessionTasks.add(sessionId);
        try {
          this._contextEvent(sessionId, { compression: 'running', message: '正在压缩上下文，完整记录仍保留。' });
          const summary = await this.ai.compressSession(session);
          if (summary && !this.aiSessionStore.setContextSummary(sessionId, summary)) throw new Error('会话在压缩期间已变化，请重试。');
          const usage = await this.ai.contextUsage(this.aiSessionStore.get(sessionId));
          const message = summary ? '上下文已压缩，完整历史、工具结果与引用仍保留。' : '没有可压缩的旧对话，已保留最近对话。';
          this._contextEvent(sessionId, { usage, compression: 'done', message });
          this.webContents?.send('ai:sessionsChanged');
          return { usage, changed: Boolean(summary), message };
        } catch (error) {
          this._contextEvent(sessionId, { compression: 'error', message: `压缩未完成：${error.message}` });
          throw error;
        } finally { this._sessionTasks.delete(sessionId); }
      });
      this._handle('ai:stop', (_e, sessionId) => { this.ai.stop(sessionId); return { ok: true }; });
      this._handle('ai:knowledge:list', () => this.ai.getKnowledgeBase()?.listDocuments() || []);
      this._handle('ai:sessions:list', () => this.aiSessionStore ? this.aiSessionStore.list() : []);
      this._handle('ai:sessions:get', (_e, id) => this.aiSessionStore ? this.aiSessionStore.get(id) : null);
      this._handle('ai:sessions:create', () => this.aiSessionStore ? this.aiSessionStore.create() : null);
      this._handle('ai:sessions:delete', (_e, id) => {
        if (this.aiSessionStore) return this.aiSessionStore.delete(id);
        return false;
      });
      this._handle('ai:sessions:rename', (_e, id, title) => {
        if (!this.aiSessionStore) return null;
        const updated = this.aiSessionStore.setTitle(id, title);
        if (updated && this.webContents) this.webContents.send('ai:sessionsChanged');
        return updated;
      });
      this._handle('ai:sessions:generateTitle', async (_e, id) => {
        if (!this.aiSessionStore) return { title: '' };
        const session = this.aiSessionStore.get(id);
        if (!session) return { title: '' };
        const title = await this.ai.summarizeTitle(session.messages);
        if (title) {
          this.aiSessionStore.setTitle(id, title);
          if (this.webContents) this.webContents.send('ai:sessionsChanged');
        }
        return { title };
      });
      this._handle('ai:sessions:fork', (_e, sessionId, messageIndex) => {
        if (!this.aiSessionStore) throw new Error('会话存储未初始化');
        const forked = this.aiSessionStore.fork(sessionId, messageIndex);
        if (!forked) throw new Error('未找到要分支的会话或消息');
        if (this.webContents) this.webContents.send('ai:sessionsChanged');
        return forked;
      });
      this._handle('ai:sessions:setPinned', (_e, sessionId, pinned) => {
        if (!this.aiSessionStore) throw new Error('会话存储未初始化');
        const updated = this.aiSessionStore.setPinned(sessionId, !!pinned);
        if (!updated) throw new Error('未找到会话');
        if (this.webContents) this.webContents.send('ai:sessionsChanged');
        return updated;
      });
      this._handle('ai:sessions:replaceFrom', (_e, sessionId, messageIndex, message) => {
        if (!this.aiSessionStore) throw new Error('会话存储未初始化');
        const updated = this.aiSessionStore.replaceFrom(sessionId, messageIndex, message);
        if (!updated) throw new Error('未找到要改写的会话或消息');
        if (this.webContents) this.webContents.send('ai:sessionsChanged');
        return updated;
      });
      this._handle('ai:readTextAttachment', (_e, filePath) => {
        const fs = require('fs');
        const path = require('path');
        const MAX_BYTES = 200 * 1024;
        const stat = fs.statSync(String(filePath));
        if (!stat.isFile()) throw new Error('附件不是文件');
        if (stat.size > MAX_BYTES) throw new Error('附件超过 200KB 上限');
        const content = fs.readFileSync(String(filePath), 'utf-8');
        return { name: path.basename(String(filePath)), content };
      });
      this._handle('ai:sessions:append', (_e, sessionId, message) => {
        if (!this.aiSessionStore) return { ok: false };
        const updated = this.aiSessionStore.appendMessage(sessionId, message);
        return updated ? { ok: true, data: updated } : { ok: false };
      });
      this._handle('ai:setContext', (_e, context) => {
        this.ai.setContext(assertAiContext(context));
        return { ok: true };
      });
      this._handle('ai:knowledge:import', async (_e, filePaths) => {
        const kb = this.ai.getKnowledgeBase();
        if (!kb) throw new Error('知识库未初始化');
        const count = await kb.importDocuments(filePaths);
        return { count };
      });
      this._handle('ai:knowledge:remove', (_e, docId) => {
        const kb = this.ai.getKnowledgeBase();
        if (!kb) throw new Error('知识库未初始化');
        const removed = kb.removeDocument(docId);
        return { removed };
      });
    }

    this._handle('cities:search', (_e, query) => this._searchCities(query));
    return this;
  }

  _contextEvent(sessionId, event) { this.webContents?.send('ai:contextChanged', { sessionId, ...event }); }

  async _runAiChat(messages, context) {
    if (this._configurationBusy) throw new Error('AI 配置正在切换，请稍后发送消息');
    const sessionId = context.sessionId || String(Date.now());
    let aiText = ''; let analysisReport = null; const toolCalls = []; let saved = false; let ownsTask = false;
    const saveTurn = (failure) => {
      if (saved || (!aiText && !toolCalls.length && !analysisReport) || !this.aiSessionStore) return;
      saved = true;
      const completed = toolCalls.map((call) => call.status === 'calling' ? { ...call, status: 'error', result: failure || '工具调用未完成（已停止）' } : call);
      this.aiSessionStore.appendMessage(sessionId, { role: 'ai', content: aiText,
        ...(completed.length ? { toolCalls: completed } : {}), ...(analysisReport ? { analysisReport } : {}) });
    };
    try {
      if (this._sessionTasks.has(sessionId)) throw new Error('该会话正在生成或压缩，请稍后重试。');
      this._sessionTasks.add(sessionId); ownsTask = true;
      if (this.aiSessionStore && !context.resend && messages.at(-1)) this.aiSessionStore.appendMessage(sessionId, messages.at(-1));
      let session = this.aiSessionStore?.get(sessionId);
      if (session && this.ai.contextUsage) {
        const usage = await this.ai.contextUsage(session);
        this._contextEvent(sessionId, { usage });
        if (usage.needsCompression) {
          this._contextEvent(sessionId, { usage, compression: 'running', message: '上下文接近容量，正在自动压缩。' });
          const summary = await this.ai.compressSession(session);
          if (summary) {
            if (!this.aiSessionStore.setContextSummary(sessionId, summary)) throw new Error('会话在压缩期间已变化，请重试。');
            session = this.aiSessionStore.get(sessionId);
            this._contextEvent(sessionId, { usage: await this.ai.contextUsage(session), compression: 'done', message: '已自动压缩上下文，完整记录与引用仍保留。' });
          } else {
            this._contextEvent(sessionId, { usage, compression: 'done', message: '没有可压缩的旧对话，接下来会检查本次请求的工具结果和必要资料。' });
          }
        }
      }
      const priorReport = [...(session?.messages || [])].reverse().find((m) => m.analysisReport)?.analysisReport;
      const history = session ? contextHistory(session) : messages;
      for await (const ev of this.ai.chat(history, { ...context, sessionId, priorReport, sessionSnapshot: session, onContextEvent: (event) => this._contextEvent(sessionId, event) })) {
        this.webContents?.send('ai:token', { sessionId, requestId: context.requestId, type: ev.type, data: ev.data });
        if (ev.type === 'token') aiText += ev.data;
        if (ev.type === 'analysis-report') analysisReport = ev.data;
        if (ev.type === 'tool-call') {
          const call = ev.data;
          const previous = call.status === 'calling' ? -1 : toolCalls.findLastIndex((item) => call.callId ? item.callId === call.callId : item.tool === call.tool && item.status === 'calling');
          if (previous < 0) toolCalls.push(call);
          else toolCalls[previous] = { ...toolCalls[previous], ...call, argsDigest: call.argsDigest || toolCalls[previous].argsDigest };
        }
      }
      saveTurn();
      this.webContents?.send('ai:done', { ok: true, sessionId, requestId: context.requestId });
      this.webContents?.send('ai:sessionsChanged');
      this._maybeAutoTitle(sessionId);
      return { ok: true };
    } catch (err) {
      saveTurn(err.message);
      this.webContents?.send('ai:error', { message: err.message, sessionId, requestId: context.requestId });
      this._contextEvent(sessionId, { compression: 'error', message: err.message });
      return { ok: false, error: err.message };
    } finally { if (ownsTask) this._sessionTasks.delete(sessionId); }
  }

  /**
   * Generate an AI title for a session the first time it has content, then
   * notify the renderer to refresh its session list. Fire-and-forget: never
   * blocks the chat response and swallows all errors.
   */
  async _maybeAutoTitle(sessionId) {
    try {
      if (!this.aiSessionStore || !this.ai || !sessionId) return;
      const session = this.aiSessionStore.get(sessionId);
      if (!session || session.title) return;
      if (!session.messages.some((m) => m.role === 'user')) return;
      const title = await this.ai.summarizeTitle(session.messages);
      if (!title) return;
      this.aiSessionStore.setTitle(sessionId, title);
      if (this.webContents) this.webContents.send('ai:sessionsChanged');
    } catch (_) { /* titling is best-effort */ }
  }

  async _changeAiConfiguration(action) {
    if (!this.aiConfigurationStore) throw new Error('AI 配置存储尚未初始化');
    return this._withAiConfigurationLock(async () => {
      const result = await action();
      if (this.webContents) this.webContents.send('ai:statusChanged', this.ai.status());
      return result;
    });
  }

  async _withAiConfigurationLock(action) {
    if (this._configurationBusy || this._sessionTasks.size || this.ai?._abortControllers?.size) throw new Error('请等待当前 AI 回复或配置操作完成');
    this._configurationBusy = true;
    try { return await action(); }
    finally { this._configurationBusy = false; }
  }

  async _applyAiConfiguration(entry) {
    const result = await this.ai.configure({ ...this._readAiSettings(), ...entry.settings, apiKey: entry.apiKey });
    if (!result?.accepted) throw new Error(`AI 配置未生效：${result?.error || '服务商拒绝了配置'}`);
  }

  async _commitAiConfiguration(entry, commit) {
    const previous = this.aiConfigurationStore.getActive();
    await this._applyAiConfiguration(entry);
    try { return commit(); }
    catch (error) {
      if (previous) await this._applyAiConfiguration(previous);
      throw error;
    }
  }

  /** Path to the persisted non-secret AI settings document. */
  _aiSettingsPath() {
    const { app } = require('electron');
    return require('path').join(app.getPath('userData'), 'data', 'ai-settings.json');
  }

  _readAiSettings() {
    try { return JSON.parse(require('fs').readFileSync(this._aiSettingsPath(), 'utf-8')); }
    catch (_) { return {}; }
  }

  _writeAiSettings(obj) {
    const fs = require('fs');
    const p = this._aiSettingsPath();
    fs.mkdirSync(require('path').dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
  }

  /** Wrap a handler so thrown errors become a structured envelope. */
  _handle(channel, fn) {
    this.ipcMain.handle(channel, async (event, ...args) => {
      try {
        if (
          this.webContents
          && (event.sender !== this.webContents || event.senderFrame !== this.webContents.mainFrame)
        ) {
          throw new Error('拒绝来自不受信任渲染器的 IPC 请求');
        }
        const data = await fn(event, ...args);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    });
  }

  /** Case-insensitive city search across Chinese/English names. */
  _searchCities(query) {
    const q = String(query || '').trim().toLowerCase();
    const pool = q
      ? CITIES.map((city) => ({ city, score: searchScore(q, [city.nameZh, city.nameEn, city.country]) }))
        .filter(({ score }) => Number.isFinite(score)).sort((a, b) => a.score - b.score).map(({ city }) => city)
      : CITIES;
    return pool.slice(0, 40);
  }
}

module.exports = IpcRouter;
