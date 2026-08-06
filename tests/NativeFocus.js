'use strict';

async function waitForNativeFocus(webContents, description, resolverSource, timeout = 10000, clock = Date.now) {
  const deadline = clock() + timeout;
  let last = null;
  const script = `(async () => {
    const resolveNode = (${resolverSource});
    const describe = (node) => node ? {
      tag: node.tagName,
      id: node.id || null,
      identity: node.getAttribute?.('data-chart-identity') || null,
      rowId: node.closest?.('[data-row-id]')?.getAttribute('data-row-id') || null,
      connected: node.isConnected,
    } : null;
    const candidate = resolveNode();
    if (candidate?.isConnected) candidate.focus();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const current = resolveNode();
    const active = document.activeElement;
    const diagnostic = { candidate: describe(candidate), current: describe(current), active: describe(active) };
    return {
      ready: Boolean(current?.isConnected && document.activeElement === current),
      value: diagnostic.current,
      diagnostic,
    };
  })()`;

  while (clock() < deadline) {
    last = await webContents.executeJavaScript(script);
    if (last?.ready) return last.value;
  }
  throw new Error(`${description} timed out; last result: ${JSON.stringify(last?.diagnostic ?? last)}`);
}

module.exports = { waitForNativeFocus };
