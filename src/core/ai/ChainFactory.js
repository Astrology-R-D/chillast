'use strict';

const esm = require('./esm-bridge');
const { build: buildInterpretPrompt } = require('./prompts/InterpretPrompt');

class ChainFactory {
  constructor(modelProvider, knowledgeBase) {
    this._mp = modelProvider;
    this._kb = knowledgeBase;
  }

  async _getRagContext(query, k = 6) {
    if (!this._kb || !this._kb.isReady()) return '';
    const docs = await this._kb.retrieve(query, k);
    if (!docs.length) return '';
    return docs.map((d, i) => `[参考${i + 1}] ${d.content}`).join('\n\n');
  }

  /**
   * Build a streaming interpretation (no tool calling).
   * Returns an async iterable of AIMessageChunk.
   */
  async buildInterpretStream(chartText, chartType, signal) {
    const model = this._mp.chatModel();
    const ragContext = await this._getRagContext(chartText);
    const { systemMessage, humanMessage } = buildInterpretPrompt(chartText, ragContext, chartType);

    const { HumanMessage, SystemMessage } = await esm.load('@langchain/core/messages');
    const messages = [
      new SystemMessage(systemMessage),
      new HumanMessage(humanMessage),
    ];

    return model.stream(messages, signal ? { signal } : undefined);
  }
}

module.exports = ChainFactory;
