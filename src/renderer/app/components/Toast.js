// Toast.js — transient notifications driven by the shared EventBus. Any module
// can `bus.emit('toast', { message, type })` without knowing how toasts render.

import { h } from '../Dom.js';
import { bus } from '../EventBus.js';

export function mountToastHost() {
  const host = h('div', { class: 'toast-host' });
  document.body.appendChild(host);

  bus.on('toast', ({ message, type = 'info', timeout = 3200 }) => {
    const node = h('div', { class: `toast ${type}` }, message);
    host.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(() => node.remove(), 220);
    }, timeout);
  });
}

export const notify = {
  success: (message) => bus.emit('toast', { message, type: 'success' }),
  error: (message) => bus.emit('toast', { message, type: 'error', timeout: 4500 }),
  info: (message) => bus.emit('toast', { message, type: 'info' }),
};
