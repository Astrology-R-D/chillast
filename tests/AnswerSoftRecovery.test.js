'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { streamAnswerBlocks } = require('../src/core/ai/AnswerBlocks');
const report = { claims: [{ id: 'E1', kind: 'interpretation' }, { id: 'E2', kind: 'hypothesis' }] };
const line = (text, evidenceIds) => JSON.stringify({ text, evidenceIds });
async function run(initial, repairs, customReport = report, abortOnRepair = false) {
  const ac = new AbortController(), prompts = [], events = [];
  let calls = 0;
  const model = { async *stream() { yield { content: initial }; }, async invoke() { if (abortOnRepair) ac.abort(); return { content: repairs[calls++] || '' }; } };
  for await (const event of streamAnswerBlocks({ model, report: customReport, signal: ac.signal, extract: c => c, finishReason: () => 'stop', repairMessages: async p => { prompts.push(p); return p; } })) events.push(event);
  return { text: events.filter(e => e.type === 'token').map(e => e.data).join(''), calls, events, prompts };
}
test('a failed hypothesis correction gets a second targeted correction and resumes after the published prefix', async () => {
  const prefix = line('已核对的处境说明。', ['E1']);
  const bad = line('她已经决定离开。', ['E2']);
  const result = await run(prefix + '\n' + bad, [bad, line('一种解释是她想先冷静一下。', ['E2'])]);
  assert.equal(result.calls, 2);
  assert.equal(result.text.match(/已核对的处境说明/g).length, 1);
  assert.match(result.text, /一种解释/);
  assert.doesNotMatch(result.text, /已经决定离开|暂时省略/);
  assert.match(result.prompts[1], /E2/);
});
test('malformed and fabricated suffixes do not discard other corrected paragraphs or escape the retry limit', async () => {
  const result = await run(line('已核对的处境说明。', ['E1']) + '\n{broken', [
    line('伪造事实', ['E99']) + '\n' + line('她可能需要一些时间。', ['E2']), line('伪造事实', ['E99']),
  ]);
  assert.equal(result.calls, 2);
  assert.match(result.text, /她可能需要一些时间/);
  assert.match(result.text, /部分内容.*省略/);
  assert.doesNotMatch(result.text, /伪造事实|broken|E99/);
});
test('missing coverage triggers targeted repairs and eventually a partial notice, not a failed request', async () => {
  const prefix = line('已核对的处境说明。', ['E1']);
  const result = await run(prefix, [prefix, prefix]);
  assert.equal(result.calls, 2);
  assert.equal(result.text.match(/已核对的处境说明/g).length, 1);
  assert.match(result.text, /省略/);
});
test('cancel during an AI correction does not publish its late result or a fallback notice', async () => {
  const result = await run('broken', [line('修正结果', ['E1'])], report, true);
  assert.equal(result.text, '');
});
