// Store.js — an observable application state container (Observer pattern).
// Views subscribe to slices and re-render on change. State is updated only via
// `setState`, giving a single, predictable mutation path.

export class Store {
  constructor(initialState = {}) {
    this._state = { ...initialState };
    this._subscribers = new Set();
  }

  getState() {
    return this._state;
  }

  /** Shallow-merge a patch (or the result of a patch function) into state. */
  setState(patch) {
    const next = typeof patch === 'function' ? patch(this._state) : patch;
    this._state = { ...this._state, ...next };
    this._notify();
  }

  /** Subscribe to all changes; returns an unsubscribe function. */
  subscribe(handler) {
    this._subscribers.add(handler);
    return () => this._subscribers.delete(handler);
  }

  _notify() {
    for (const handler of [...this._subscribers]) handler(this._state);
  }
}
