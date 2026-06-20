import { h, mount } from '../Dom.js';
import { renderMarkdown } from './MarkdownRenderer.js';

export class ChatPanel {
  constructor({ onInterpret, onSend, onStop }) {
    this._messages = [];
    this._streaming = false;
    this._currentAiMessage = '';
    this._onInterpret = onInterpret;
    this._onSend = onSend;
    this._onStop = onStop;
    this._build();
  }

  get element() { return this._root; }

  _build() {
    this._msgList = h('div', { class: 'chat-messages' });
    this._input = h('input', {
      class: 'input chat-input',
      placeholder: '输入问题...',
      onkeydown: (e) => { if (e.key === 'Enter') this._send(); },
    });

    const btns = this._streaming
      ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this._onStop() }, '停止')
      : [
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => this._send() }, '发送'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this._onInterpret() }, 'AI 解读'),
      ];

    this._root = h('div', { class: 'chat-panel' }, [
      this._msgList,
      h('div', { class: 'chat-input-row' }, [
        this._input,
        ...(Array.isArray(btns) ? btns : [btns]),
      ]),
    ]);
  }

  _send() {
    const text = this._input.value.trim();
    if (!text) return;
    this._input.value = '';
    this._addMessage('user', text);
    this._onSend(text);
  }

  _addMessage(role, content) {
    this._messages.push({ role, content });
    this._render();
  }

  appendToken(token) {
    this._currentAiMessage += token;
    this._render();
  }

  finishStreaming() {
    if (this._currentAiMessage) {
      this._messages.push({ role: 'ai', content: this._currentAiMessage });
    }
    this._currentAiMessage = '';
    this._streaming = false;
    this._build();
  }

  showToolCall(name) {
    this._messages.push({ role: 'tool', content: `正在计算: ${name}...` });
    this._render();
  }

  _render() {
    const items = this._messages.map((m) => {
      const cls = `chat-msg chat-msg-${m.role}`;
      const body = m.role === 'ai'
        ? h('div', { class: 'chat-msg-body', html: renderMarkdown(m.content) })
        : h('div', { class: 'chat-msg-body' }, m.content);
      return h('div', { class: cls }, [body]);
    });
    if (this._currentAiMessage) {
      items.push(h('div', { class: 'chat-msg chat-msg-ai' }, [
        h('div', { class: 'chat-msg-body', html: renderMarkdown(this._currentAiMessage) }),
        h('span', { class: 'chat-cursor' }, '▌'),
      ]));
    }
    mount(this._msgList, items);
    this._msgList.scrollTop = this._msgList.scrollHeight;
  }
}
