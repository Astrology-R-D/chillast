'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const { parseReport, ReportValidationError, reportCatalog } = require('../src/core/ai/AnalysisProtocol');
const { evidenceCalls } = require('../src/core/ai/ToolResult');

const calls = [{ callId: 'c', artifact: { facts: { sun: '测试计算事实' }, sources: [{ id: 'Sreal', content: '原始引文', title: '测试来源' }] } }];
const valid = { kind: 'fact', basis: 'tool', statement: '已计算的测试事实', factRefs: ['c/sun'], sourceIds: ['Sreal'] };

test('reference errors identify exact paths without exposing text; partial parsing rejects entire claims and preserves IDs', () => {
  const raw = { focus: '问题', claims: [
    { ...valid, factRefs: ['private-content-wrong-ref'] },
    valid,
    { ...valid, checks: [{ condition: '核对条件', factRefs: ['c/missing'], sourceIds: ['KB-not-a-source'] }] },
  ] };
  let error;
  try { parseReport(JSON.stringify(raw), calls, 'ctx'); } catch (e) { error = e; }
  assert.ok(error instanceof ReportValidationError);
  assert.deepEqual(error.issues.map(i => i.path), ['claims[0].factRefs[0]', 'claims[2].checks[0].factRefs[0]', 'claims[2].checks[0].sourceIds[0]']);
  assert.ok(error.issues.every(i => i.fingerprint.length === 12));
  assert.doesNotMatch(JSON.stringify(error.issues), /private-content|测试事实/);
  const partial = parseReport(JSON.stringify(raw), calls, 'ctx', { allowPartial: true });
  assert.deepEqual(partial.claims.map(c => c.id), ['E2']);
  assert.equal(partial.sources[0].content, '原始引文');
  assert.equal(partial.validationIssues.length, 3);
  assert.throws(() => parseReport('{"private-content": broken', calls, 'ctx'), e => !e.message.includes('private-content'));
});

test('catalog includes authoritative graph artifacts before UI tool events are consumed', () => {
  const message = { name: 'compute_natal_chart', tool_call_id: 'c', artifact: calls[0].artifact };
  const early = JSON.parse(reportCatalog(evidenceCalls([], [message])));
  assert.equal(early.facts[0].ref, 'c/sun');
  assert.equal(early.sources[0].id, 'Sreal');
  assert.equal(evidenceCalls(calls, [message]).length, 1);
});

async function runFlow(mode) {
  const requests = [];
  const chart = { meta: { type: 'natal', settings: {} }, subjects: [{ birthLabel: '2000-01-01 10:00', location: { latitude: 30, longitude: 120 } }],
    rings: [{ id: 'natal', points: [{ key: 'sun', nameZh: '太阳', signNameZh: '摩羯座', degreeInSign: 10, house: 1 }] }], houses: [], aspects: [] };
  const good = { kind: 'fact', basis: 'tool', statement: '这是实际计算得到的结果。', factRefs: ['workspace/natal:sun'] };
  let analystCalls = 0;
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const data of req) raw += data;
    const body = JSON.parse(raw); requests.push(body);
    let content;
    if (body.messages[0].content.includes('分析 Subagent')) {
      analystCalls++;
      let claims;
      if (mode === 'retry') {
        claims = analystCalls === 1 ? [{ ...good, checks: [{ condition: '当前计算结果尚未核实', status: 'unresolved' }] }]
          : analystCalls === 2 ? [{ ...good, factRefs: ['workspace/not-real'] }] : [good];
      } else {
        claims = [{ ...good, statement: '引用错误的结论绝不能交给回答者。', factRefs: ['invented/fact'] }, ...(mode === 'partial' ? [good] : [])];
      }
      content = mode === 'malformed' ? '{broken report' : JSON.stringify({ focus: '计算星盘', claims, questions: [] });
    } else content = JSON.stringify({ text: '这条计算结果已经核对。', evidenceIds: [mode === 'partial' ? 'E2' : 'E1'] }) + '\n';
    const message = { role: 'assistant', content };
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ index: 0, message, finish_reason: 'stop' }] })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new AiService({}, {});
    await service._mp.configure({ provider: 'deepseek', model: 'test', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, contextWindow: 64000, maxTokens: 0 });
    service._configured = true; service._registry = new ToolRegistry();
    const events = []; let failure;
    try { for await (const event of service.chat([{ role: 'user', content: '只计算本命星盘数据' }], { sessionId: 'refs', chartData: chart })) events.push(event); }
    catch (error) { failure = error; }
    return { events, requests, failure, analystCalls };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('invalid references after completeness exploration are repaired using the original history', async () => {
  const { events, requests, failure, analystCalls } = await runFlow('retry');
  assert.equal(failure, undefined);
  assert.equal(analystCalls, 3);
  assert.equal(events.find(e => e.type === 'analysis-report').data.readiness.status, 'ready');
  const repair = requests[2].messages;
  assert.match(repair.at(-1).content, /claims\[0\].factRefs\[0\]/);
  assert.ok(repair.some(m => m.role === 'user' && m.content === '只计算本命星盘数据'));
  assert.ok(events.some(e => e.data?.repair));
  assert.equal(events.at(-1).type, 'done');
});

test('repeated invalid references quarantine only dependent claims and keep verified cards', async () => {
  const { events, requests, failure, analystCalls } = await runFlow('partial');
  assert.equal(failure, undefined);
  assert.equal(analystCalls, 6, 'three bounded analysis passes with at most one format repair each');
  const report = events.find(e => e.type === 'analysis-report').data;
  assert.equal(report.readiness.status, 'partial');
  assert.deepEqual(report.claims.map(c => c.id), ['E2']);
  assert.equal(report.claims[0].facts[0].callId, 'workspace');
  assert.doesNotMatch(requests.at(-1).messages[0].content, /引用错误的结论绝不能交给回答者/);
  assert.match(events.filter(e => e.type === 'token').map(e => e.data).join(''), /evidence:E2/);
});

test('all-invalid reports end with a recoverable notice after bounded retries instead of publishing unverified conclusions', async () => {
  const { events, failure, analystCalls } = await runFlow('invalid');
  assert.equal(failure, undefined);
  assert.equal(analystCalls, 6);
  const text = events.filter(e => e.type === 'token').map(e => e.data).join('');
  assert.match(text, /暂时不输出相关结论/);
  assert.doesNotMatch(text, /引用错误的结论绝不能/);
  assert.equal(events.at(-1).type, 'done');
});

test('repeated malformed analyst reports end softly and retain the report diagnostics', async () => {
  const { events, failure, analystCalls } = await runFlow('malformed');
  assert.equal(failure, undefined);
  assert.equal(analystCalls, 6);
  assert.equal(events.find(e => e.type === 'analysis-report').data.readiness.status, 'insufficient');
  assert.equal(events.at(-1).type, 'done');
  assert.doesNotMatch(events.filter(e => e.type === 'token').map(e => e.data).join(''), /broken report/);
});
