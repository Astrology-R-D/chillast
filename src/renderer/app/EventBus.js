// EventBus.js — a tiny publish/subscribe hub (Observer pattern) used for
// cross-cutting UI signals such as toasts. Decouples emitters from listeners.

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(payload);
  }
}

// A shared app-wide bus instance.
export const bus = new EventBus();
