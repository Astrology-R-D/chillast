'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { searchWeb, fetchWebpage } = require('../src/core/ai/WebSearchClient');
const WebSearchToolProvider = require('../src/core/ai/tools/WebSearchToolProvider');

function response(body, { url = '', status = 200, type = 'text/html' } = {}) {
  return { ok: status >= 200 && status < 300, status, url, headers: new Headers({ 'content-type': type }), text: async () => body };
}
const bing = (title = '国际新闻', url = 'https://news.example/article') => `<ol id="b_results"><li data-id="1" class='extra b_algo'><h2><span><a target="_blank" href="${url}">${title}</a></span></h2><div class="b_caption"><p>新闻 &amp; <strong>事实</strong></p></div></li></ol>`;
const duck = `<a href="//duckduckgo.com/l/?rut=hash&amp;uddg=https%3A%2F%2Fnews.example%2Fstory%3Fa%3D1%26b%3D2" class='result__a extra'>今日 <b>国际新闻</b></a><a class="extra result__snippet" href="#">最新 &amp; 完整报道</a>`;

test('Bing homepage redirects fall back to DuckDuckGo and retain original query and source URLs', async () => {
  const requests = [];
  const fetch = async (url) => {
    requests.push(new URL(url));
    return requests.length === 1 ? response('<title>搜索 - Microsoft 必应</title>', { url: 'https://www.bing.com/?q=test' }) : response(duck, { url });
  };
  const result = await searchWeb('bing', {}, '今日重要新闻 国际 财经 科技', 5, { fetch });
  assert.equal(result.provider, 'duckduckgo'); assert.equal(result.requestedProvider, 'bing'); assert.equal(result.fallback, true);
  assert.equal(result.attempts[0].code, 'UNEXPECTED_PAGE'); assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('q'), '今日重要新闻 国际 财经 科技');
  assert.deepEqual(result.results, [{ title: '今日 国际新闻', url: 'https://news.example/story?a=1&b=2', snippet: '最新 & 完整报道' }]);
});

test('Bing accepts reordered attributes and multiple classes and resolves tracking URLs', async () => {
  const target = 'https://news.example/story?a=1&b=2';
  const tracking = `https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}&amp;ntb=1`;
  const result = await searchWeb('bing', {}, '新闻', 5, { fetch: async () => response(bing('标题 &quot;今日&quot;', tracking)) });
  assert.equal(result.fallback, false);
  assert.deepEqual(result.results, [{ title: '标题 "今日"', url: target, snippet: '新闻 & 事实' }]);
});

test('fallback can use global Bing when DuckDuckGo is unreachable', async () => {
  const hosts = [];
  const result = await searchWeb('bing', {}, '新闻', 5, { fetch: async (url) => {
    const host = new URL(url).hostname; hosts.push(host);
    if (host === 'cn.bing.com') return response('<html>home</html>', { url: 'https://www.bing.com/' });
    if (host === 'html.duckduckgo.com') throw new Error('connection refused');
    return response(bing(), { url });
  } });
  assert.deepEqual(hosts, ['cn.bing.com', 'html.duckduckgo.com', 'www.bing.com']);
  assert.equal(result.provider, 'bing'); assert.equal(result.fallback, true); assert.equal(result.results.length, 1);
});

test('confirmed empty results do not retry while unknown or verification pages remain errors', async () => {
  let count = 0;
  const empty = await searchWeb('bing', {}, '不存在的词', 5, { fetch: async (url) => { count++; return response('<li class="b_no">No results found</li>', { url }); } });
  assert.deepEqual(empty.results, []); assert.equal(count, 1); assert.equal(empty.fallback, false);
  await assert.rejects(searchWeb('duckduckgo', {}, '新闻', 5, { fetch: async () => response('<html>layout changed</html>') }), (error) => error.attempts[0].code === 'UNRECOGNIZED_RESPONSE');
  await assert.rejects(searchWeb('duckduckgo', {}, '新闻', 5, { fetch: async () => response('<form id="challenge-form">verification</form>', { status: 202 }) }), (error) => error.attempts[0].code === 'VERIFICATION_REQUIRED');
  const captchaQuery = await searchWeb('bing', {}, 'captcha', 5, { fetch: async () => response(bing('What is CAPTCHA?')) });
  assert.equal(captchaQuery.results.length, 1);
});

test('JSON backends require a real results array and preserve genuine empty results', async () => {
  const requests = [];
  const tavily = await searchWeb('tavily', { apiKey: 'test-key' }, 'hello', 2, { fetch: async (url, options) => {
    requests.push({ url, options });
    return response(JSON.stringify({ results: [{ title: 'Title', url: 'https://example.com/', content: 'Some <b>text</b>' }] }), { type: 'application/json' });
  } });
  assert.equal(JSON.parse(requests[0].options.body).api_key, 'test-key');
  assert.equal(tavily.results[0].snippet, 'Some text');
  await assert.rejects(searchWeb('tavily', {}, 'hello', 5, { fetch: async () => response('{"error":"quota exceeded"}') }), /缺少 results/);
  await assert.rejects(searchWeb('tavily', {}, 'hello', 5, { fetch: async () => response('null') }), /缺少 results/);
  const empty = await searchWeb('searxng', { endpoint: 'https://search.example' }, '中文 & query', 5, { fetch: async (url) => {
    assert.equal(new URL(url).searchParams.get('q'), '中文 & query');
    assert.equal(new URL(url).searchParams.get('format'), 'json');
    return response('{"results":[]}');
  } });
  assert.deepEqual(empty.results, []);
});

test('normalization removes unsafe/duplicate URLs and bounds result counts', async () => {
  const values = [{ title: 'bad', url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com' }, { url: '' }, ...Array.from({ length: 12 }, (_, i) => ({ title: `Result ${i}`, url: `https://example.com/${i}` })), { url: 'https://example.com/0' }];
  const result = await searchWeb('tavily', {}, 'hello', 100, { fetch: async () => response(JSON.stringify({ results: values })) });
  assert.equal(result.results.length, 10); assert.equal(result.results[0].url, 'https://example.com/0');
  const missing = await searchWeb('bing', {}, 'hello', 5, { fetch: async (url) => response(bing('missing href', '') + bing('real result'), { url }) });
  assert.equal(missing.results.length, 1); assert.equal(missing.results[0].title, 'real result');
});

test('timeouts include receiving response bodies and webpage reading still strips scripts', async () => {
  const fetch = async (_url, options) => ({ ok: true, status: 200, headers: new Headers(), text: () => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); }) });
  await assert.rejects(searchWeb('duckduckgo', {}, 'hello', 5, { fetch, timeoutMs: 20 }), (error) => error.attempts[0].code === 'TIMEOUT');
  assert.equal(await fetchWebpage('https://example.com', { fetch: async () => response('<script>hidden()</script><style>.hidden{}</style><!-- comment --><p>Hello &amp; world</p>') }), 'Hello & world');
});

test('web_search tool retains sources on fallback and exposes failures as failures, never empty success', async (t) => {
  let failing = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (failing) return response('<html>Not a search page</html>', { url });
    return new URL(url).hostname === 'cn.bing.com' ? response('<html>home</html>', { url: 'https://www.bing.com/' }) : response(duck, { url });
  });
  const tools = await new WebSearchToolProvider({ provider: 'bing' }).listTools();
  const tool = tools.find((tool) => tool.name === 'web_search');
  const [content, artifact] = await tool.func({ query: '新闻' });
  assert.match(content, /已改用 DuckDuckGo/); assert.equal(artifact.providerId, 'web');
  assert.equal(artifact.sources[0].url, 'https://news.example/story?a=1&b=2');
  assert.equal(artifact.sources[0].content, '最新 & 完整报道'); assert.equal(artifact.search.provider, 'duckduckgo');
  failing = true;
  const [failure, failedArtifact] = await tool.func({ query: '新闻' });
  assert.match(failure, /^联网搜索失败/); assert.doesNotMatch(failure, /^未找到相关网页结果/);
  assert.deepEqual(failedArtifact.sources, []); assert.equal(failedArtifact.search.attempts.length, 3);
});
