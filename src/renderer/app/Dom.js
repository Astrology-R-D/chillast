// Dom.js — a minimal hyperscript helper so views can build DOM declaratively
// without pulling in a framework. `h(tag, props, children)` returns an element;
// props support `class`, `dataset`, `style`, event handlers (onClick → click),
// and arbitrary attributes. This keeps every component tiny and dependency-free.

export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    el.appendChild(typeof child === 'string' || typeof child === 'number'
      ? document.createTextNode(String(child))
      : child);
  }
}

/** Remove all children of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replace the children of `node` with `content` (node or list). */
export function mount(node, content) {
  clear(node);
  appendChildren(node, content);
  return node;
}

/** Shorthand element factories for the most common tags. */
export const el = new Proxy({}, {
  get: (_t, tag) => (props, children) => h(tag, props, children),
});
