'use strict';

const ToolProvider = require('./ToolProvider');
const esm = require('../esm-bridge');
const { toolResult, sourceSnapshot } = require('../ToolResult');

/**
 * KnowledgeToolProvider — exposes the RAG knowledge base as a `search_knowledge`
 * tool the agent can call on demand. Replaces the ad-hoc RAG tool that used to
 * be injected inside ChainFactory. Becomes unready (contributes no tools) when
 * the knowledge base has no embeddings available.
 */
class KnowledgeToolProvider extends ToolProvider {
  constructor(knowledgeBase) {
    super('kb', 'knowledge');
    this._kb = knowledgeBase;
  }

  isReady() {
    return !!(this._kb && this._kb.isReady());
  }

  async _build() {
    if (!this.isReady()) return [];
    const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
    const z = require('zod');
    const kb = this._kb;

    const searchKnowledge = new DynamicStructuredTool({
      name: 'search_knowledge',
      description: '搜索占星/命理知识库，查找关于某个主题的专业知识。用中文关键词搜索。',
      schema: z.object({ query: z.string().describe('搜索关键词，如"太阳在白羊座"'), corpus: z.string().nullable().optional().describe('可选知识体系：八字问题用 bazi，西方占星用 astrology；其他知识包使用其领域 ID。未指定时检索全部已启用知识库') }),
      func: async (input) => {
        const docs = await kb.retrieve(input.query, 4, { corpus: input.corpus });
        if (!docs.length) return '未找到相关知识';
        const sources = docs.map(sourceSnapshot);
        return toolResult(sources.map((s) => `[${s.id}] 来源: ${s.title}${s.pack ? ` · ${s.pack.name} v${s.pack.version}` : ''}\n${s.content}`).join('\n\n---\n\n'), 'knowledge', { query: input.query, corpus: input.corpus }, { sources });
      },
    });

    return [searchKnowledge];
  }
}

module.exports = KnowledgeToolProvider;
