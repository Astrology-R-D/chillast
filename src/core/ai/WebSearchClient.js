'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PROVIDER_NAMES = { bing: 'Bing', duckduckgo: 'DuckDuckGo', tavily: 'Tavily', searxng: 'SearXNG' };

class SearchError extends Error {
  constructor(message, code = 'SEARCH_FAILED') { super(message); this.code = code; }
}

async function request(url, options = {}, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...options, signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...options.headers },
    });
    if (!response.ok) throw new SearchError(`HTTP ${response.status}`, 'HTTP_ERROR');
    // Keep the timeout active while receiving the body, not just the headers.
    return { url: response.url || url, body: await response.text(), contentType: response.headers.get('content-type') || '' };
  } catch (error) {
    if (controller.signal.aborted) throw new SearchError('请求超时', 'TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}

function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, ' ')
    .replace(/&middot;/gi, '·').replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
}
function codePoint(n) { try { return String.fromCodePoint(n); } catch { return ''; } }
function stripTags(text) { return decodeEntities(String(text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : '';
}
function hasClass(tag, name) { return attribute(tag, 'class').split(/\s+/).includes(name); }
function hasClassInPage(html, name) { return [...html.matchAll(/<[a-z][^>]*>/gi)].some((m) => hasClass(m[0], name)); }

function resultUrl(raw, base) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    let url = new URL(decodeEntities(raw), base);
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname) && url.searchParams.has('uddg')) {
      url = new URL(url.searchParams.get('uddg'));
    } else if (/(^|\.)bing\.com$/i.test(url.hostname) && url.pathname === '/ck/a') {
      const encoded = url.searchParams.get('u');
      if (encoded?.startsWith('a1')) url = new URL(Buffer.from(encoded.slice(2), 'base64url').toString('utf8'));
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
function normalizeResults(results, limit) {
  const seen = new Set(); const normalized = [];
  for (const result of results) {
    if (!result || typeof result.url !== 'string' || !result.url) continue;
    const url = resultUrl(result.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push({ title: stripTags(result.title || new URL(url).hostname), url, snippet: stripTags(result.snippet || '').slice(0, 1500) });
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function parseBing(html) {
  const starts = [...html.matchAll(/<li\b[^>]*>/gi)].filter((m) => hasClass(m[0], 'b_algo'));
  return starts.flatMap((start, index) => {
    const listEnd = html.indexOf('</ol>', start.index);
    const segment = html.slice(start.index, Math.min(starts[index + 1]?.index ?? html.length, listEnd < 0 ? html.length : listEnd));
    const heading = segment.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
    const anchor = heading?.match(/(<a\b[^>]*>)([\s\S]*?)<\/a>/i);
    if (!anchor) return [];
    const url = resultUrl(attribute(anchor[1], 'href'), 'https://www.bing.com');
    if (!url) return [];
    const snippet = segment.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
    return [{ title: anchor[2], url, snippet }];
  });
}

function parseDuckDuckGo(html) {
  const links = [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)].filter((m) => hasClass(m[1], 'result__a'));
  return links.flatMap((link, index) => {
    const url = resultUrl(attribute(link[1], 'href'), 'https://duckduckgo.com');
    if (!url) return [];
    const segment = html.slice(link.index + link[0].length, links[index + 1]?.index ?? html.length);
    const snippet = [...segment.matchAll(/(<(?:a|div|span)\b[^>]*>)([\s\S]*?)<\/(?:a|div|span)>/gi)].find((m) => hasClass(m[1], 'result__snippet'));
    return [{ title: link[2], url, snippet: snippet ? snippet[2] : '' }];
  });
}

function parseSearchPage(response, provider, limit) {
  const { body, url } = response;
  if (/anomaly\.js|(?:id|class)\s*=\s*["'][^"']*(?:b_captcha|g-recaptcha|h-captcha|challenge-form|anomaly-form)[^"']*["']|verify (?:that )?you are human|请输入验证码|请完成人机验证/i.test(body)) {
    throw new SearchError('搜索服务要求验证，请稍后重试或更换搜索服务', 'VERIFICATION_REQUIRED');
  }
  if (provider === 'bing' && new URL(url).pathname.replace(/\/$/, '') !== '/search') {
    throw new SearchError('搜索请求被重定向到首页，未返回搜索结果页', 'UNEXPECTED_PAGE');
  }
  const results = normalizeResults(provider === 'bing' ? parseBing(body) : parseDuckDuckGo(body), limit);
  if (results.length) return results;
  if (hasClassInPage(body, provider === 'bing' ? 'b_no' : 'no-results')) return [];
  throw new SearchError('搜索服务未返回可识别的结果页，不能视为没有相关网页', 'UNRECOGNIZED_RESPONSE');
}

async function searchProvider(provider, cfg, query, limit, dependencies, globalBing = false) {
  if (provider === 'bing' || provider === 'duckduckgo') {
    const url = new URL(provider === 'duckduckgo' ? 'https://html.duckduckgo.com/html/' : `https://${globalBing ? 'www' : 'cn'}.bing.com/search`);
    url.searchParams.set('q', query);
    if (provider === 'bing') { url.searchParams.set('setlang', 'zh-CN'); url.searchParams.set('mkt', 'zh-CN'); }
    return parseSearchPage(await request(url.href, {}, dependencies), provider, limit);
  }
  let response;
  if (provider === 'tavily') {
    response = await request('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: cfg.apiKey, query, max_results: limit, search_depth: 'basic' }) }, dependencies);
  } else if (provider === 'searxng') {
    const url = new URL(`${String(cfg.endpoint || '').replace(/\/$/, '')}/search`);
    url.searchParams.set('q', query); url.searchParams.set('format', 'json');
    response = await request(url.href, {}, dependencies);
  } else { throw new SearchError('不支持的搜索服务', 'INVALID_PROVIDER'); }
  let data;
  try { data = JSON.parse(response.body); } catch { throw new SearchError('搜索接口返回了无效 JSON', 'UNRECOGNIZED_RESPONSE'); }
  if (!Array.isArray(data?.results)) throw new SearchError('搜索接口缺少 results 数组', 'UNRECOGNIZED_RESPONSE');
  const results = normalizeResults(data.results.map((r) => ({ ...r, snippet: r?.content || '' })), limit);
  if (data.results.length && !results.length) throw new SearchError('搜索接口未返回有效网页链接', 'UNRECOGNIZED_RESPONSE');
  return results;
}

async function searchWeb(provider, cfg, query, limit, dependencies = {}) {
  provider = String(provider).toLowerCase();
  query = String(query).trim();
  if (!query) throw new SearchError('搜索关键词不能为空', 'INVALID_QUERY');
  limit = Math.max(1, Math.min(10, Math.floor(Number(limit) || 5)));
  // Retain the configured mainland-friendly endpoint; fall back only on an
  // infrastructure/page failure, never on a genuine empty search response.
  const candidates = provider === 'bing' ? [{ provider: 'bing' }, { provider: 'duckduckgo' }, { provider: 'bing', globalBing: true }] : [{ provider }];
  const attempts = [];
  for (const candidate of candidates) {
    try {
      const results = await searchProvider(candidate.provider, cfg, query, limit, dependencies, candidate.globalBing);
      return { results, provider: candidate.provider, requestedProvider: provider, fallback: attempts.length > 0, attempts };
    } catch (error) {
      attempts.push({ provider: candidate.provider, endpoint: candidate.globalBing ? 'www.bing.com' : candidate.provider === 'bing' ? 'cn.bing.com' : candidate.provider, code: error.code || 'NETWORK_ERROR', message: error.message });
      // A verification page is an explicit service refusal, not an empty result.
      // Move to another provider, without trying to solve or reuse its challenge.
    }
  }
  const error = new SearchError(attempts.map((a) => `${PROVIDER_NAMES[a.provider] || a.provider}: ${a.message}`).join('；'), 'SEARCH_FAILED');
  error.attempts = attempts;
  throw error;
}

async function fetchWebpage(url, dependencies = {}) {
  const response = await request(url, {}, { timeoutMs: 15000, ...dependencies });
  if (/application\/json/i.test(response.contentType)) return response.body.slice(0, 8000);
  const body = response.body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  return stripTags(body).slice(0, 8000) || '(页面无可提取文本)';
}

module.exports = { searchWeb, fetchWebpage, PROVIDER_NAMES };
