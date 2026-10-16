'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const AstroToolProvider = require('../src/core/ai/tools/AstroToolProvider');
const KnowledgeToolProvider = require('../src/core/ai/tools/KnowledgeToolProvider');

test('natural no-chart requests promote to analysis; stale dates trigger tools and next-day followups refresh', async () => {
  const birth = { year: 2004, month: 7, day: 7, hour: 11, minute: 15, latitude: 26.6, longitude: 104.8 };
  const profile = { id: 'p', nameEn: 'ObjectMale', birthData: { ...birth, location: { latitude: birth.latitude, longitude: birth.longitude } } };
  let clock = new Date('2026-10-13T03:00Z');
  const computed = [], requests = [];
  const astro = { computeChart: request => {
    computed.push(request.options.targetDate);
    return { meta: { type: 'transit', settings: request.settings, instantUtc: request.options.targetDate }, subjects: [], houses: [], aspects: [],
      rings: [{ id: 'transit', label: '行运', points: [{ key: 'moon', nameZh: '月亮', signNameZh: '双鱼座', degreeInSign: 3, house: 6 }] }] };
  } };
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const data of req) raw += data;
    const body = JSON.parse(raw); requests.push(body);
    const system = body.messages[0].content;
    let message;
    if (system.includes('逐行输出 JSON')) {
      message = { role: 'assistant', content: '{"text":"他更想调整每天投入精力的事情，把时间从重复的事务中腾出来。","evidenceIds":["E1"]}\n' };
    } else {
      const task = JSON.parse(system.split('【本轮任务约束；由程序固定】\n')[1].split('\n')[0]);
      const date = task.time.dates[0];
      const catalog = system.includes('【可用判据目录】\n') ? JSON.parse(system.split('【可用判据目录】\n').at(-1)) : { facts: [], sources: [], calculations: [] };
      const valid = catalog.calculations.find(c => c.targetDay === date);
      const fixing = body.messages.some(m => m.role === 'user' && m.content.includes('程序完整性检查未通过'));
      if (!system.includes('分析 Subagent') || (!valid && (!catalog.calculations.length || fixing))) {
        // The initial ordinary route intentionally computes yesterday. The gate must catch this.
        const selected = system.includes('分析 Subagent') ? date : '2026-10-12';
        const [targetYear, targetMonth, targetDay] = selected.split('-').map(Number);
        message = { role: 'assistant', content: null, tool_calls: [
          { id: `chart-${requests.length}`, type: 'function', function: { name: 'compute_transit', arguments: JSON.stringify({ ...birth, targetYear, targetMonth, targetDay }) } },
          { id: `kb-${requests.length}`, type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"行运解释的适用条件"}' } },
        ] };
      } else {
        const calc = valid || catalog.calculations[0];
        const fact = `${calc.callId}/transit:moon`, source = catalog.sources[0].id;
        message = { role: 'assistant', content: JSON.stringify({ focus: task.question, claims: [{ statement: '他更想调整每天投入精力的事情。', support: '该解释要求核对行运落座，已对应本轮计算。', factRefs: [fact], sourceIds: [source], checks: [{ condition: '行运落座与来源要求的条件吻合', status: 'verified', factRefs: [fact], sourceIds: [source] }] }], questions: [] }) };
      }
    }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ id: `test-${requests.length}`, choices: [{ index: 0, delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: `test-${requests.length}`, choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new AiService(astro, {}, { list: () => [profile] }, { now: () => clock });
    await service._mp.configure({ provider: 'deepseek', model: 'test', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, contextWindow: 32000, maxTokens: 0 });
    service._configured = true;
    service._registry = new ToolRegistry().register(new AstroToolProvider(astro, {})).register(new KnowledgeToolProvider({ isReady: () => true, retrieve: async () => [{ source: 'builtin', fileName: '行运正文.md', content: '解释需要核对行运落座及相反依据。' }] }));
    const collect = async (question, priorReport) => {
      const events = [];
      for await (const event of service.chat([{ role: 'user', content: question }], { sessionId: 'test', priorReport })) events.push(event);
      return events;
    };
    const first = await collect('ObjectMale最近在搞些啥');
    const report = first.find(e => e.type === 'analysis-report').data;
    assert.equal(report.readiness.status, 'ready');
    assert.ok(first.some(e => e.data?.topic === '补齐时间、对象和解释适用条件'));
    assert.deepEqual(computed.map(d => d.slice(0, 10)), ['2026-10-12', '2026-10-13']);
    assert.ok(first.findIndex(e => e.type === 'analysis-report') < first.findIndex(e => e.type === 'token'));
    assert.ok(!first.filter(e => e.type === 'token').some(e => e.data.includes('行运月亮')));
    assert.match(first.filter(e => e.type === 'token').map(e => e.data).join(''), /evidence:E1/);
    assert.ok(requests.some(r => r.messages[0].content.includes('分析 Subagent') && r.messages.some(m => m.role === 'tool')), 'promotion carries completed tool results instead of rerunning blindly');
    clock = new Date('2026-10-14T03:00Z');
    const second = await collect('那感情呢', report);
    const next = second.find(e => e.type === 'analysis-report').data;
    assert.equal(next.readiness.status, 'ready');
    assert.deepEqual(next.task.time.dates, ['2026-10-14']);
    assert.equal(computed.at(-1).slice(0, 10), '2026-10-14');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
