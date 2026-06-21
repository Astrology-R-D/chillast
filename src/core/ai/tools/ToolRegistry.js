'use strict';

/**
 * ToolRegistry — aggregates ToolProviders into the single tool list handed to
 * the agent, and owns their lifecycle (init / dispose) plus enable/disable.
 *
 * Execution is NOT the registry's job: LangGraph's ReAct agent runs the tools
 * itself once they're bound. The registry's value is sourcing, lifecycle, and
 * introspection (for the settings UI) — the seam that makes new capabilities
 * (more tools, MCP servers) pluggable without touching the agent.
 */
class ToolRegistry {
  constructor() {
    this._providers = new Map();
  }

  register(provider) {
    if (provider && provider.id) this._providers.set(provider.id, provider);
    return this;
  }

  unregister(id) {
    const p = this._providers.get(id);
    this._providers.delete(id);
    return p || null;
  }

  get(id) { return this._providers.get(id) || null; }

  setEnabled(id, on) {
    const p = this._providers.get(id);
    if (p) p.enabled = !!on;
  }

  async initAll() {
    for (const p of this._providers.values()) {
      try { await p.init(); }
      catch (e) { console.error(`[ToolRegistry] init failed for ${p.id}:`, e.message); }
    }
  }

  async disposeAll() {
    for (const p of this._providers.values()) {
      try { await p.dispose(); } catch (_) { /* best-effort */ }
    }
    this._providers.clear();
  }

  /** Aggregate tools across enabled, ready providers. */
  async getTools({ enabledOnly = true } = {}) {
    const all = [];
    for (const p of this._providers.values()) {
      if (enabledOnly && !p.enabled) continue;
      if (!p.isReady()) continue;
      try {
        const tools = await p.listTools();
        for (const t of tools) all.push(t);
      } catch (e) {
        console.error(`[ToolRegistry] listTools failed for ${p.id}:`, e.message);
      }
    }
    return all;
  }

  /** Snapshot for the settings UI: providers + their tools' names/descriptions. */
  async describe() {
    const out = [];
    for (const p of this._providers.values()) {
      let tools = [];
      try {
        tools = (await p.listTools()).map((t) => ({ name: t.name, description: t.description }));
      } catch (_) { tools = []; }
      out.push({ id: p.id, category: p.category, enabled: p.enabled, ready: p.isReady(), tools });
    }
    return out;
  }
}

module.exports = ToolRegistry;
