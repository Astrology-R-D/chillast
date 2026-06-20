import { h, mount } from '../Dom.js';
import { t } from '../I18n.js';
import { notify } from './Toast.js';

let _deepChatLoaded = false;

export class AiSidebar {
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._configured = false;
    this._context = {};
    this._interpretMode = false;
    this._root = h('aside', { class: 'ai-sidebar' });
    this._ready = this._build();
  }

  get element() { return this._root; }

  async _build() {
    if (!_deepChatLoaded) {
      await import('../../../../node_modules/deep-chat/dist/deepChat.js');      _deepChatLoaded = true;
    }

    this._statusBanner = h('div', { class: 'ai-status-banner', style: { display: 'none' } });

    this._llmStatusDot = h('span', { class: 'llm-status-dot disconnected' }, '●');
    this._llmStatusText = h('span', { class: 'llm-status-text fs-xs text-muted' }, t('ai.llmDisconnected'));

    // Create deep-chat element
    this._chatEl = document.createElement('deep-chat');
    this._chatEl.className = 'ai-deep-chat';

    // Dark theme colors — actual hex values (deep-chat shadow DOM can't read CSS vars)
    const C = {
      bgPanel: '#252526',
      bgElevated: 'rgba(45, 45, 45, 0.92)',
      bgInput: 'rgba(28, 28, 28, 0.88)',
      borderSoft: 'rgba(70, 70, 70, 0.55)',
      textPrimary: '#d4d4d4',
      textMuted: '#6d6d6d',
      accent: '#4fc1ff',
      accentStrong: '#7fdcff',
      accentVioletSoft: 'rgba(86, 156, 214, 0.15)',
      danger: '#f44747',
    };

    // Style
    this._chatEl.style = {
      borderRadius: '0',
      border: 'none',
      backgroundColor: C.bgPanel,
      color: C.textPrimary,
      flex: '1',
      minHeight: '0',
      fontFamily: 'inherit',
    };

    this._chatEl.textInput = {
      placeholder: { text: t('ai.inputPlaceholder') },
      styles: {
        text: { color: C.textPrimary, fontSize: '13px' },
        container: {
          background: C.bgInput,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: '0',
        },
      },
    };

    this._chatEl.messageStyles = {
      default: {
        shared: {
          inner: {
            styles: {
              color: C.textPrimary,
              background: C.bgElevated,
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              lineHeight: '1.6',
            },
          },
          outerContainer: { styles: { marginTop: '4px' } },
        },
        user: { bubble: { styles: { background: C.accentVioletSoft } } },
        ai: { bubble: { styles: { background: C.bgElevated } } },
      },
    };

    this._chatEl.submitButtonStyles = {
      submit: {
        container: {
          default: { backgroundColor: C.accent, color: '#fff' },
          hover: { backgroundColor: C.accentStrong },
        },
      },
      stop: {
        container: {
          default: { backgroundColor: C.danger, color: '#fff' },
        },
      },
    };

    // Set dark theme via auxiliaryStyle
    this._chatEl.auxiliaryStyle = `
      .deep-chat {
        background: ${C.bgPanel} !important;
        color: ${C.textPrimary} !important;
      }
      .deep-chat-input-area {
        background: ${C.bgPanel} !important;
        border-top: 1px solid ${C.borderSoft} !important;
      }
      .deep-chat-input-text-area-container {
        background: ${C.bgInput} !important;
      }
      .deep-chat-input-text-area::placeholder {
        color: ${C.textMuted} !important;
      }
      .deep-chat-to-bottom {
        background: ${C.bgElevated} !important;
        color: ${C.textPrimary} !important;
      }
      .deep-chat-suggestion-button {
        background: ${C.bgElevated} !important;
        color: ${C.textPrimary} !important;
        border: 1px solid ${C.borderSoft} !important;
      }
    `;

    this._chatEl.historyDisabled = true;

    this._chatEl.introMessage = {
      text: '✶ AI 占星顾问\n\n直接提问，或点击下方「AI 解读」分析当前星盘',
    };

    // Unified connect handler — routes to chat or interpret based on flag
    this._chatEl.connect = {
      handler: (body, signals) => this._handleMessage(body, signals),
    };

    // AI Interpret button
    this._interpretBtn = h('button', {
      class: 'btn btn-sm btn-ghost ai-interpret-btn',
      onclick: () => this._triggerInterpret(),
    }, t('ai.interpret'));

    // Populate the _root created in constructor
    mount(this._root, [
      h('div', { class: 'ai-sidebar-header' }, [
        h('span', { class: 'fs-md fw-semibold' }, t('ai.title')),
        h('div', { class: 'llm-status-indicator' }, [
          this._llmStatusDot,
          this._llmStatusText,
        ]),
      ]),
      this._statusBanner,
      h('div', { class: 'ai-sidebar-body' }, [
        this._chatEl,
        h('div', { class: 'ai-action-row' }, [this._interpretBtn]),
      ]),
    ]);

    // Register status change listener
    window.mystApi.ai.onStatusChanged((status) => {
      this._applyStatus(status);
    });
  }

  _handleMessage(body, signals) {
    // Check if this is an interpret trigger (user message = "AI 解读")
    const lastMsg = body.messages && body.messages[body.messages.length - 1];
    const isInterpret = this._interpretMode || (lastMsg && lastMsg.text === t('ai.interpret'));

    if (isInterpret) {
      this._interpretMode = false;
      this._runInterpret(signals);
      return;
    }

    this._runChat(body, signals);
  }

  _runChat(body, signals) {
    const messages = (body.messages || []).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.text || '',
    }));

    window.mystApi.ai.removeAllListeners();

    let fullText = '';

    window.mystApi.ai.onToken(({ type, data }) => {
      if (type === 'token') {
        fullText += data;
        signals.onResponse({ text: fullText, overwrite: true });
      } else if (type === 'tool-call') {
        fullText += `\n\n_⚙ ${data.tool}..._\n`;
        signals.onResponse({ text: fullText, overwrite: true });
      }
    });

    window.mystApi.ai.onDone(() => {
      if (!fullText) signals.onResponse({ text: '(无响应)', overwrite: true });
    });
    window.mystApi.ai.onError(({ message }) => {
      if (!fullText) signals.onResponse({ text: `❌ ${message}`, overwrite: true });
    });

    window.mystApi.ai.chat(messages, {});
  }

  _runInterpret(signals) {
    if (!this._context.lastChartData) {
      signals.onResponse({ text: t('ai.noChart'), overwrite: true });
      return;
    }

    window.mystApi.ai.removeAllListeners();

    let fullText = '';

    window.mystApi.ai.onToken(({ type, data }) => {
      if (type === 'token') {
        fullText += data;
        signals.onResponse({ text: fullText, overwrite: true });
      }
    });

    window.mystApi.ai.onDone(() => {
      if (!fullText) signals.onResponse({ text: '(无响应)', overwrite: true });
    });
    window.mystApi.ai.onError(({ message }) => {
      if (!fullText) signals.onResponse({ text: `❌ ${message}`, overwrite: true });
    });

    window.mystApi.ai.interpret(this._context.lastChartData, {
      chartType: this._context.chartType,
    });
  }

  _triggerInterpret() {
    if (!this._context.lastChartData) { notify.error(t('ai.noChart')); return; }
    // Set interpret flag then trigger deep-chat to send a user message
    this._interpretMode = true;
    this._chatEl.submitUserMessage({ text: t('ai.interpret') });
  }

  async updateStatus() {
    await this._ready;
    try {
      const result = await window.mystApi.ai.status();
      const status = result.ok ? result.data : null;
      this._applyStatus(status);
    } catch (_) {
      this._applyStatus(null);
    }
  }

  _applyStatus(status) {
    this._configured = status && status.configured;
    if (!this._configured) {
      this._statusBanner.style.display = '';
      mount(this._statusBanner, h('span', {}, [
        h('span', {}, t('ai.notConfigured') + ' '),
        h('a', { onclick: () => this._onNavigate('settings'), style: { cursor: 'pointer' } }, t('ai.goToSettings')),
        h('span', {}, ' ' + t('ai.toConfigure')),
      ]));
      this._llmStatusDot.className = 'llm-status-dot disconnected';
      this._llmStatusText.textContent = t('ai.llmDisconnected');
    } else {
      this._statusBanner.style.display = 'none';
      this._llmStatusDot.className = 'llm-status-dot connected';
      this._llmStatusText.textContent = `${status.provider || ''} · ${status.model || ''}`;
    }
  }

  setContext(context) {
    this._context = context;
  }
}
