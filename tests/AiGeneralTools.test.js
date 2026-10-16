'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const WebSearchToolProvider = require('../src/core/ai/tools/WebSearchToolProvider');

test('without a chart, real LangGraph can read a supplied webpage and search news, stream answers and preserve tool artifacts', async () => {
  const requests = []; const fetched = [];
  let base;
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      fetched.push(request.url);
      if (request.url.startsWith('/search')) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ results: [{ title: '今日新闻', url: `${base}/article`, content: '可核对的新闻摘要。' }] })); }
      else { response.setHeader('content-type', 'text/html'); response.end('<html><body><h1>独立网页</h1><p>这是实际读取到的正文，与是否生成星盘无关。</p></body></html>'); }
      return;
    }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    const question = body.messages.findLast((message) => message.role === 'user')?.content || '';
    const done = body.messages.some((message) => message.role === 'tool');
    const hasTools = body.tools?.some((tool) => tool.function.name === 'read_webpage');
    const tool = question.includes('http') ? 'read_webpage' : 'web_search';
    const message = hasTools && !done ? { role: 'assistant', content: null, tool_calls: [{ id: 'web-call', type: 'function', function: { name: tool, arguments: JSON.stringify(tool === 'read_webpage' ? { url: `${base}/article` } : { query: '今日新闻' }) } }] }
      : { role: 'assistant', content: done ? `已读取真实网页：[独立网页](${base}/article)` : '你好，网页工具目前未启用。' };
    if (body.stream) {
      const delta = { ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((call, index) => ({ ...call, index })) } : {}) };
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(`data: ${JSON.stringify({ id: `test-${requests.length}`, choices: [{ index: 0, delta, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } else {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: `test-${requests.length}`, choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const service = new AiService({}, {});
    await service._mp.configure({ provider: 'deepseek', model: 'test', apiKey: 'local-test', baseUrl: `${base}/v1`, embeddings: { provider: 'none' } });
    service._configured = true;
    service._registry = new ToolRegistry().register(new WebSearchToolProvider({ provider: 'searxng', endpoint: base }));
    const collect = async (question) => {
      const events = [];
      for await (const event of service.chat([{ role: 'user', content: question }], { sessionId: 'no-chart' })) events.push(event);
      return events;
    };
    for (const [question, tool] of [[`帮我看看这个链接 ${base}/article`, 'read_webpage'], ['今天有哪些时事新闻？', 'web_search']]) {
      requests.length = 0;
      const events = await collect(question);
      const call = events.find((event) => event.type === 'tool-call' && event.data.status === 'done').data;
      assert.equal(call.tool, tool); assert.equal(call.callId, 'web-call');
      assert.ok(call.artifact.sources.length); assert.ok(call.result.length);
      assert.match(events.filter((event) => event.type === 'token').map((event) => event.data).join(''), /已读取真实网页/);
      assert.ok(!events.some((event) => event.type === 'analysis-report'));
      assert.ok(requests[0].tools.some((entry) => entry.function.name === tool));
      assert.ok(requests[0].messages[0].content.includes('工具能力不依赖用户生成星盘'));
      assert.equal(events.at(-1).type, 'done');
    }
    assert.ok(fetched.includes('/article')); assert.ok(fetched.some((url) => url.startsWith('/search')));
    service._registry.setEnabled('web', false);
    const disabled = await collect(`帮我看看这个链接 ${base}/article`);
    assert.ok(!disabled.some((event) => event.type === 'tool-call'));
    requests.length = 0;
    await collect('谢谢！');
    assert.ok(!requests[0].tools, 'pure acknowledgements remain a lightweight writer response');
    assert.equal(service._abortControllers.size, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
