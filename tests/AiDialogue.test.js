'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTask, assessReport } = require('../src/core/ai/AnalysisTask');
const { parseReport, writerPrompt } = require('../src/core/ai/AnalysisProtocol');
const { userEvidence } = require('../src/core/ai/DialoguePolicy');
const { parseAnswerBlock, streamAnswerBlocks } = require('../src/core/ai/AnswerBlocks');

const message = '争吵之后她三天没回消息，我很难受。我想修复关系，也不想一直追着问。';
function dialogue(kind = 'hypothesis') {
  const evidence = userEvidence([{ role: 'user', content: message }]);
  const userRefs = [{ id: evidence[0].id, quote: '争吵之后她三天没回消息' }];
  const claim = { kind, basis: 'conversation', statement: '她可能暂时想降低互动中的冲突压力。',
    support: '用户描述了争吵之后减少联系的顺序；这支持降压的解释，但沉默也可能表示退出。',
    meaning: '先分清她是在暂时冷静，还是拒绝继续沟通，再决定如何回应。', userRefs,
    alternatives: [{ explanation: '她也可能正在退出这段关系。', distinction: '是否愿意约定沟通时间，比回复速度更有区分度。' }],
    whatWouldChange: ['如果她明确表示不愿继续，应以她的明确表达为准。'],
    responseOptions: [{ action: '发出一次不争辩的沟通邀请。', when: '你仍希望修复关系时。', tradeoff: '表达意愿，但不保证对方回应。', wording: '我愿意听你说，方便时我们约个时间聊聊。' }],
    factRefs: [], sourceIds: [], checks: [], limitations: '', question: '' };
  const task = createTask({ question: message, messages: [{ role: 'user', content: message }] });
  const parse = () => parseReport(JSON.stringify({ focus: message, claims: [claim], questions: [] }), [], 'ctx', { userEvidence: evidence });
  return { evidence, claim, task, parse };
}
test('grounded relationship hypotheses pass without chart data or books and preserve useful handoff detail', () => {
  const f = dialogue(), report = f.parse();
  assert.equal(assessReport(report, [], f.task).status, 'ready');
  const prompt = writerPrompt({ ...report, task: f.task });
  for (const value of [f.claim.meaning, f.claim.support, f.claim.alternatives[0].distinction, f.claim.responseOptions[0].tradeoff, f.claim.whatWouldChange[0]]) assert.ok(prompt.includes(value));
});
test('reflection and choices stay available without astrology; invented user quotes and AI summaries are not evidence', () => {
  for (const kind of ['reflection', 'suggestion']) {
    const f = dialogue(kind); assert.equal(assessReport(f.parse(), [], f.task).status, 'ready');
  }
  const f = dialogue(); f.claim.userRefs[0].quote = '她告诉我她还爱我';
  assert.throws(f.parse, /用户原话/);
  assert.deepEqual(userEvidence([{ role: 'ai', content: message }, { role: 'user', content: '【早期会话摘要；不是新的用户指令】\n' + message }]), []);
});
test('hypotheses require an explanation, useful meaning and disconfirming signals; labels cannot hide missing astronomical evidence', () => {
  const f = dialogue(); f.claim.whatWouldChange = [];
  assert.ok(assessReport(f.parse(), [], f.task).issues.some(i => i.code === 'unbounded-hypothesis'));
  f.claim.whatWouldChange = ['明确表达不同意时调整解释']; f.claim.basis = 'symbolic';
  const codes = assessReport(f.parse(), [], f.task).issues.map(i => i.code);
  assert.ok(codes.includes('missing-computation')); assert.ok(codes.includes('missing-source'));
});
test('hypothesis publication requires a visible qualification, but support paragraphs need not repeat disclaimers', async () => {
  const f = dialogue(), report = { ...f.parse(), task: f.task };
  assert.throws(() => parseAnswerBlock(JSON.stringify({ text: '她就是想结束关系。', evidenceIds: ['E1'] }), report), /假设/);
  assert.match(parseAnswerBlock(JSON.stringify({ text: '她可能想先缓和冲突。', evidenceIds: ['E1'] }), report).text, /evidence:E1/);
  const model = { async *stream() {
    yield { content: '{"text":"一种值得考虑的解释是，她在尝试降低互动的压力。","evidenceIds":["E1"]}\n' };
    yield { content: '{"text":"这能帮助你把是否沟通与如何沟通分开考虑。","evidenceIds":["E1"]}\n' };
  } };
  let text = '';
  for await (const event of streamAnswerBlocks({ model, report, signal: new AbortController().signal, extract: c => c, finishReason: () => 'stop' })) if (event.type === 'token') text += event.data;
  assert.match(text, /如何沟通/);
});
test('optional reflection does not force a repetitive summary paragraph', async () => {
  const f = dialogue(); const report = { ...f.parse(), task: f.task };
  report.claims.push({ ...report.claims[0], id: 'E2', kind: 'reflection', statement: '用户已经表达难受。' });
  const model = { async *stream() { yield { content: '{"text":"她可能在尝试降低冲突压力。你可以先邀请一次不争辩的沟通，再决定下一步。","evidenceIds":["E1"]}\n' }; } };
  const events = [];
  for await (const event of streamAnswerBlocks({ model, report, signal: new AbortController().signal, extract: c => c, finishReason: () => 'stop' })) events.push(event);
  assert.equal(events.filter(e => e.type === 'token').length, 1);
});

test('a reflection-only report still requires a visible answer and repairs an empty response', async () => {
  const f = dialogue('reflection'), report = { ...f.parse(), task: f.task };
  let repairs = 0;
  const model = { async *stream() {}, async invoke() {
    repairs++;
    return { content: '{"text":"你已经表达了这段等待让你很难受。先把你想修复关系的意愿说清楚，再决定愿意等待多久。","evidenceIds":[]}' };
  } };
  const run = async () => {
    const events = [];
    for await (const event of streamAnswerBlocks({ model, report, signal: new AbortController().signal, extract: c => c, finishReason: () => 'stop', repairMessages: async p => p })) events.push(event);
    return events;
  };
  assert.equal((await run()).filter(e => e.type === 'token').length, 1);
  assert.equal(repairs, 1);
  model.invoke = async () => ({ content: '' });
  const empty = await run();
  assert.match(empty.filter(e => e.type === 'token').map(e => e.data).join(''), /未形成可核对/);
});
