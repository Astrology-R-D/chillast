'use strict';

const esm = require('./../esm-bridge');

/**
 * McpManager — owns the connection to external MCP (Model Context Protocol)
 * servers and exposes their tools as LangChain tools.
 *
 * Config shape (Claude-Desktop style), per server:
 *   { transport: 'stdio', command, args, env, enabled }
 *   { transport: 'sse'|'http', url, headers, enabled }
 *
 * Safety: only servers with `enabled: true` are ever connected — external MCP
 * servers run arbitrary code, so nothing starts unless the user opts in. The
 * `@langchain/mcp-adapters` import is lazy and failure-tolerant: if it (or a
 * server) fails, the app continues with no MCP tools rather than crashing.
 */
class McpManager {
  /**
   * @param {Record<string, object>} serverConfig - map of serverName → config
   */
  constructor(serverConfig) {
    this._config = serverConfig || {};
    this._client = null;
    this._tools = [];
    this._connected = false;
  }

  /** Servers the user has explicitly enabled, with our `enabled` flag stripped. */
  _enabledServers() {
    const out = {};
    for (const [name, cfg] of Object.entries(this._config)) {
      if (cfg && cfg.enabled) {
        const rest = { ...cfg };
        delete rest.enabled;
        out[name] = rest;
      }
    }
    return out;
  }

  hasEnabledServers() {
    return Object.keys(this._enabledServers()).length > 0;
  }

  /** Full server config map (for the settings UI to display/edit). */
  getConfig() { return this._config; }

  /** Names + enabled flags, for the settings UI / introspection. */
  listServers() {
    return Object.entries(this._config).map(([name, cfg]) => ({
      name,
      enabled: !!(cfg && cfg.enabled),
      transport: (cfg && cfg.transport) || (cfg && cfg.url ? 'http' : 'stdio'),
    }));
  }

  /**
   * Connect to all enabled servers and cache their tools. Idempotent-ish:
   * always safe to call; degrades to zero tools on any failure.
   */
  async connect() {
    const servers = this._enabledServers();
    this._connected = true;
    if (!Object.keys(servers).length) {
      this._tools = [];
      return this._tools;
    }
    try {
      const { MultiServerMCPClient } = await esm.load('@langchain/mcp-adapters');
      this._client = new MultiServerMCPClient({ mcpServers: servers });
      this._tools = await this._client.getTools();
    } catch (e) {
      console.error('[McpManager] connection failed, continuing without MCP:', e.message);
      await this._safeClose();
      this._tools = [];
    }
    return this._tools;
  }

  getTools() { return this._tools; }

  isConnected() { return this._connected; }

  async _safeClose() {
    if (this._client) {
      try { await this._client.close(); } catch (_) { /* best-effort */ }
      this._client = null;
    }
  }

  async close() {
    await this._safeClose();
    this._tools = [];
    this._connected = false;
  }
}

module.exports = McpManager;
