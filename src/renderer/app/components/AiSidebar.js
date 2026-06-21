import { h, mount, clear } from '../Dom.js';
import { t } from '../I18n.js';
import { notify } from './Toast.js';
import { renderMarkdown } from './MarkdownRenderer.js';

export class AiSidebar {
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._configured = false;
    this._context = {};
    this._streaming = false;
    this._messages = [];
    this._currentSessionId = null;
    this._sessions = [];
    this._aiTurnEl = null;
    this._currentTextEl = null;
    this._currentSegmentText = '';
    this._currentAiText = '';
    this._statusListenerRegistered = false;
    this._build();
  }

  get element() { return this._root; }

  _build() {
    this._statusBanner = h('div', { class: 'ai-status-banner', style: { display: 'none' } });
    this._llmStatusDot = h('span', { class: 'llm-status-dot disconnected' }, '●');
    this._llmStatusText = h('span', { class: 'llm-status-text fs-xs text-muted' }, t('ai.llmDisconnected'));

    this._msgList = h('div', { class: 'chat-messages' });
    // Markdown links must open externally, never navigate the app window.
    // window.open routes through Main's setWindowOpenHandler → shell.openExternal.
    this._msgList.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a.chat-link');
      if (a && a.getAttribute('href')) {
        e.preventDefault();
        window.open(a.getAttribute('href'), '_blank', 'noopener');
      }
    });

    // ── Session controls (VSCode-style) ──────────────────────
    // A wide "current session" button shows the active conversation and opens a
    // history popover; a separate "＋" clearly starts a new chat.
    this._sessionTitleEl = h('span', { class: 'ai-session-current-title' }, t('ai.emptySession'));
    this._historyBtn = h('button', {
      class: 'btn btn-sm btn-ghost ai-session-history-btn',
      title: t('ai.history'),
      onclick: (e) => { e.stopPropagation(); this._toggleSessionPanel(); },
    }, [
      h('span', { class: 'ai-session-history-icon svg-glyph' }, '☰'),
      this._sessionTitleEl,
      h('span', { class: 'ai-session-caret' }, '⌄'),
    ]);

    this._newSessionBtn = h('button', {
      class: 'btn btn-sm btn-primary ai-session-new-btn',
      title: t('ai.newSession'),
      onclick: () => this._createSession(),
    }, [h('span', { class: 'svg-glyph' }, '＋'), t('ai.newChat')]);

    // History popover (hidden until toggled). Anchored under the session bar.
    this._sessionList = h('div', { class: 'ai-session-list' });
    this._sessionPanel = h('div', { class: 'ai-session-panel', style: { display: 'none' } }, [
      h('div', { class: 'ai-session-panel-header' }, t('ai.history')),
      this._sessionList,
    ]);
    // Close the popover when clicking anywhere outside it.
    this._onDocClick = (e) => {
      if (!this._sessionPanelOpen) return;
      if (this._sessionPanel.contains(e.target) || this._historyBtn.contains(e.target)) return;
      this._closeSessionPanel();
    };
    document.addEventListener('mousedown', this._onDocClick);

    // Textarea so the user can insert newlines (Shift+Enter); Enter sends.
    this._input = h('textarea', {
      class: 'input chat-input',
      rows: '1',
      placeholder: t('ai.inputPlaceholder'),
      onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); } },
      oninput: () => this._autoGrowInput(),
    });

    this._sendBtn = h('button', {
      class: 'btn btn-sm btn-primary',
      onclick: () => this._send(),
    }, t('ai.send'));

    this._stopBtn = h('button', {
      class: 'btn btn-sm btn-ghost',
      style: { display: 'none' },
      onclick: () => this._stop(),
    }, t('ai.stop'));

    // Drag handle on the left edge to resize the sidebar.
    this._resizeHandle = h('div', { class: 'ai-sidebar-resize', title: t('ai.resize') });
    this._resizeHandle.addEventListener('mousedown', (e) => this._startResize(e));

    this._root = h('aside', { class: 'ai-sidebar' }, [
      this._resizeHandle,
      h('div', { class: 'ai-sidebar-header' }, [
        h('span', { class: 'fs-md fw-semibold' }, t('ai.title')),
        h('div', { class: 'llm-status-indicator' }, [
          this._llmStatusDot,
          this._llmStatusText,
        ]),
      ]),
      h('div', { class: 'ai-session-bar' }, [
        this._historyBtn,
        this._newSessionBtn,
        this._sessionPanel,
      ]),
      this._statusBanner,
      h('div', { class: 'ai-sidebar-body' }, [
        this._msgList,
        h('div', { class: 'chat-input-row' }, [
          this._input,
          this._sendBtn,
          this._stopBtn,
        ]),
      ]),
    ]);

    this._addAiMessage('✶ AI 占星顾问已就绪\n\n你可以直接提问，或点击「AI 解读」分析当前星盘。');
    this._loadSessions();
  }

  // ── Session management ──────────────────────────────────

  async _loadSessions() {
    if (!this._sessionsListenerRegistered) {
      this._sessionsListenerRegistered = true;
      // Backend pushes this when an AI-generated title becomes available.
      window.mystApi.ai.onSessionsChanged(() => this._reloadSessionList());
    }
    try {
      const result = await window.mystApi.ai.sessions.list();
      this._sessions = (result.ok && result.data) || [];
      this._refreshSessionDropdown();
      if (this._sessions.length) {
        await this._switchSession(this._sessions[0].id);
      } else {
        await this._createSession();
      }
    } catch (_) {}
  }

  _refreshSessionDropdown() {
    this._renderSessionList();
    this._updateSessionBarTitle();
  }

  _updateSessionBarTitle() {
    const current = this._sessions.find((s) => s.id === this._currentSessionId);
    this._sessionTitleEl.textContent = current ? this._sessionLabel(current) : t('ai.emptySession');
  }

  _renderSessionList() {
    clear(this._sessionList);
    if (!this._sessions.length) {
      this._sessionList.appendChild(h('div', { class: 'ai-session-empty' }, t('ai.noSessions')));
      return;
    }
    for (const s of this._sessions) {
      const isActive = s.id === this._currentSessionId;
      const item = h('div', { class: `ai-session-item${isActive ? ' is-active' : ''}` }, [
        h('span', {
          class: 'ai-session-item-title',
          onclick: () => { this._switchSession(s.id); this._closeSessionPanel(); },
        }, this._sessionLabel(s)),
        h('button', {
          class: 'btn btn-sm btn-ghost ai-session-item-del',
          title: t('ai.deleteSession'),
          onclick: (e) => { e.stopPropagation(); this._deleteSession(s.id); },
        }, '✕'),
      ]);
      this._sessionList.appendChild(item);
    }
  }

  _toggleSessionPanel() {
    if (this._sessionPanelOpen) this._closeSessionPanel();
    else this._openSessionPanel();
  }

  _openSessionPanel() {
    if (this._streaming) return;
    this._renderSessionList();
    this._sessionPanel.style.display = '';
    this._historyBtn.classList.add('is-open');
    this._sessionPanelOpen = true;
  }

  _closeSessionPanel() {
    this._sessionPanel.style.display = 'none';
    this._historyBtn.classList.remove('is-open');
    this._sessionPanelOpen = false;
  }

  _sessionLabel(s) {
    if (s.title) return s.title;
    const firstUser = (s.messages || []).find((m) => m.role === 'user');
    if (firstUser && firstUser.content) {
      return firstUser.content.slice(0, 30);
    }
    return t('ai.emptySession');
  }

  async _createSession() {
    try {
      const result = await window.mystApi.ai.sessions.create();
      if (result.ok && result.data) {
        this._currentSessionId = result.data.id;
        this._sessions.unshift(result.data);
        this._refreshSessionDropdown();
        this._renderMessages([]);
        this._closeSessionPanel();
      }
    } catch (_) {}
  }

  async _switchSession(id) {
    if (this._streaming) return;
    try {
      const result = await window.mystApi.ai.sessions.get(id);
      const session = result.ok ? result.data : null;
      this._currentSessionId = id;
      // Guard against async race: don't re-render if user started streaming during fetch
      if (this._streaming) return;
      this._renderMessages((session && session.messages) || []);
      this._refreshSessionDropdown();
    } catch (_) {}
  }

  async _deleteSession(id) {
    if (!id || this._streaming) return;
    if (!confirm(t('ai.deleteSessionConfirm'))) return;
    try {
      await window.mystApi.ai.sessions.delete(id);
      this._sessions = this._sessions.filter((s) => s.id !== id);
      notify.success(t('ai.sessionDeleted'));
      // Only need to switch/create when the deleted session was the active one.
      if (id === this._currentSessionId) {
        if (this._sessions.length) {
          await this._switchSession(this._sessions[0].id);
        } else {
          await this._createSession();
        }
      } else {
        this._refreshSessionDropdown();
      }
    } catch (_) {}
  }

  // ── Message rendering ───────────────────────────────────

  _renderMessages(messages) {
    this._messages = [];
    clear(this._msgList);
    this._addAiMessage('✶ AI 占星顾问已就绪\n\n你可以直接提问，或点击「AI 解读」分析当前星盘。');
    for (const m of messages) {
      if (m.role === 'user') {
        this._addUserMessage(m.content);
      } else if (m.role === 'ai') {
        this._addAiMessage(m.content);
      }
    }
  }

  _send() {
    const text = this._input.value.trim();
    if (!text || this._streaming) return;
    this._input.value = '';
    this._autoGrowInput();
    this._addUserMessage(text);
    this._runChat(text);
  }

  /** Grow the chat textarea with its content, up to a max height. */
  _autoGrowInput() {
    const el = this._input;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  _stop() {
    if (this._sessionId) {
      window.mystApi.ai.stop(this._sessionId);
    }
    this._finishStreaming();
  }

  _setStreaming(streaming) {
    this._streaming = streaming;
    this._sendBtn.style.display = streaming ? 'none' : '';
    this._stopBtn.style.display = streaming ? '' : 'none';
    this._input.disabled = streaming;
    // Lock session controls while a response streams so the active session can't
    // drift out of sync with the conversation being rendered.
    this._historyBtn.disabled = streaming;
    this._newSessionBtn.disabled = streaming;
    if (streaming) this._closeSessionPanel();
  }

  _addUserMessage(text) {
    this._messages.push({ role: 'user', content: text });
    this._msgList.appendChild(h('div', { class: 'chat-msg chat-msg-user' }, [
      h('div', { class: 'chat-msg-body' }, text),
    ]));
    this._scrollToBottom();
  }

  _addAiMessage(text) {
    this._messages.push({ role: 'ai', content: text });
    this._msgList.appendChild(h('div', { class: 'chat-msg chat-msg-ai' }, [
      h('div', { class: 'chat-msg-body', html: renderMarkdown(text) }),
    ]));
    this._scrollToBottom();
  }

  _startAiStream() {
    this._currentAiText = '';
    this._currentSegmentText = '';
    this._currentTextEl = null;
    // One assistant "turn" holds interleaved text segments + tool-call cards.
    this._aiTurnEl = h('div', { class: 'chat-msg chat-msg-ai' });
    this._msgList.appendChild(this._aiTurnEl);
    this._scrollToBottom();
    this._setStreaming(true);
  }

  _appendToken(token) {
    if (!this._aiTurnEl) return;
    this._currentAiText += token;
    // Start a fresh text segment at the beginning or right after a tool card.
    if (!this._currentTextEl) {
      this._currentSegmentText = '';
      this._currentTextEl = h('div', { class: 'chat-msg-body' });
      this._aiTurnEl.appendChild(this._currentTextEl);
    }
    this._currentSegmentText += token;
    this._currentTextEl.innerHTML = renderMarkdown(this._currentSegmentText);
    this._scrollToBottom();
  }

  // Render a tool invocation as a distinct card (AI-coding-app style) instead of
  // inline markdown. Closes the current text segment so later text flows below it.
  _addToolCard(toolName) {
    if (!this._aiTurnEl) return;
    this._currentTextEl = null;
    const card = h('div', { class: 'tool-card running', dataset: { tool: toolName, started: String(Date.now()) } }, [
      h('span', { class: 'tool-card-icon' }, '⚙'),
      h('span', { class: 'tool-card-name' }, toolName),
      h('span', { class: 'tool-card-status' }, t('ai.toolRunning')),
    ]);
    this._aiTurnEl.appendChild(card);
    this._scrollToBottom();
  }

  _completeToolCard(toolName) {
    if (!this._aiTurnEl) return;
    for (const c of this._aiTurnEl.querySelectorAll('.tool-card.running')) {
      if (c.dataset.tool === toolName && c.dataset.completing !== '1') {
        c.dataset.completing = '1';
        // Fast tools (instant reads) finish in the same tick as 'calling', so the
        // running state never paints. Hold it for a minimum so it's visible.
        const elapsed = Date.now() - Number(c.dataset.started || 0);
        const wait = Math.max(0, 450 - elapsed);
        const finish = () => {
          c.classList.replace('running', 'done');
          const icon = c.querySelector('.tool-card-icon');
          if (icon) icon.textContent = '✓';
          const status = c.querySelector('.tool-card-status');
          if (status) status.textContent = t('ai.toolDone');
        };
        if (wait === 0) finish(); else setTimeout(finish, wait);
        break;
      }
    }
  }

  _finishStreaming() {
    // Settle any cards still "running" (e.g. on error/stop).
    if (this._aiTurnEl) {
      for (const c of this._aiTurnEl.querySelectorAll('.tool-card.running')) {
        c.classList.replace('running', 'done');
      }
    }
    if (this._currentAiText) {
      this._messages.push({ role: 'ai', content: this._currentAiText });
    }
    this._currentAiText = '';
    this._currentSegmentText = '';
    this._currentTextEl = null;
    this._aiTurnEl = null;
    this._setStreaming(false);
    // Backend has persisted new messages; reload list so session labels reflect them.
    this._reloadSessionList();
  }

  async _reloadSessionList() {
    try {
      const result = await window.mystApi.ai.sessions.list();
      this._sessions = (result.ok && result.data) || this._sessions;
      this._refreshSessionDropdown();
    } catch (_) {
      this._refreshSessionDropdown();
    }
  }

  _scrollToBottom() {
    this._msgList.scrollTop = this._msgList.scrollHeight;
  }

  _registerListeners() {
    window.mystApi.ai.removeAllListeners();
    window.mystApi.ai.onToken(({ type, data }) => {
      if (type === 'token') {
        this._appendToken(data);
      } else if (type === 'tool-call') {
        if (data.status === 'calling') this._addToolCard(data.tool);
        else if (data.status === 'done') this._completeToolCard(data.tool);
      }
    });
    window.mystApi.ai.onDone(() => {
      this._finishStreaming();
    });
    window.mystApi.ai.onError(({ message }) => {
      if (this._aiTurnEl) {
        this._appendToken(`\n\n❌ ${message}`);
      }
      this._finishStreaming();
    });
  }

  _runChat(text) {
    this._sessionId = this._currentSessionId || String(Date.now());
    this._registerListeners();
    this._startAiStream();
    // Only send current message — IPC handler loads full history from session store + appends user msg
    window.mystApi.ai.chat([{ role: 'user', content: text }], { sessionId: this._sessionId });
  }

  _triggerInterpret() {
    if (!this._context.lastChartData) { notify.error(t('ai.noChart')); return; }
    if (this._streaming) return;
    this._sessionId = this._currentSessionId || String(Date.now());
    this._registerListeners();
    this._addUserMessage(t('ai.interpret'));
    this._startAiStream();
    window.mystApi.ai.interpret(this._context.lastChartData, {
      chartType: this._context.chartType,
      sessionId: this._sessionId,
    });
  }

  // ── Public API (invoked by chart / 命理 views) ───────────

  /** Run "AI 解读" on the current chart (one-shot RAG interpretation). */
  triggerInterpret() { this._triggerInterpret(); }

  /** Send a chat message programmatically (e.g. "解读我的八字"). */
  sendMessage(text) {
    const msg = String(text || '').trim();
    if (!msg || this._streaming) return;
    this._addUserMessage(msg);
    this._runChat(msg);
  }

  // ── Resize ──────────────────────────────────────────────

  _startResize(e) {
    e.preventDefault();
    const shell = this._root.closest('.app-shell');
    if (!shell) return;
    this._resizeHandle.classList.add('dragging');
    document.body.classList.add('ai-resizing');
    const onMove = (ev) => {
      const width = Math.min(720, Math.max(300, window.innerWidth - ev.clientX));
      shell.style.setProperty('--ai-sidebar-width', `${width}px`);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._resizeHandle.classList.remove('dragging');
      document.body.classList.remove('ai-resizing');
      const w = shell.style.getPropertyValue('--ai-sidebar-width');
      if (w) { try { localStorage.setItem('ai.sidebarWidth', w); } catch (_) { /* ignore */ } }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /** Restore persisted sidebar width. Call after the shell is mounted. */
  restoreWidth() {
    try {
      const w = localStorage.getItem('ai.sidebarWidth');
      if (!w) return;
      const shell = this._root.closest('.app-shell');
      if (shell) shell.style.setProperty('--ai-sidebar-width', w);
    } catch (_) { /* ignore */ }
  }

  // ── Status ──────────────────────────────────────────────

  async updateStatus() {
    if (!this._statusListenerRegistered) {
      this._statusListenerRegistered = true;
      window.mystApi.ai.onStatusChanged((status) => {
        this._applyStatus(status);
      });
    }
    try {
      const result = await window.mystApi.ai.status();
      this._applyStatus(result.ok ? result.data : null);
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
