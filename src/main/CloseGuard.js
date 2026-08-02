'use strict';

class CloseGuard {
  constructor({ win, timeoutMs = 15000, diagnostic = () => {} }) {
    this.win = win;
    this.timeoutMs = timeoutMs;
    this.diagnostic = diagnostic;
    this.pending = false;
    this.approved = false;
    this.timer = null;
    this.closeTask = null;
    this.installed = false;
    this._onClose = this._onClose.bind(this);
    this._onRendererUnavailable = this._onRendererUnavailable.bind(this);
  }

  install() {
    if (this.installed) return;
    this.installed = true;
    this.win.on('close', this._onClose);
    this.win.on('unresponsive', this._onRendererUnavailable);
    this.win.webContents.on('render-process-gone', this._onRendererUnavailable);
    this.win.webContents.on('destroyed', this._onRendererUnavailable);
  }

  _onClose(event) {
    if (this.approved || this.win.webContents.isDestroyed()) return;
    event.preventDefault();
    if (this.pending) return;
    this.pending = true;
    try {
      this.win.webContents.send('app:closeRequested');
    } catch (_) {
      this._forceClose();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pending = false;
      this.diagnostic('The close request timed out. Your edits were not discarded; try closing again.');
    }, this.timeoutMs);
  }

  decide(decision) {
    if (decision !== 'proceed' && decision !== 'cancel') throw new Error('Invalid close decision');
    if (!this.pending) return false;
    this._clearPending();
    if (decision === 'cancel') return true;
    this._forceClose();
    return true;
  }

  _clearPending() {
    this.pending = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  _forceClose() {
    this._clearPending();
    if (this.approved || this.win.isDestroyed()) return;
    this.approved = true;
    this.closeTask = setImmediate(() => {
      this.closeTask = null;
      if (this.win.isDestroyed()) return;
      if (typeof this.win.destroy === 'function') this.win.destroy();
      else this.win.close();
    });
  }

  _onRendererUnavailable() {
    this._forceClose();
  }

  dispose() {
    this._clearPending();
    if (this.closeTask) clearImmediate(this.closeTask);
    this.closeTask = null;
    if (!this.installed) return;
    this.installed = false;
    this.win.removeListener('close', this._onClose);
    this.win.removeListener('unresponsive', this._onRendererUnavailable);
    this.win.webContents.removeListener('render-process-gone', this._onRendererUnavailable);
    this.win.webContents.removeListener('destroyed', this._onRendererUnavailable);
  }
}

module.exports = CloseGuard;
