'use strict';

const ToolProvider = require('./ToolProvider');
const { buildComputeTools } = require('../AstroToolkit');

/**
 * AstroToolProvider — exposes the astrology / 命理 computation tools
 * (natal, transit, synastry, bazi, solar return, progressed).
 */
class AstroToolProvider extends ToolProvider {
  constructor(astrologyService, chineseAstrologyService) {
    super('astro', 'compute');
    this._astrology = astrologyService;
    this._chinese = chineseAstrologyService;
  }

  async _build() {
    return buildComputeTools(this._astrology, this._chinese);
  }
}

module.exports = AstroToolProvider;
