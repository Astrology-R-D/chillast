'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const KnowledgeToolProvider = require('../src/core/ai/tools/KnowledgeToolProvider');
const { sourceSnapshot } = require('../src/core/ai/ToolResult');
const { needsAnalysis, parseReport, writerPrompt } = require('../src/core/ai/AnalysisProtocol');

const question = '这个人处理事情是什么样的';
const chart = {
  resultId: 'chart-vac', meta: { type: 'natal' },
  subjects: [{ nameZh: 'vac', birthLabel: '2004-07-07 11:15', gender: 'male', location: { label: '六盘水', latitude: 26.6, longitude: 104.8 } }],
  rings: [{ id: 'natal', label: '本命', points: [{ key: 'moon', glyph: '☽', nameZh: '月亮', signNameZh: '双鱼座', degreeInSign: 18.9872, house: 6 }] }],
  houses: [], aspects: [],
};
const workspace = { kind: 'western-chart', activeProfile: { id: 'vac', displayName: 'vac', birthData: { year: 2004, month: 7, day: 7, hour: 11, minute: 15, location: { latitude: 26.6, longitude: 104.8 } } }, resultId: chart.resultId, chartType: 'natal', lastChartData: chart };

test('natural questions and new follow-ups use the analyst when a subject or chart is available', () => {
  const messages = [{ role: 'user', content: question }];
  assert.equal(needsAnalysis(messages, null, 'ctx', { hasWorkspaceContext: true }), true);
  const prior = { contextKey: 'ctx', claims: [{ statement: '已核对的旧判断' }], questions: [] };
  assert.equal(needsAnalysis([{ role: 'user', content: '那他为什么一直不回我消息？' }], prior, 'ctx'), true);
  assert.equal(needsAnalysis(messages, { contextKey: 'ctx', claims: [], questions: [] }, 'ctx', { hasWorkspaceContext: true }), true);
  assert.equal(needsAnalysis([{ role: 'user', content: '分析 vac 的档案' }], null, 'ctx'), true);
  for (const greeting of ['你好', '谢谢！', '好的', '明白了', 'ok']) {
    assert.equal(needsAnalysis([{ role: 'user', content: greeting }], prior, 'another-chart', { hasWorkspaceContext: true }), false, greeting);
  }
  assert.equal(needsAnalysis([{ role: 'user', content: '谢谢，那这个人最近在想什么？' }], prior, 'ctx'), true);
});

test('an empty report is rejected; concrete clarification questions are retained', () => {
  for (const questions of [[], [' ', '\n'], [null, 12]]) {
    assert.throws(() => parseReport(JSON.stringify({ focus: question, claims: [], questions }), [], 'ctx'), /为空|缺少/);
  }
  const report = parseReport(JSON.stringify({ focus: question, claims: [], questions: ['  最近发生了什么具体事情？  ', ''] }), [], 'ctx');
  assert.deepEqual(report.questions, ['最近发生了什么具体事情？']);
  assert.ok(!writerPrompt(null).includes('"claims":[]'), 'ordinary conversation must not present a synthetic empty analysis report');
});

test('computed workspace charts reach real LangGraph tools and verified writer evidence for a natural question', async (t) => {
  const doc = { fileName: '月亮解释.md', source: 'builtin', content: '这是一段用于核对解释来源的知识原文。' };
  const source = sourceSnapshot(doc);
  const requests = [];
  let emptyFirst = false;
  const server = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    const prompt = body.messages[0].content;
    const repairing = body.messages.some(m => m.role === 'user' && m.content.includes('程序校验失败：'));
    let message;
    if (prompt.includes('分析 Subagent')) {
      if (emptyFirst && !repairing) {
        emptyFirst = false;
        message = { role: 'assistant', content: JSON.stringify({ focus: question, claims: [], questions: [] }) };
      } else if (repairing) {
        message = { role: 'assistant', content: JSON.stringify({ focus: question, claims: [], questions: ['最近发生了什么具体事情？'] }) };
      } else if (!body.messages.some((m) => m.role === 'tool')) {
        message = { role: 'assistant', content: null, tool_calls: [{ id: 'kb-call', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"月亮 情绪"}' } }] };
      } else {
        const factRef = prompt.includes('workspace/natal:moon') ? 'workspace/natal:moon' : prompt.includes('workspace/bazi:0') ? 'workspace/bazi:0' : null;
        message = { role: 'assistant', content: JSON.stringify({ focus: question, claims: [{ statement: '结合实际互动核实情绪体验，不能据此确定对方的具体想法', support: '计算事实与该段解释的条件相符。', checks: [{ condition: '解释要求核对当前计算的星体落座', status: 'verified', factRefs: factRef ? [factRef] : [], sourceIds: [source.id] }], factRefs: factRef ? [factRef] : [], sourceIds: [source.id], limitations: '本命盘不能确定最近的想法', question: '最近发生了什么具体事情？' }], questions: [] }) };
      }
    } else message = { role: 'assistant', content: prompt.includes('逐行输出 JSON') ? JSON.stringify({ text: '这是对问题的具体回答。', evidenceIds: ['E1'] }) : '最近你们发生了什么具体事情？' };
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(`data: ${JSON.stringify({ id: `local-${requests.length}`, choices: [{ index: 0, delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: `local-${requests.length}`, choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new AiService({}, {});
    await service._mp.configure({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, maxTokens: 0, contextWindow: 32000 });
    service._configured = true;
    service._registry = new ToolRegistry().register(new KnowledgeToolProvider({ isReady: () => true, retrieve: async () => [doc] }));
    const collect = async (context = {}, content = question) => {
      const events = [];
      for await (const event of service.chat([{ role: 'user', content }], { sessionId: 'local', ...context })) events.push(event);
      return events;
    };
    let report;
    await t.test('the screenshot question uses the already computed chart and retrieved source', async () => {
      service.setContext(workspace);
      const events = await collect();
      assert.ok(events.some((e) => e.type === 'stage' && e.data === 'analysis'));
      assert.ok(events.some((e) => e.type === 'tool-call' && e.data.status === 'done' && e.data.tool === 'search_knowledge'));
      report = events.find((e) => e.type === 'analysis-report').data;
      assert.equal(report.claims[0].facts[0].callId, 'workspace');
      assert.match(report.claims[0].facts[0].text, /双鱼座.*第6宫/);
      assert.equal(report.sources[0].content, doc.content);
      assert.match(requests[0].messages[0].content, /vac/);
      assert.match(requests[0].messages[0].content, /2004-07-07 11:15/);
      assert.match(requests[0].messages[0].content, /workspace\/natal:moon/);
      assert.ok(!requests.at(-1).tools, 'the writer retains the existing tools-free boundary');
      assert.match(requests.at(-1).messages[0].content, /本命盘不能确定最近的想法/);
    });
    await t.test('new natural follow-ups reanalyse rather than blindly reuse the same chart report', async () => {
      const events = await collect({ priorReport: report }, '那他为什么一直不回我消息？');
      assert.ok(events.some((e) => e.type === 'stage' && e.data === 'analysis'));
      assert.ok(events.some((e) => e.type === 'tool-call'));
    });
    await t.test('an old empty report cannot suppress the analyst', async () => {
      const events = await collect({ priorReport: { contextKey: service._contextKey(), focus: question, claims: [], questions: [], sources: [] } });
      assert.equal(events.find((e) => e.type === 'analysis-report').data.claims.length, 1);
    });
    await t.test('explicit interpretation charts also activate analysis without a published workspace', async () => {
      service.setContext(null);
      const events = await collect({ chartData: chart });
      assert.equal(events.find((e) => e.type === 'analysis-report').data.claims[0].facts[0].callId, 'workspace');
    });
    await t.test('a selected profile before calculation still activates the analyst', async () => {
      service.setContext({ kind: 'western-chart', activeProfile: workspace.activeProfile });
      const events = await collect();
      assert.ok(events.some((e) => e.type === 'stage' && e.data === 'analysis'));
      assert.ok(events.some((e) => e.type === 'tool-call'));
    });
    await t.test('computed Chinese charts provide workspace evidence for natural questions too', async () => {
      const bazi = { bazi: { pillars: { year: { full: '甲申' }, month: { full: '辛未' }, day: { full: '丁亥' }, hour: { full: '乙巳' } }, dayMaster: { char: '丁', element: 'fire' } } };
      service.setContext({ kind: 'chinese-chart', activeProfile: workspace.activeProfile, lastBaziData: bazi });
      const events = await collect();
      const fact = events.find((e) => e.type === 'analysis-report').data.claims[0].facts[0];
      assert.equal(fact.callId, 'workspace');
      assert.match(fact.text, /八字四柱.*甲申/);
    });
    await t.test('an empty analyst response is repaired before the writer and includes the original question', async () => {
      service.setContext(workspace); emptyFirst = true;
      const events = await collect();
      const repaired = events.find((e) => e.type === 'analysis-report').data;
      assert.deepEqual(repaired.questions, ['最近发生了什么具体事情？']);
      assert.ok(events.some((e) => e.type === 'activity' && e.data.repair));
      const repair = requests.findLast((r) => r.messages.some(m => m.role === 'user' && m.content.includes('程序校验失败：')));
      assert.ok(repair.messages.some((m) => m.role === 'user' && m.content.includes(question)));
      assert.ok(!requests.at(-1).messages[0].content.includes('"claims":[],"questions":[]'));
    });
    await t.test('greetings remain ordinary conversation even with a chart selected', async () => {
      const events = await collect({ priorReport: report }, '谢谢！');
      assert.ok(!events.some((e) => e.type === 'stage' && e.data === 'analysis'));
      assert.ok(events.some((e) => e.type === 'token'));
    });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
