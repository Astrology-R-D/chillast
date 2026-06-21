'use strict';

const ToolProvider = require('./ToolProvider');

/**
 * McpToolProvider — exposes tools from connected MCP servers (via McpManager)
 * to the agent, uniformly with the built-in providers. Contributes no tools
 * when no servers are enabled or a connection fails, so MCP is a fully optional,
 * pluggable capability layer.
 */
class McpToolProvider extends ToolProvider {
  constructor(mcpManager) {
    super('mcp', 'mcp');
    this._mcp = mcpManager;
  }

  async init() {
    if (this._mcp && this._mcp.hasEnabledServers()) {
      await this._mcp.connect();
    }
  }

  isReady() {
    return !!(this._mcp && this._mcp.getTools().length);
  }

  async _build() {
    return this._mcp ? this._mcp.getTools() : [];
  }

  async dispose() {
    if (this._mcp) await this._mcp.close();
    this._tools = null;
  }
}

module.exports = McpToolProvider;
