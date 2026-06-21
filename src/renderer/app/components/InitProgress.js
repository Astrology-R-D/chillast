// InitProgress.js — a small, non-blocking overlay that reports knowledge-base
// startup progress (embedding-model download + vector-index build). It listens
// for `ai:initProgress` events and also queries the current state on mount (in
// case events fired before it was ready). Dismissible; auto-hides when ready.

import { h } from '../Dom.js';
import { t } from '../I18n.js';

export class InitProgress {
  constructor() {
    this._dismissed = false;
    this._build();
  }

  get element() { return this._root; }

  _build() {
    this._icon = h('span', { class: 'init-progress-icon svg-glyph' }, '✶');
    this._title = h('div', { class: 'init-progress-title' }, '');
    this._detail = h('div', { class: 'init-progress-detail' }, '');
    this._barFill = h('div', { class: 'init-progress-bar-fill' });
    this._bar = h('div', { class: 'init-progress-bar' }, [this._barFill]);
    this._close = h('button', {
      class: 'init-progress-close',
      title: t('init.dismiss'),
      onclick: () => this.hide(),
    }, '✕');
    this._root = h('div', { class: 'init-progress', style: { display: 'none' } }, [
      this._icon,
      h('div', { class: 'init-progress-body' }, [this._title, this._detail, this._bar]),
      this._close,
    ]);
  }

  /** Begin listening + pull the current phase (covers the early-event race). */
  async start() {
    if (!window.mystApi || !window.mystApi.ai) return;
    window.mystApi.ai.onInitProgress((p) => this.update(p));
    try {
      const r = await window.mystApi.ai.initStatus();
      if (r && r.ok && r.data) this.update(r.data);
    } catch (_) { /* ignore */ }
  }

  show() { this._root.style.display = ''; }
  hide() { this._dismissed = true; this._root.style.display = 'none'; }

  update(p) {
    if (!p || !p.phase) return;

    if (p.phase === 'ready') {
      // Index loaded from cache → never bother the user. Fresh build → brief ✓.
      if (p.fromCache || this._dismissed) { this._root.style.display = 'none'; return; }
      this._reset();
      this._icon.textContent = '✓';
      this._root.classList.add('is-ready');
      this._title.textContent = t('init.ready');
      this._detail.textContent = p.chunks ? t('init.readyDetail', { n: p.chunks }) : '';
      this._barFill.style.width = '100%';
      this.show();
      setTimeout(() => { this._root.style.display = 'none'; }, 2500);
      return;
    }

    if (p.phase === 'error') {
      // Errors matter — surface even if previously dismissed.
      this._dismissed = false;
      this._reset();
      this._icon.textContent = '⚠';
      this._root.classList.add('is-error');
      this._title.textContent = t('init.error');
      this._detail.textContent = p.message || '';
      this._barFill.style.width = '100%';
      this.show();
      return;
    }

    if (this._dismissed) return;
    this._reset();
    this.show();

    if (p.phase === 'preparing') {
      this._title.textContent = t('init.preparing');
      this._setIndeterminate(true);
    } else if (p.phase === 'model') {
      this._title.textContent = t('init.model');
      if (typeof p.percent === 'number') {
        this._detail.textContent = `${t('init.modelHint')} · ${p.percent}%`;
        this._setIndeterminate(false);
        this._barFill.style.width = `${p.percent}%`;
      } else {
        this._detail.textContent = t('init.modelHint');
        this._setIndeterminate(true);
      }
    } else if (p.phase === 'indexing') {
      this._title.textContent = t('init.indexing');
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      this._detail.textContent = `${p.done} / ${p.total} · ${pct}%`;
      this._setIndeterminate(false);
      this._barFill.style.width = `${pct}%`;
    }
  }

  _reset() {
    this._root.classList.remove('is-ready', 'is-error');
    this._icon.textContent = '✶';
    this._bar.classList.remove('is-indeterminate');
  }

  _setIndeterminate(on) {
    this._bar.classList.toggle('is-indeterminate', on);
    if (on) this._barFill.style.width = '35%';
  }
}
