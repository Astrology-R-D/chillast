'use strict';

const ToolProvider = require('./ToolProvider');
const { buildContextTools } = require('../AstroToolkit');

/**
 * ContextToolProvider — exposes tools that read live UI state from AiService
 * (current route, active profile, last computed chart).
 */
class ContextToolProvider extends ToolProvider {
  constructor(aiService) {
    super('context', 'context');
    this._aiService = aiService;
  }

  async _build() {
    return buildContextTools(this._aiService);
  }
}

module.exports = ContextToolProvider;
