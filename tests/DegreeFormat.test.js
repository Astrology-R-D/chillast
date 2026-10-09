'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDegreeMinutes } = require('../src/shared/DegreeFormat');
const { chartFacts } = require('../src/core/ai/ToolResult');
const { toText } = require('../src/core/ai/prompts/ChartSerializer');
const AngleMath = require('../src/core/util/AngleMath');

test('DMS carries rounded seconds across both minute and degree boundaries', () => {
  assert.deepEqual(AngleMath.toDms(18.9872), { degrees: 18, minutes: 59, seconds: 14 });
  assert.deepEqual(AngleMath.toDms(18.9999), { degrees: 19, minutes: 0, seconds: 0 });
  assert.deepEqual(AngleMath.toDms(29.9999), { degrees: 30, minutes: 0, seconds: 0 });
  assert.deepEqual(AngleMath.toDms(0.9999), { degrees: 1, minutes: 0, seconds: 0 });
});

test('formats decimal angles consistently without rounding across minute or sign boundaries', () => {
  for (const [input, expected] of [
    [18.9872, '18°59′'], [18.99, '18°59′'], [19, '19°00′'],
    [29.9999, '29°59′'], [0, '0°00′'], [12 + 59 / 60, '12°59′'],
    [-18.9872, '−18°59′'], [null, '—'], [NaN, '—'], [Infinity, '—'],
  ]) assert.equal(formatDegreeMinutes(input), expected);
});

test('model text and evidence use the same raw DTO angle and include top-level houses and angles', () => {
  const moon = { key: 'moon', glyph: '☽', nameZh: '月亮', signNameZh: '双鱼座', degreeInSign: 18.9872, house: 6 };
  const chart = {
    meta: { type: 'natal', instantUtc: '2004-07-07T03:15:00.000Z', settings: { houseSystem: 'placidus', zodiac: 'tropical' } },
    rings: [{ id: 'natal', label: '本命', points: [moon] }],
    houses: [{ index: 6, signNameZh: '双鱼座', degreeInSign: 2.9999 }],
    angles: { ascendant: { glyph: 'Asc', nameZh: '上升', signNameZh: '天秤座', degreeInSign: 29.9999, dms: { degrees: 29, minutes: 60, seconds: 0 } } },
  };
  const facts = chartFacts(chart);
  assert.equal(facts['natal:moon'], '本命 · 月亮 双鱼座 18°59′ 第6宫');
  assert.equal(facts['house:6'], '第6宫宫头 双鱼座 2°59′');
  const text = toText(chart);
  assert.match(text, /月亮\s+双鱼座 18°59′ 第6宫/);
  assert.match(text, /第6宫: 双鱼座 2°59′/);
  assert.match(text, /上升: 天秤座 29°59′/);
  assert.match(text, /普拉西度 · 回归黄道/);
  assert.match(text, /计算时刻（UTC）：2004-07-07T03:15:00.000Z/);
  assert.equal(moon.degreeInSign, 18.9872);
});
