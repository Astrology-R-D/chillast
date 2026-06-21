'use strict';

/**
 * ToolProvider — the unit of extensibility for the AI agent's capabilities.
 *
 * A provider is one source of LangChain tools (built-in compute tools, the
 * knowledge base, an MCP server, …). The registry aggregates providers; the
 * agent never knows where a tool came from. To add a capability you add a
 * provider — the agent loop is untouched.
 *
 * Subclasses override `_build()` (and optionally `init`/`dispose`/`isReady`).
 * Tools are built lazily and cached; `dispose()` clears the cache.
 */
class ToolProvider {
  /**
   * @param {string} id        Stable namespace, e.g. 'astro' | 'kb' | 'mcp:fs'
   * @param {string} category  'compute' | 'knowledge' | 'context' | 'mcp'
   */
  constructor(id, category) {
    this.id = id;
    this.category = category;
    this.enabled = true;
    this._tools = null;
  }

  /** One-time setup (connect, warm caches, …). Default: no-op. */
  async init() {}

  /** Whether this provider can currently supply tools. */
  isReady() { return true; }

  /** Return (and cache) this provider's tools. */
  async listTools() {
    if (!this._tools) this._tools = await this._build();
    return this._tools;
  }

  /** Subclass hook: construct the tool array. */
  async _build() { return []; }

  /** Release resources; next listTools() rebuilds. */
  async dispose() { this._tools = null; }
}

module.exports = ToolProvider;
