'use strict';

class CloseGuard {
  constructor({ win, timeoutMs = 15000, diagnostic = () => {}, onStage = () => {}, schedule = (callback) => setTimeout(callback, 0), cancelSchedule = clearTimeout }) {
    this.win = win;
    this.webContents = win.webContents;
    this.timeoutMs = timeoutMs;
    this.diagnostic = diagnostic;
    this.onStage = onStage;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.pending = false;
    this.approved = false;
    this.timer = null;
    this.closeTask = null;
    this.installed = false;
    this._onClose = this._onClose.bind(this);
    this._onUnresponsive = this._onUnresponsive.bind(this);
    this._onRendererGone = this._onRendererGone.bind(this);
  }

  install() {
    if (this.installed) return;
    this.installed = true;
    this.win.on('close', this._onClose);
    this.win.on('unresponsive', this._onUnresponsive);
    this.webContents.on('render-process-gone', this._onRendererGone);
    this.webContents.on('destroyed', this._onRendererGone);
  }

  _onClose(event) {
    if (this.approved || this.webContents.isDestroyed()) return;
    event.preventDefault();
    if (this.pending) return;
    this.pending = true;
    this.onStage('request');
    try {
      this.webContents.send('app:closeRequested');
      this.onStage('request-sent');
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
    this.onStage(`decision-${decision}`);
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
    this.onStage('close-scheduled');
    this.closeTask = this.schedule(() => {
      this.closeTask = null;
      if (this.win.isDestroyed()) return;
      if (this.webContents.isDestroyed()) {
        this.onStage('destroy');
        this.win.destroy();
      } else {
        this.onStage('close');
        this.webContents.close({ waitForBeforeUnload: false });
      }
    });
  }

  _onUnresponsive() {
    this.diagnostic('The application is not responding. Your edits remain protected; wait for it to recover.');
  }

  _onRendererGone() {
    this._forceClose();
  }

  dispose() {
    this._clearPending();
    if (this.closeTask) this.cancelSchedule(this.closeTask);
    this.closeTask = null;
    if (!this.installed) return;
    this.installed = false;
    this.win.removeListener('close', this._onClose);
    this.win.removeListener('unresponsive', this._onUnresponsive);
    this.webContents.removeListener('render-process-gone', this._onRendererGone);
    this.webContents.removeListener('destroyed', this._onRendererGone);
  }
}

module.exports = CloseGuard;
