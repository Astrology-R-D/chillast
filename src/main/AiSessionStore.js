'use strict';

const fs = require('fs');
const path = require('path');

class AiSessionStore {
  constructor(dataDir) {
    this.filePath = path.join(dataDir, 'ai-sessions.json');
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '[]', 'utf-8');
    return this;
  }

  _readAll() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch (_) {
      return [];
    }
  }

  _writeAll(sessions) {
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }

  list() {
    return this._readAll().sort((a, b) => {
      const pinDelta = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return pinDelta || (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }

  get(id) {
    return this._readAll().find((s) => s.id === id) || null;
  }

  create() {
    const sessions = this._readAll();
    const session = {
      id: String(Date.now()),
      messages: [],
      mode: 'chat',
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessions.push(session);
    this._writeAll(sessions);
    return session;
  }

  appendMessage(id, message) {
    const sessions = this._readAll();
    const session = sessions.find((s) => s.id === id);
    if (!session) return null;
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    this._writeAll(sessions);
    return session;
  }

  // Set a session's display title (AI-generated summary or manual rename).
  // Does not touch updatedAt so the list ordering is preserved.
  setTitle(id, title) {
    const sessions = this._readAll();
    const session = sessions.find((s) => s.id === id);
    if (!session) return null;
    session.title = String(title || '').slice(0, 40);
    this._writeAll(sessions);
    return session;
  }

  /**
   * Fork a session: copy messages up to AND including messages[messageIndex]
   * into a new linked session (design spec §2, model A2 —— 分支即派生会话;
   * 消息无 id，用下标定位). The source session is never modified.
   */
  fork(sessionId, messageIndex) {
    const sessions = this._readAll();
    const source = sessions.find((s) => s.id === sessionId);
    if (!source) return null;
    const index = Number(messageIndex);
    if (!Number.isInteger(index) || index < 0 || index >= source.messages.length) return null;
    const label = source.title
      || (source.messages.find((m) => m.role === 'user') || {}).content
      || '';
    const fork = {
      id: String(Date.now()),
      messages: source.messages.slice(0, index + 1).map((m) => ({ ...m })),
      mode: source.mode || 'chat',
      pinned: false,
      forkedFrom: { sessionId, messageIndex: index },
      title: `↩ 分支自 ${String(label).slice(0, 24)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessions.push(fork);
    this._writeAll(sessions);
    return fork;
  }

  /** Pin/unpin without touching updatedAt (ordering uses pinned + updatedAt). */
  setPinned(id, pinned) {
    const sessions = this._readAll();
    const session = sessions.find((s) => s.id === id);
    if (!session) return null;
    session.pinned = !!pinned;
    this._writeAll(sessions);
    return session;
  }

  delete(id) {
    const sessions = this._readAll();
    const next = sessions.filter((s) => s.id !== id);
    if (next.length !== sessions.length) this._writeAll(next);
    return next.length !== sessions.length;
  }
}

module.exports = AiSessionStore;
