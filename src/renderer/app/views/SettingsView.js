import { h, mount, clear } from '../Dom.js';
import { t } from '../I18n.js';
import { notify } from '../components/Toast.js';

// Fallback labels when the catalog IPC is unavailable (offline first run).
const PROVIDER_LABEL_FALLBACK = {
  openai: 'OpenAI', anthropic: 'Anthropic Claude', deepseek: 'DeepSeek',
  moonshot: 'Moonshot 月之暗面', zhipuai: 'ZhipuAI 智谱', tongyi: 'Tongyi 通义千问',
  minimax: 'MiniMax', volcengine: '火山方舟', siliconflow: '硅基流动 SiliconFlow',
  stepfun: '阶跃星辰 StepFun', openrouter: 'OpenRouter',
  ollama: 'Ollama (本地)', openai_compat: 'OpenAI 兼容端点',
};
const NO_KEY_PROVIDERS = new Set(['ollama']);
const FALLBACK_MAX_TOKENS = 8192;

// Chinese display names for the built-in tool providers (the `id`s are English).
const TOOL_PROVIDER_LABELS = {
  astro: '占星排盘工具',
  context: '当前上下文工具',
  kb: '知识库检索',
  web: '联网搜索',
  mcp: 'MCP 外部工具',
  profiles: '档案查询工具',
};

// Tool definitions only carry an English `name` + a Chinese `description`. Use the
// first clause of the description as a readable Chinese name; full text → tooltip.
function toolZhName(tool) {
  const desc = (tool.description || '').trim();
  if (!desc) return tool.name;
  return desc.split(/[。；;\n]/)[0].trim() || tool.name;
}

export class SettingsView {
  constructor(context) {
    this.ctx = context;
    // Monotonic sequence for provider switches: an async rebuild superseded by
    // a newer switch must not touch the DOM (rapid-switch race guard).
    this._providerSeq = 0;
    // Refresh the tools / knowledge / status sections when the AI service finishes
    // (re)configuring — e.g. after first-launch async init or saving a key — so they
    // don't show stale "empty". Only redraw when this view is the one on screen.
    if (window.mystApi && window.mystApi.ai && window.mystApi.ai.onStatusChanged) {
      window.mystApi.ai.onStatusChanged(() => {
        if (this.container && this.container.querySelector('.settings-container')) this._draw();
      });
    }
  }

  get title() {
    return { h1: t('settings.title'), sub: t('settings.sub') };
  }

  render(container) {
    this.container = container;
    this._draw();
  }

  async _draw() {
    const status = await this._fetchStatus();
    const knowledgeDocs = await this._fetchKnowledge();
    const sessions = await this._fetchSessions();
    const toolProviders = await this._fetchTools();
    const mcpInfo = await this._fetchMcp();

    this._providers = await this._fetchCatalogProviders();
    this.providerSelect = h('select', {
      class: 'select',
      onchange: (e) => this._onProviderChange(e.target.value),
    }, (this._providers || Object.keys(PROVIDER_LABEL_FALLBACK).map((key) => ({
      key, label: PROVIDER_LABEL_FALLBACK[key], needsKey: !NO_KEY_PROVIDERS.has(key),
    }))).map((p) =>
      h('option', { value: p.key, selected: p.key === (status && status.provider) }, p.label)
    ));

    const providerKey = (status && status.provider) || 'openai';
    const catalogModels = await this._fetchCatalogModels(providerKey);
    this._catalogModels = catalogModels;
    const currentModel = (status && status.model) || '';
    this._modelCustom = !catalogModels.length || (!!currentModel && !catalogModels.some((m) => m.id === currentModel));

    this._modelHost = h('div', {});
    if (catalogModels.length) {
      this._modelSelect = h('select', {
        class: 'select',
        onchange: (e) => this._onModelSelectChange(e.target.value),
      }, [
        ...catalogModels.map((m) => h('option', {
          value: m.id,
          selected: m.id === currentModel,
        }, t('settings.modelMeta', {
          name: m.name, context: m.limitContext, price: `${m.costInput}/${m.costOutput} $/M`,
        }))),
        h('option', { value: '__custom__', selected: this._modelCustom }, t('settings.catalogCustom')),
      ]);
      this.modelInput = h('input', {
        class: 'input', type: 'text',
        value: this._modelCustom ? currentModel : '',
        placeholder: t('settings.customModelPlaceholder'),
        style: { display: this._modelCustom ? '' : 'none' },
      });
      mount(this._modelHost, [this._modelSelect, this.modelInput]);
      // modelInput is what _onSave/_onTestConnection read — seed it with the
      // select's initial selection so saving without touching the dropdown
      // keeps the displayed model (the pair stays in sync in both directions).
      if (!this._modelCustom) this.modelInput.value = this._modelSelect.value || '';
    } else {
      this._modelSelect = null;
      this.modelInput = h('input', {
        class: 'input', type: 'text',
        value: currentModel || 'gpt-4o',
        placeholder: 'gpt-4o',
      });
      mount(this._modelHost, [this.modelInput]);
    }

    this.apiKeyInput = h('input', {
      class: 'input',
      type: 'password',
      placeholder: t('settings.apiKeyPlaceholder'),
    });

    this.apiKeyStatus = h('span', {}, '');

    this.baseUrlInput = h('input', {
      class: 'input',
      type: 'text',
      value: (status && status.baseUrl) || '',
      placeholder: t('settings.baseUrlPlaceholder'),
    });

    const savedTemp = (status && typeof status.temperature === 'number') ? String(status.temperature) : '0.7';
    const savedMaxTokens = (status && typeof status.maxTokens === 'number') ? String(status.maxTokens) : '';
    this._maxTokensLimit = this._currentModelLimit() || FALLBACK_MAX_TOKENS;
    const initialMax = savedMaxTokens || String(this._maxTokensLimit);
    // Committed maxTokens — single source of truth; the visible controls only
    // mirror it (and are consolidated back to it on blur).
    this._maxTokens = parseInt(initialMax, 10) || this._maxTokensLimit;

    this.tempInput = h('input', {
      class: 'input',
      type: 'range', min: '0', max: '1', step: '0.1', value: savedTemp,
      oninput: (e) => { this.tempValue.textContent = e.target.value; },
    });
    this.tempValue = h('span', { class: 'range-value' }, savedTemp);

    this.maxTokensRange = h('input', {
      class: 'input', type: 'range',
      min: '512', max: String(this._maxTokensLimit), step: '512', value: initialMax,
      oninput: (e) => this._setMaxTokens(e.target.value, 'range'),
    });
    this.maxTokensInput = h('input', {
      class: 'input max-tokens-number', type: 'number',
      min: '512', max: String(this._maxTokensLimit), value: initialMax,
      oninput: (e) => this._setMaxTokens(e.target.value, 'number'),
      onblur: () => this._setMaxTokens(this.maxTokensInput.value, 'blur'),
    });
    this.maxTokensValue = h('span', { class: 'range-value' }, initialMax);
    this._maxTokensLimitLabel = h('span', { class: 'fs-xs text-muted' }, t('settings.maxTokensLimit', { count: this._maxTokensLimit }));

    this.testBtn = h('button', {
      class: 'btn btn-ghost',
      onclick: () => this._onTestConnection(),
    }, t('settings.testConnection'));

    this.testResult = h('span', { class: 'test-result' }, '');

    this.saveBtn = h('button', {
      class: 'btn btn-primary',
      onclick: () => this._onSave(),
    }, t('settings.save'));

    this._updateApiKeyStatus(status && status.configured);

    const aiConfigSection = h('div', { class: 'settings-section' }, [
      h('h3', {}, t('settings.aiConfig')),
      h('div', { class: 'settings-row' }, [
        h('label', {}, t('settings.provider')),
        this.providerSelect,
      ]),
      h('div', { class: 'settings-row' }, [
        h('label', {}, t('settings.model')),
        this._modelHost,
      ]),
      h('div', { class: 'settings-row' }, [
        h('label', {}, t('settings.apiKey')),
        this.apiKeyInput,
        this.apiKeyStatus,
      ]),
      h('div', { class: 'settings-row' }, [
        h('label', {}, t('settings.baseUrl')),
        this.baseUrlInput,
      ]),
      h('div', { class: 'settings-row' }, [
        h('label', {}, t('settings.temperature')),
        this.tempInput,
        this.tempValue,
      ]),
      h('div', { class: 'settings-row' }, [
        h('label', {}, t('settings.maxTokens')),
        this.maxTokensRange,
        this.maxTokensInput,
        this.maxTokensValue,
      ]),
      this._maxTokensLimitLabel,
      h('div', { class: 'settings-actions' }, [
        this.saveBtn,
        this.testBtn,
        this.testResult,
      ]),
    ]);

    const knowledgeSection = this._buildKnowledgeSection(knowledgeDocs);

    const sessionsSection = this._buildSessionsSection(sessions);

    const toolsSection = this._buildToolsSection(toolProviders, mcpInfo);

    const statusSection = this._buildStatusSection(status, knowledgeDocs);

    mount(this.container, h('div', { class: 'settings-container' }, [
      aiConfigSection,
      toolsSection,
      knowledgeSection,
      sessionsSection,
      statusSection,
    ]));
  }

  // —— Tools & MCP —————————————————————————————————————————————
  _buildToolsSection(providers, mcpInfo) {
    // Provider list with per-provider enable toggle, Chinese tool names and a
    // status light (no status text).
    const providerRows = (providers || []).map((p) => {
      const statusClass = !p.enabled ? 'is-off' : (p.ready ? 'is-on' : 'is-warn');
      const statusTitle = !p.enabled
        ? t('settings.toolDisabled')
        : (p.ready ? t('settings.toolReady') : t('settings.toolNotReady'));
      const toggle = h('input', {
        type: 'checkbox',
        checked: p.enabled,
        onchange: (e) => this._onToggleProvider(p.id, e.target.checked),
      });
      const toolItems = (p.tools || []).map((tool) =>
        h('div', { class: 'tool-item', title: tool.description || '' }, [
          h('span', { class: 'tool-item-name' }, toolZhName(tool)),
          h('span', { class: 'tool-item-id' }, tool.name),
        ]));
      return h('div', { class: 'tool-provider-row' }, [
        h('div', { class: 'tool-provider-head' }, [
          h('label', { class: 'tool-provider-name' }, [toggle, h('span', {}, ` ${TOOL_PROVIDER_LABELS[p.id] || p.id}`)]),
          h('span', { class: 'tool-provider-count' }, `${(p.tools || []).length}`),
          h('span', { class: `status-dot ${statusClass}`, title: statusTitle }),
        ]),
        h('div', { class: 'tool-item-list' }, toolItems.length
          ? toolItems
          : [h('span', { class: 'text-muted fs-xs' }, '—')]),
      ]);
    });

    // MCP servers: editable draft, saved as a whole.
    this._mcpDraft = JSON.parse(JSON.stringify((mcpInfo && mcpInfo.servers) || {}));
    this._mcpHost = h('div', { class: 'mcp-server-list' });
    this._renderMcpServers();

    const toolCount = (mcpInfo && mcpInfo.toolCount) || 0;

    return h('div', { class: 'settings-section' }, [
      h('h3', {}, t('settings.toolsTitle')),
      h('div', { class: 'fs-sm text-muted mb-2' }, t('settings.toolsHint')),
      h('div', { class: 'tool-provider-list' }, providerRows),
      h('h4', { class: 'mt-3 mb-1' }, t('settings.mcpTitle')),
      h('div', { class: 'fs-sm text-muted mb-2' }, t('settings.mcpHint', { count: toolCount })),
      this._mcpHost,
      this._buildMcpAddForm(),
    ]);
  }

  _renderMcpServers() {
    const names = Object.keys(this._mcpDraft);
    if (!names.length) {
      mount(this._mcpHost, h('div', { class: 'fs-sm text-muted' }, t('settings.mcpEmpty')));
      return;
    }
    mount(this._mcpHost, names.map((name) => {
      const cfg = this._mcpDraft[name];
      const transport = cfg.transport || (cfg.url ? 'http' : 'stdio');
      const target = cfg.url || `${cfg.command || ''} ${(cfg.args || []).join(' ')}`.trim();
      return h('div', { class: 'knowledge-list-item' }, [
        h('span', {}, [
          h('label', {}, [
            h('input', {
              type: 'checkbox',
              checked: !!cfg.enabled,
              onchange: (e) => this._onToggleMcpServer(name, e.target.checked),
            }),
            h('span', { class: 'doc-name', style: { marginLeft: '6px' } }, name),
          ]),
          h('span', { class: 'doc-source' }, `${transport} · ${target}`),
        ]),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this._onRemoveMcpServer(name) }, t('settings.removeDoc')),
      ]);
    }));
  }

  _buildMcpAddForm() {
    const nameInput = h('input', { class: 'input', placeholder: t('settings.mcpName') });
    const transportSelect = h('select', { class: 'select' }, [
      h('option', { value: 'stdio' }, 'stdio'),
      h('option', { value: 'sse' }, 'sse'),
      h('option', { value: 'http' }, 'http'),
    ]);
    const targetInput = h('input', { class: 'input', placeholder: t('settings.mcpTargetHint') });
    const addBtn = h('button', {
      class: 'btn btn-ghost',
      onclick: () => this._onAddMcpServer(nameInput, transportSelect, targetInput),
    }, t('settings.mcpAdd'));
    const saveBtn = h('button', {
      class: 'btn btn-primary',
      onclick: () => this._onSaveMcp(),
    }, t('settings.mcpSave'));

    return h('div', { class: 'mcp-add-form mt-2' }, [
      h('div', { class: 'mcp-add-row' }, [nameInput, transportSelect, targetInput, addBtn]),
      h('div', { class: 'mt-2' }, [saveBtn]),
    ]);
  }

  async _onToggleProvider(id, enabled) {
    try { await window.mystApi.ai.tools.setProviderEnabled(id, enabled); }
    catch (err) { notify.error(err.message); }
  }

  _onToggleMcpServer(name, enabled) {
    if (enabled && !confirm(t('settings.mcpEnableConfirm', { name }))) {
      this._renderMcpServers();
      return;
    }
    if (this._mcpDraft[name]) this._mcpDraft[name].enabled = enabled;
  }

  _onRemoveMcpServer(name) {
    delete this._mcpDraft[name];
    this._renderMcpServers();
  }

  _onAddMcpServer(nameInput, transportSelect, targetInput) {
    const name = nameInput.value.trim();
    const transport = transportSelect.value;
    const target = targetInput.value.trim();
    if (!name || !target) { notify.error(t('settings.mcpAddInvalid')); return; }
    const cfg = { transport, enabled: false };
    if (transport === 'stdio') {
      const parts = target.split(/\s+/);
      cfg.command = parts[0];
      cfg.args = parts.slice(1);
    } else {
      cfg.url = target;
    }
    this._mcpDraft[name] = cfg;
    nameInput.value = '';
    targetInput.value = '';
    this._renderMcpServers();
  }

  async _onSaveMcp() {
    const hasEnabled = Object.values(this._mcpDraft).some((c) => c && c.enabled);
    if (hasEnabled && !confirm(t('settings.mcpSaveConfirm'))) return;
    try {
      const result = await window.mystApi.ai.mcp.save(this._mcpDraft);
      if (result.ok) {
        notify.success(t('settings.mcpSaved'));
        await this._refresh();
      } else {
        notify.error(result.error || t('settings.mcpSaveFailed'));
      }
    } catch (err) { notify.error(err.message); }
  }

  async _fetchTools() {
    try {
      const result = await window.mystApi.ai.tools.describe();
      return result.ok ? (result.data || []) : [];
    } catch (_) { return []; }
  }

  async _fetchMcp() {
    try {
      const result = await window.mystApi.ai.mcp.list();
      return result.ok ? (result.data || { servers: {}, toolCount: 0 }) : { servers: {}, toolCount: 0 };
    } catch (_) { return { servers: {}, toolCount: 0 }; }
  }

  _buildSessionsSection(sessions) {
    const rows = sessions.map((s) => {
      const title = s.title || this._firstUserText(s) || t('settings.sessionUntitled');
      const meta = t('settings.sessionMeta', {
        count: (s.messages || []).length,
        date: this._formatDate(s.updatedAt || s.createdAt),
      });
      return h('div', { class: 'knowledge-list-item' }, [
        h('span', {}, [
          h('span', { class: 'doc-name' }, title),
          h('span', { class: 'doc-source' }, meta),
        ]),
        h('span', { class: 'session-actions' }, [
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this._onRegenTitle(s) }, t('settings.sessionRegenTitle')),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this._onRenameSession(s) }, t('settings.sessionRename')),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this._onDeleteSession(s) }, t('settings.removeDoc')),
        ]),
      ]);
    });

    return h('div', { class: 'settings-section' }, [
      h('h3', {}, t('settings.sessions')),
      h('div', { class: 'fs-sm text-muted mb-2' }, t('settings.sessionsHint', { count: sessions.length })),
      h('div', { class: 'knowledge-list' }, rows.length
        ? rows
        : [h('div', { class: 'fs-sm text-muted' }, t('settings.sessionsEmpty'))]),
    ]);
  }

  _buildKnowledgeSection(docs) {
    const builtin = docs.filter((d) => d.source === 'builtin');
    const user = docs.filter((d) => d.source === 'user');

    const fileInput = h('input', {
      type: 'file',
      accept: '.md,.txt,.pdf',
      multiple: true,
      style: { display: 'none' },
      onchange: (e) => this._onImport(e.target.files),
    });

    const importBtn = h('button', {
      class: 'btn btn-sm btn-ghost',
      onclick: () => fileInput.click(),
    }, t('settings.importDocs'));

    const builtinItems = builtin.map((d) =>
      h('div', { class: 'knowledge-list-item' }, [
        h('span', {}, [
          h('span', { class: 'doc-name' }, d.name),
          h('span', { class: 'doc-source' }, 'builtin'),
        ]),
      ])
    );

    const userItems = user.map((d) =>
      h('div', { class: 'knowledge-list-item' }, [
        h('span', {}, [
          h('span', { class: 'doc-name' }, d.name),
          h('span', { class: 'doc-source' }, 'user'),
        ]),
        h('button', {
          class: 'btn btn-sm btn-ghost',
          onclick: () => this._onRemoveDoc(d),
        }, t('settings.removeDoc')),
      ])
    );

    return h('div', { class: 'settings-section' }, [
      h('h3', {}, t('settings.knowledge')),
      h('div', { class: 'fs-sm text-muted mb-2' }, t('settings.builtinDocs', { count: builtin.length })),
      h('div', { class: 'knowledge-list' }, builtinItems),
      h('div', { class: 'fs-sm text-muted mt-3 mb-2' }, t('settings.userDocs', { count: user.length })),
      h('div', { class: 'knowledge-list' }, userItems),
      h('div', { class: 'mt-2' }, [fileInput, importBtn]),
    ]);
  }

  _buildStatusSection(status, docs) {
    return h('div', { class: 'settings-section' }, [
      h('h3', {}, t('settings.status')),
      h('div', { class: 'settings-status-row' }, [
        h('span', { class: 'label' }, t('settings.serviceStatus')),
        h('span', { class: 'value' }, status && status.configured
          ? h('span', { class: 'api-key-configured' }, t('settings.configured'))
          : h('span', { class: 'api-key-not-set' }, t('settings.notConfigured'))),
      ]),
      h('div', { class: 'settings-status-row' }, [
        h('span', { class: 'label' }, t('settings.providerLabel')),
        h('span', { class: 'value' }, (status && status.provider) || '—'),
      ]),
      h('div', { class: 'settings-status-row' }, [
        h('span', { class: 'label' }, t('settings.modelLabel')),
        h('span', { class: 'value' }, (status && status.model) || '—'),
      ]),
      h('div', { class: 'settings-status-row' }, [
        h('span', { class: 'label' }, t('settings.knowledge')),
        h('span', { class: 'value' }, t('settings.knowledgeCount', { count: docs.length })),
      ]),
    ]);
  }

  _updateApiKeyStatus(configured) {
    mount(this.apiKeyStatus, h('span', {},
      configured
        ? h('span', { class: 'api-key-configured' }, t('settings.apiKeyConfigured'))
        : h('span', { class: 'api-key-not-set' }, t('settings.apiKeyNotSet'))
    ));
  }

  _onModelSelectChange(value, fromUser = true) {
    if (value === '__custom__') {
      this._modelCustom = true;
      this.modelInput.style.display = '';
      this.modelInput.value = '';
      // Only a real user pick may take focus — programmatic selections
      // (provider switch / bounds re-clamp) must not yank it away.
      if (fromUser) this.modelInput.focus();
    } else {
      this._modelCustom = false;
      this.modelInput.style.display = 'none';
      this.modelInput.value = value;
    }
    this._applyModelBounds();
  }

  async _onProviderChange(provider) {
    // Rapid-switch guard: only the latest switch may touch the DOM once the
    // catalog fetch resolves — a slower, superseded fetch must not clobber it.
    const seq = ++this._providerSeq;
    // Show/hide API key field based on provider
    const needsKey = !NO_KEY_PROVIDERS.has(provider);
    this.apiKeyInput.parentElement.style.display = needsKey ? '' : 'none';
    this._catalogModels = await this._fetchCatalogModels(provider);
    if (seq !== this._providerSeq) return;
    // Rebuild the model picker unconditionally, mirroring _draw: the initially
    // drawn provider may have had no catalog (ollama / openai_compat leave
    // _modelSelect null), and the old `if (this._modelSelect)` guard meant a
    // switch to a catalog provider never built the dropdown at all.
    if (this._catalogModels.length) {
      const options = this._catalogModels.map((m) => h('option', { value: m.id }, t('settings.modelMeta', {
        name: m.name, context: m.limitContext, price: `${m.costInput}/${m.costOutput} $/M`,
      })));
      options.push(h('option', { value: '__custom__' }, t('settings.catalogCustom')));
      this._modelSelect = h('select', {
        class: 'select',
        onchange: (e) => this._onModelSelectChange(e.target.value),
      }, options);
      mount(this._modelHost, [this._modelSelect, this.modelInput]);
      this._onModelSelectChange(this._catalogModels[0].id, false);
    } else {
      // Providers without catalog models (ollama / 兼容端点): mirror _draw —
      // no select at all, just surface the free-text input.
      this._modelSelect = null;
      mount(this._modelHost, [this.modelInput]);
      this._onModelSelectChange('__custom__', false);
    }
    this._applyModelBounds();
  }

  /** Effective output limit of the currently selected model (null if unknown). */
  _currentModelLimit() {
    const modelId = this.modelInput && this.modelInput.value;
    const hit = (this._catalogModels || []).find((m) => m.id === modelId);
    return hit ? hit.limitOutput : null;
  }

  _setMaxTokens(raw, source) {
    const parsed = parseInt(raw, 10);
    const limit = this._maxTokensLimit || FALLBACK_MAX_TOKENS;
    let value = Number.isFinite(parsed) ? parsed : limit;
    value = Math.max(512, Math.min(value, limit));
    // Commit the clamped value — this._maxTokens is the source of truth that
    // _onSave/_onTestConnection read; the visible controls only mirror it.
    this._maxTokens = value;
    // Display sync — never rewrite the focused input: while typing in the
    // number box only the slider + readout move; every other source ('range',
    // a model-bounds change, or 'blur' consolidating the raw typed text into
    // the clamped value) may rewrite the now-unfocused number input.
    if (source === 'number') this.maxTokensRange.value = String(value);
    else this.maxTokensInput.value = String(value);
    this.maxTokensValue.textContent = String(value);
  }

  /** Re-clamp the controls when the selected model changes. */
  _applyModelBounds() {
    if (!this.maxTokensRange) return;
    const limit = this._currentModelLimit() || FALLBACK_MAX_TOKENS;
    this._maxTokensLimit = limit;
    this.maxTokensRange.max = String(limit);
    this.maxTokensInput.max = String(limit);
    this._maxTokensLimitLabel.textContent = t('settings.maxTokensLimit', { count: limit });
    this._setMaxTokens(String(this._maxTokens ?? limit), 'range');
  }

  async _onSave() {
    this.saveBtn.textContent = t('settings.saving');
    this.saveBtn.disabled = true;
    try {
      const settings = {
        provider: this.providerSelect.value,
        model: this.modelInput.value,
        temperature: parseFloat(this.tempInput.value),
        maxTokens: this._maxTokens,
        baseUrl: this.baseUrlInput.value || undefined,
      };
      if (this.apiKeyInput.value) {
        settings.apiKey = this.apiKeyInput.value;
      }
      const result = await window.mystApi.ai.configure(settings);
      if (result.ok) {
        notify.success(t('settings.saved'));
        this.apiKeyInput.value = '';
        await this._refresh();
      } else {
        notify.error(t('settings.saveFailed', { message: result.error }));
      }
    } catch (err) {
      notify.error(t('settings.saveFailed', { message: err.message }));
    }
    this.saveBtn.textContent = t('settings.save');
    this.saveBtn.disabled = false;
  }

  async _onTestConnection() {
    this.testBtn.textContent = t('settings.testing');
    this.testBtn.disabled = true;
    mount(this.testResult, h('span', { class: 'test-result testing' }, '…'));
    try {
      const settings = {
        provider: this.providerSelect.value,
        model: this.modelInput.value,
        temperature: parseFloat(this.tempInput.value),
        maxTokens: this._maxTokens,
        baseUrl: this.baseUrlInput.value || undefined,
      };
      if (this.apiKeyInput.value) {
        settings.apiKey = this.apiKeyInput.value;
      }
      const result = await window.mystApi.ai.testWithSettings(settings);
      if (result.ok) {
        notify.success(t('settings.testSuccess'));
        mount(this.testResult, h('span', { class: 'test-result success' }, t('settings.testSuccess')));
      } else {
        notify.error(t('settings.testFailed', { message: result.error }));
        mount(this.testResult, h('span', { class: 'test-result failed' }, result.error));
      }
    } catch (err) {
      notify.error(t('settings.testFailed', { message: err.message }));
      mount(this.testResult, h('span', { class: 'test-result failed' }, err.message));
    }
    this.testBtn.textContent = t('settings.testConnection');
    this.testBtn.disabled = false;
  }

  async _onImport(fileList) {
    if (!fileList || !fileList.length) return;
    try {
      const paths = Array.from(fileList).map((f) => f.path);
      const result = await window.mystApi.ai.knowledge.import(paths);
      if (result.ok) {
        notify.success(t('settings.imported', { count: result.data.count }));
        await this._refresh();
      } else {
        notify.error(t('settings.importFailed', { message: result.error }));
      }
    } catch (err) {
      notify.error(t('settings.importFailed', { message: err.message }));
    }
  }

  async _onRemoveDoc(doc) {
    if (!confirm(t('settings.removeConfirm', { name: doc.name }))) return;
    try {
      const result = await window.mystApi.ai.knowledge.remove(doc.id);
      if (result.ok) {
        notify.success(t('settings.removed'));
        await this._refresh();
      }
    } catch (err) {
      notify.error(err.message);
    }
  }

  _firstUserText(s) {
    const u = (s.messages || []).find((m) => m.role === 'user');
    return u && u.content ? u.content.slice(0, 24) : '';
  }

  _formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (_) { return ''; }
  }

  async _onRenameSession(s) {
    const current = s.title || this._firstUserText(s) || '';
    const next = prompt(t('settings.sessionRenamePrompt'), current);
    if (next == null) return;
    const title = next.trim();
    if (!title) return;
    try {
      await window.mystApi.ai.sessions.rename(s.id, title);
      notify.success(t('settings.sessionRenamed'));
      await this._refresh();
    } catch (err) { notify.error(err.message); }
  }

  async _onRegenTitle(s) {
    try {
      const result = await window.mystApi.ai.sessions.generateTitle(s.id);
      const title = result.ok && result.data ? result.data.title : '';
      if (title) {
        notify.success(t('settings.sessionTitleGenerated', { title }));
      } else {
        notify.error(t('settings.sessionTitleFailed'));
      }
      await this._refresh();
    } catch (err) { notify.error(err.message); }
  }

  async _onDeleteSession(s) {
    if (!confirm(t('ai.deleteSessionConfirm'))) return;
    try {
      await window.mystApi.ai.sessions.delete(s.id);
      notify.success(t('ai.sessionDeleted'));
      await this._refresh();
    } catch (err) { notify.error(err.message); }
  }

  async _fetchSessions() {
    try {
      const result = await window.mystApi.ai.sessions.list();
      return result.ok ? (result.data || []) : [];
    } catch (_) { return []; }
  }

  async _fetchCatalogProviders() {
    try {
      const result = await window.mystApi.ai.catalog.providers();
      const providers = result.ok ? result.data : null;
      return Array.isArray(providers) && providers.length ? providers : null;
    } catch (_) { return null; }
  }

  async _fetchCatalogModels(providerKey) {
    try {
      const result = await window.mystApi.ai.catalog.models(providerKey);
      return result.ok && Array.isArray(result.data) ? result.data : [];
    } catch (_) { return []; }
  }

  async _fetchStatus() {
    try {
      const result = await window.mystApi.ai.status();
      return result.ok ? result.data : null;
    } catch (_) { return null; }
  }

  async _fetchKnowledge() {
    try {
      const result = await window.mystApi.ai.knowledge.list();
      return result.ok ? (result.data || []) : [];
    } catch (_) { return []; }
  }

  async _refresh() {
    clear(this.container);
    await this._draw();
  }
}
