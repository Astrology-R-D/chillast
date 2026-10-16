'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAnswerBlock, streamAnswerBlocks } = require('../src/core/ai/AnswerBlocks');

const report = { claims: [{ id: 'E1', kind: 'interpretation' }], task: { technical: false } };
const line = (text, evidenceIds = ['E1']) => JSON.stringify({ text, evidenceIds });

test('ordinary language about matching requirements is not mistaken for an astrological conjunction', () => {
  assert.doesNotThrow(() => parseAnswerBlock(line('这需要符合相关要求，也需要双方配合相互理解。'), report));
  assert.throws(() => parseAnswerBlock(line('这次是金星合相。'), report), error => error.code === 'ANSWER_STYLE_DETAIL');
});

async function collect(repaired, customReport = report) {
  let repairs = 0;
  const model = { async *stream() { yield { content: line('金星涉及你在关系中的需要。') + '\n' }; }, async invoke() { repairs++; return { content: repaired }; } };
  const events = [];
  for await (const event of streamAnswerBlocks({ model, messages: [], report: customReport, signal: new AbortController().signal, extract: c => c, finishReason: () => 'stop', repairMessages: async p => p })) events.push(event);
  return { events, repairs };
}

test('a remaining style term after rewriting no longer aborts a referenced answer', async () => {
  const { events, repairs } = await collect(line('金星这条线索对应的是你对关系回应的需要。'));
  assert.equal(repairs, 1);
  const text = events.filter(e => e.type === 'token').map(e => e.data).join('');
  assert.match(text, /你对关系回应的需要/);
  assert.match(text, /evidence:E1/);
});

test('style fallback never admits invented citations or unqualified psychological hypotheses', async () => {
  for (const result of [await collect(line('金星意味着她已经决定离开。', ['E99'])),
    await collect(line('金星意味着她已经决定离开。'), { ...report, claims: [{ id: 'E1', kind: 'hypothesis' }] })]) {
    const text = result.events.filter(e => e.type === 'token').map(e => e.data).join('');
    assert.doesNotMatch(text, /已经决定离开|E99/);
    assert.match(text, /未形成可核对/);
    assert.equal(result.repairs, 2);
  }
});
