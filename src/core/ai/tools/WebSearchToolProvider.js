'use strict';

const ToolProvider = require('./ToolProvider');
const esm = require('../esm-bridge');
const { toolResult, sourceSnapshot } = require('../ToolResult');
const { searchWeb, fetchWebpage, PROVIDER_NAMES } = require('../WebSearchClient');
const { diagnostics } = require('../../diagnostics/DiagnosticLog');

/**
 * WebSearchToolProvider — gives the agent live internet access via two tools:
 *   - web_search   : query the web, return title + url + snippet for top results
 *   - read_webpage : fetch a URL and return its text (HTML stripped)
 *
 * Backend is configurable (settings.search):
 *   { provider: 'bing' (default, no key, 国内可达) | 'duckduckgo' | 'tavily'
 *               | 'searxng' | 'none',
 *     apiKey, endpoint, maxResults }
 * bing/duckduckgo need no key; tavily needs apiKey; searxng needs a self-hosted
 * endpoint. Bing tries cn.bing.com, then DuckDuckGo and global Bing when the
 * service returns a homepage, verification page, or unavailable response.
 */
class WebSearchToolProvider extends ToolProvider {
  constructor(config) {
    super('web', 'web');
    this._cfg = config || {};
  }

  _provider() { return (this._cfg.provider || 'bing').toLowerCase(); }
  _apiKey() { return this._cfg.apiKey || process.env.TAVILY_API_KEY || ''; }

  isReady() {
    const p = this._provider();
    if (p === 'none') return false;
    if (p === 'tavily') return !!this._apiKey();
    if (p === 'searxng') return !!this._cfg.endpoint;
    return true; // bing / duckduckgo — no key needed
  }

  async _build() {
    if (!this.isReady()) return [];
    const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
    const z = require('zod');
    const cfg = this._cfg;
    const apiKey = this._apiKey();
    diagnostics.registerSecrets({ apiKey });
    const provider = this._provider();
    const defaultLimit = Number(cfg.maxResults) || 5;

    const webSearch = new DynamicStructuredTool({
      name: 'web_search',
      description:
        '联网搜索互联网，获取**实时/最新**信息或内置知识库未覆盖的外部事实（如近期天象的确切日期、新闻、人物资料、某概念的网络资料）。返回若干条「标题 + 网址 + 摘要」。注意：占星/命理的解读类问题应优先用 search_knowledge 查内置知识库；本工具用于时效性或知识库之外的事实。',
      schema: z.object({
        query: z.string().describe('搜索关键词'),
        limit: z.number().int().min(1).max(10).optional().describe('返回结果条数（默认 5）'),
      }),
      func: async (input) => {
        const n = input.limit || defaultLimit;
        try {
          const search = await searchWeb(provider, { apiKey, endpoint: cfg.endpoint }, input.query, n);
          const { results, ...metadata } = search;
          diagnostics.info('web-search-done', { requestedProvider: provider, provider: metadata.provider, fallback: metadata.fallback, count: results.length });
          if (!results.length) return toolResult('未找到相关网页结果。', 'web', '未找到相关网页结果。', { search: metadata, sources: [] });
          const sources = results.map((r) => sourceSnapshot({ ...r, content: r.snippet, source: 'web' }));
          const notice = metadata.fallback ? `首选搜索接口未返回可用结果页，已改用 ${PROVIDER_NAMES[metadata.provider]}。\n\n` : '';
          return toolResult(notice + sources.map((s) => `[${s.id}] ${s.title}\n${s.url}\n${s.content}`).join('\n\n'), 'web', results, { sources, search: metadata });
        } catch (e) {
          diagnostics.error('web-search-failed', { provider, error: e });
          const message = `联网搜索失败：${e.message}`;
          return toolResult(message, 'web', message, { search: { requestedProvider: provider, provider, fallback: false, attempts: e.attempts || [] }, sources: [] });
        }
      },
    });

    const readWebpage = new DynamicStructuredTool({
      name: 'read_webpage',
      description:
        '抓取指定网址的正文文本（已去除 HTML/脚本）。在 web_search 找到有价值的链接后，用本工具阅读其详细内容。输入完整 URL（含 http(s)://）。',
      schema: z.object({ url: z.string().describe('完整网址，例如 https://example.com/article') }),
      func: async (input) => {
        try {
          const content = await fetchWebpage(input.url);
          diagnostics.info('webpage-read-done', { characters: content.length });
          const source = sourceSnapshot({ url: input.url, content, source: 'web' });
          return toolResult(`[${source.id}] ${input.url}\n${content}`, 'webpage', { url: input.url }, { sources: [source] });
        } catch (e) {
          diagnostics.error('webpage-read-failed', { error: e });
          return `网页抓取失败：${e.message}`;
        }
      },
    });

    return [webSearch, readWebpage];
  }
}

module.exports = WebSearchToolProvider;
