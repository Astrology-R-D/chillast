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

    const render = (docs, data) => {
      if (!docs.length) return '未找到相关知识';
      const sources = docs.map(sourceSnapshot);
      return toolResult(sources.map((s, i) => `[${s.id}] 来源: ${s.title}${s.pack ? ` · ${s.pack.name} v${s.pack.version}` : ''}\n${docs[i].blockId ? `块 ID: ${docs[i].blockId} · 类型: ${docs[i].contentType}\n章节: ${(docs[i].chapterPath || []).join(' > ')}\n` : ''}${s.provenance?.warnings?.length ? `资料质量提示：${s.provenance.warnings.join('；')}\n` : ''}${s.content}`).join('\n\n---\n\n'), 'knowledge', data, { sources });
    };
    const searchKnowledge = new DynamicStructuredTool({
      name: 'search_knowledge',
      description: '搜索占星/命理知识库。使用具体术语，可用中文或原书语言；混合关键词和语义检索，优先正文。结果提供块 ID，可用 read_knowledge 继续阅读上下文。',
      schema: z.object({ query: z.string().describe('搜索关键词，如"太阳在白羊座"'), corpus: z.string().nullable().optional().describe('可选知识体系：八字问题用 bazi，西方占星用 astrology；其他知识包使用其领域 ID。未指定时检索全部已启用知识库') }),
      func: async (input) => {
        const docs = await kb.retrieve(input.query, 6, { corpus: input.corpus });
        return render(docs, { query: input.query, corpus: input.corpus });
      },
    });

    const tools = [searchKnowledge];
    if (typeof kb.read === 'function') tools.push(new DynamicStructuredTool({
      name: 'read_knowledge',
      description: '使用 search_knowledge 返回的块 ID 读取该段及前后原文。解释条件不完整、只命中概述、需要核对例外时使用；返回的来源 ID 可用于判据。仅访问本轮启用的知识库快照。',
      schema: z.object({ blockId: z.string().describe('检索返回的 KB 开头的块 ID'), radius: z.number().int().min(0).max(2).nullable().optional().describe('前后各读取几块，默认 1，最多 2') }),
      func: async input => render(await kb.read(input.blockId, input.radius ?? 1), { blockId: input.blockId }),
    }));
    return tools;
  }
}

module.exports = KnowledgeToolProvider;
