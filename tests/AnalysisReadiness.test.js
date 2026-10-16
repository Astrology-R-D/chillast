'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTask, timeScope, birthIdentity, assessReport } = require('../src/core/ai/AnalysisTask');
const { parseReport } = require('../src/core/ai/AnalysisProtocol');
const { chartToolResult, sourceSnapshot } = require('../src/core/ai/ToolResult');
const { parseAnswerBlock, streamAnswerBlocks } = require('../src/core/ai/AnswerBlocks');

const birth = { year: 2004, month: 7, day: 7, hour: 11, minute: 15, location: { latitude: 26.6, longitude: 104.8 } };
const profile = { id: 'p', nameEn: 'ObjectMale', birthData: birth };
const now = new Date('2026-10-13T16:30:00Z');
function fixture(question = 'ObjectMale最近在搞些啥') {
  const task = createTask({ question, profiles: [profile], now, zone: 'Asia/Shanghai' });
  const source = sourceSnapshot({ fileName: '正文.md', content: '这是适用条件和解释正文。', contentType: 'body', blockId: 'KBtest' });
  const calls = [{ callId: 'c', tool: 'compute_transit', artifact: chartToolResult({ meta: { type: 'transit' }, rings: [{ id: 'transit', points: [{ key: 'moon', nameZh: '月亮', degreeInSign: 3 }] }] }, '', {
    subjectKeys: [birthIdentity(birth)], targetDate: '2026-10-14T12:00:00Z', targetDay: '2026-10-14', settings: { zodiac: 'tropical', houseSystem: 'placidus' },
  }).artifact }, { callId: 'k', tool: 'search_knowledge', artifact: { kind: 'knowledge', sources: [source] } }];
  const raw = { focus: question, claims: [{ statement: '他更想调整每天投入精力的事情。', support: '来源的条件与本轮计算吻合。', factRefs: ['c/transit:moon'], sourceIds: [source.id], checks: [{ condition: '解释中的落座条件与实际计算相符', status: 'verified', factRefs: ['c/transit:moon'], sourceIds: [source.id] }] }], questions: [] };
  return { task, source, calls, raw, report: () => parseReport(JSON.stringify(raw), calls, 'ctx') };
}

test('relative dates refresh in the user timezone; fixed historical dates do not drift', () => {
  const current = timeScope('最近如何', null, now, 'Asia/Shanghai');
  assert.deepEqual(current.dates, ['2026-10-14']);
  assert.deepEqual(timeScope('那感情呢', current, new Date('2026-10-14T16:30Z'), 'Asia/Shanghai').dates, ['2026-10-15']);
  const historic = timeScope('2020年2月29日的情况', null, now, 'Asia/Shanghai');
  assert.deepEqual(timeScope('那感情呢', historic, now, 'America/New_York').dates, ['2020-02-29']);
  assert.equal(timeScope('2026-02-30的行运', null, now, 'Asia/Shanghai').valid, false);
  assert.deepEqual(timeScope('2004年7月7日出生，最近如何', null, now, 'Asia/Shanghai').dates, ['2026-10-14']);
  const instant = timeScope('2026-10-14T08:30:00+08:00的情况', null, now, 'Asia/Shanghai');
  assert.equal(instant.mode, 'instant'); assert.equal(instant.instantUtc, '2026-10-14T00:30:00.000Z');
});

test('month, year, rolling ranges and their followups keep their direction and calendar boundaries', () => {
  assert.deepEqual(timeScope('本月如何', null, now, 'Asia/Shanghai').dates, ['2026-10-01', '2026-10-31']);
  assert.deepEqual(timeScope('今年如何', null, now, 'Asia/Shanghai').dates, ['2026-01-01', '2026-12-31']);
  const future = timeScope('未来7天', null, now, 'Asia/Shanghai');
  assert.deepEqual(future.dates, ['2026-10-14', '2026-10-20']);
  assert.deepEqual(timeScope('那感情呢', future, new Date('2026-10-14T16:30Z'), 'Asia/Shanghai').dates, ['2026-10-15', '2026-10-21']);
});

test('valid evidence passes; old dates, wrong birth inputs and changed calculation settings fail', () => {
  const f = fixture();
  assert.equal(assessReport(f.report(), f.calls, f.task).status, 'ready');
  f.calls[0].artifact.calculation.targetDay = '2026-10-13';
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'missing-target-date'));
  f.calls[0].artifact.calculation.subjectKeys = [birthIdentity({ ...birth, minute: 16 })];
  f.task.settings = { zodiac: 'sidereal' };
  const codes = assessReport(f.report(), f.calls, f.task).issues.map(i => i.code);
  assert.ok(codes.includes('wrong-subject')); assert.ok(codes.includes('wrong-settings'));
});

test('precise current questions reject a noon snapshot; a period needs both endpoints', () => {
  const f = fixture('ObjectMale此刻的情况');
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'stale-instant'));
  f.calls[0].artifact.calculation.targetDate = now.toISOString();
  assert.equal(assessReport(f.report(), f.calls, f.task).status, 'ready');
  f.task = createTask({ question: 'ObjectMale未来7天如何', profiles: [profile], now, zone: 'Asia/Shanghai' });
  const result = assessReport(f.report(), f.calls, f.task);
  assert.ok(result.issues.some(i => i.message.includes('2026-10-20')));
});

test('citing only natal facts from a fresh transit chart cannot pass a current-condition claim', () => {
  const f = fixture();
  f.calls[0].artifact.facts = { 'natal:moon': '本命月亮' };
  f.raw.claims[0].factRefs = ['c/natal:moon']; f.raw.claims[0].checks[0].factRefs = ['c/natal:moon'];
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'missing-target-date'));
});

test('profile lookup does not need an astrology book or chart to report existing profile data', () => {
  const f = fixture('查找ObjectMale的档案');
  f.calls[0] = { callId: 'c', tool: 'find_profile_by_name', artifact: { kind: 'profiles', facts: { profile: '已有档案信息' } } };
  f.raw.claims[0] = { statement: '已找到这个档案。', factRefs: ['c/profile'], sourceIds: [] };
  assert.equal(assessReport(f.report(), f.calls, f.task).status, 'ready');
});

test('precise transit tool preserves the query instant; invalid calendar dates are not normalized silently', async () => {
  const { buildComputeTools } = require('../src/core/ai/AstroToolkit');
  const targets = [];
  const tools = await buildComputeTools({ computeChart: r => { targets.push(r.options.targetDate); return { meta: { type: r.type }, rings: [], houses: [], aspects: [] }; } }, {});
  const tool = tools.find(t => t.name === 'compute_transit');
  const args = { ...birth, latitude: birth.location.latitude, longitude: birth.location.longitude, targetDate: '2026-10-14T08:30:00+08:00' };
  const result = await tool.func(args);
  assert.equal(result[1].calculation.targetDate, '2026-10-14T00:30:00.000Z');
  assert.equal(result[1].calculation.targetDay, '2026-10-14');
  const invalid = await tool.func({ ...args, targetDate: '2026-02-30T12:00:00Z' });
  assert.match(invalid[0], /计算失败/); assert.equal(targets.length, 1);
});

test('real references alone do not pass: missing applicability, overview and recalled sources need more work', () => {
  const f = fixture();
  f.raw.claims[0].checks[0].status = 'unresolved';
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'unresolved-condition'));
  f.raw.claims[0].checks[0].status = 'verified'; f.source.contentType = 'overview';
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'overview-only'));
  f.source.contentType = 'body'; f.calls[1].tool = 'recall_conversation';
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'historical-source'));
});

test('a gap removes only the affected claim and keeps supported findings', () => {
  const f = fixture();
  f.raw.claims.push({ ...f.raw.claims[0], sourceIds: [], checks: [] });
  const result = assessReport(f.report(), f.calls, f.task);
  assert.equal(result.status, 'partial'); assert.deepEqual(result.accepted.map(c => c.id), ['E1']);
});

test('unconfirmed inner experience can remain a hypothesis, but unresolved data and stale dates cannot', () => {
  const f = fixture();
  Object.assign(f.raw.claims[0], { kind: 'hypothesis', basis: 'symbolic', statement: '他可能在重新分配日常投入。',
    meaning: '可把注意力转向目前每天投入的事务，作为自我探索角度。', whatWouldChange: ['本人明确说明最近没有这些顾虑时调整判断。'] });
  f.raw.claims[0].checks.push({ category: 'reality', condition: '本人是否确实正在重新分配精力', status: 'unresolved', factRefs: [], sourceIds: [] });
  assert.equal(assessReport(f.report(), f.calls, f.task).status, 'ready');
  f.raw.claims[0].checks[0].status = 'unresolved';
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'unresolved-condition'));
  f.raw.claims[0].checks[0].status = 'verified'; f.calls[0].artifact.calculation.targetDay = '2026-10-13';
  assert.ok(assessReport(f.report(), f.calls, f.task).issues.some(i => i.code === 'missing-target-date'));
});

test('a recorded noon birth is not automatically labelled unknown or assumed', () => {
  const noon = { ...profile, birthData: { ...birth, hour: 12, minute: 0 } };
  const task = createTask({ question: 'ObjectMale最近如何', profiles: [noon], now });
  assert.deepEqual(task.subjects[0].birthTime, { hour: 12, minute: 0, accuracy: 'unspecified' });
  assert.ok(task.subjects[0].birthKey);
});

test('followups reload the latest profile revision and a new named subject replaces the old one', () => {
  const f = fixture();
  const revised = { ...profile, birthData: { ...birth, minute: 20 } };
  const other = { id: 'q', nameEn: 'OtherPerson', birthData: { ...birth, year: 2000 } };
  const next = createTask({ question: '那感情呢', previous: f.task, profiles: [revised, other], now, zone: 'Asia/Shanghai' });
  assert.notEqual(next.subjects[0].birthKey, f.task.subjects[0].birthKey);
  const switched = createTask({ question: 'OtherPerson最近如何', previous: f.task, profiles: [revised, other], now, zone: 'Asia/Shanghai' });
  assert.deepEqual(switched.subjects.map(s => s.id), ['q']);
});

test('validated paragraphs own citation links, reject bad IDs and keep technical details out of the body', () => {
  const f = fixture(), report = { ...f.report(), task: f.task };
  assert.match(parseAnswerBlock(JSON.stringify({ text: '他想调整每天投入精力的事情。', evidenceIds: ['E1'] }), report).text, /evidence:E1/);
  assert.throws(() => parseAnswerBlock(JSON.stringify({ text: '行运月亮在第9宫，15°', evidenceIds: ['E1'] }), report), /技术明细/);
  assert.throws(() => parseAnswerBlock(JSON.stringify({ text: '判断', evidenceIds: ['E99'] }), report), /不存在/);
});

test('streamed bad suffixes are repaired without ever displaying technical output', async () => {
  const f = fixture(), report = { ...f.report(), task: f.task };
  const model = { async *stream() { yield { content: '{"text":"行运月亮在第9宫","evidenceIds":["E1"]}\n' }; }, async invoke() { return { content: '{"text":"他正在重新分配每天的精力。","evidenceIds":["E1"]}' }; } };
  const events = [];
  for await (const event of streamAnswerBlocks({ model, messages: [], report, signal: new AbortController().signal, extract: v => v, finishReason: () => 'stop', repairMessages: async p => [p] })) events.push(event);
  const text = events.filter(e => e.type === 'token').map(e => e.data).join('');
  assert.ok(!text.includes('第9宫')); assert.match(text, /evidence:E1/); assert.ok(events.some(e => e.data?.repair));
});
