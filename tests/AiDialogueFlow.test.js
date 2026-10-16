'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AiService = require('../src/core/ai/AiService');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');

test('real agent handoff keeps grounded support when a separate professional claim fails completeness', async () => {
  const question = '争吵之后她三天没回消息，我很难受，帮我分析一下。';
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw); requests.push(body);
    const system = body.messages[0].content;
    let content;
    if (system.includes('分析 Subagent')) {
      const task = JSON.parse(system.split('【本轮任务约束；由程序固定】\n')[1].split('\n')[0]);
      const userRefs = [{ id: task.userEvidence[0].id, quote: '我很难受' }];
      content = JSON.stringify({ focus: question, claims: [
        { kind: 'hypothesis', basis: 'symbolic', statement: '星盘显示她想退出关系。', support: '没有实际计算。', meaning: '不应进入回答。', whatWouldChange: ['新资料'], userRefs },
        { kind: 'reflection', basis: 'conversation', statement: '你已经明确说这件事让你很难受。', meaning: '回应你的困扰，而不拿缺失星盘否定它。', userRefs },
        { kind: 'hypothesis', basis: 'conversation', statement: '她可能希望降低争吵后的互动压力。', support: '争吵后减少联系，只能形成解释假设。', meaning: '把暂时冷静与退出关系分开考虑。',
          userRefs: [{ id: task.userEvidence[0].id, quote: '争吵之后她三天没回消息' }], whatWouldChange: ['如果她明确表示不再交往，应调整判断。'],
          alternatives: [{ explanation: '她也可能想结束关系。', distinction: '是否愿意约定沟通时间。' }] },
      ], questions: [] });
    } else content = '{"text":"你已经说这件事让你很难受，先把想修复关系和不断追问分开。","evidenceIds":[]}\n{"text":"她可能希望降低争吵后的互动压力；这与想结束关系还不能仅靠沉默区分。可以看她是否愿意约定沟通时间。","evidenceIds":["E3"]}\n';
    const message = { role: 'assistant', content };
    if (body.stream) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); }
    else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ index: 0, message, finish_reason: 'stop' }] })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new AiService({}, {});
    await service._mp.configure({ provider: 'deepseek', model: 'test', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, contextWindow: 32000, maxTokens: 0 });
    service._configured = true; service._registry = new ToolRegistry();
    const events = [];
    for await (const event of service.chat([{ role: 'user', content: question }], { sessionId: 'dialogue' })) events.push(event);
    const report = events.find(event => event.type === 'analysis-report').data;
    assert.equal(report.readiness.status, 'partial');
    assert.deepEqual(report.claims.map(claim => claim.id), ['E2', 'E3']);
    const output = events.filter(event => event.type === 'token').map(event => event.data).join('');
    assert.match(output, /降低争吵后的互动压力/); assert.match(output, /解释假设 3/);
    assert.doesNotMatch(output, /相关判断暂不作出|本轮有部分依据|星盘显示|无法读心/);
    const writer = requests.at(-1).messages[0].content;
    assert.ok(writer.includes('是否愿意约定沟通时间'));
    assert.ok(!writer.includes('星盘显示她想退出关系'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
