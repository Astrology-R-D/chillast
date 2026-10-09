'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fuzzyMatch, searchScore } = require('../src/core/util/FuzzySearch');
test('matches Chinese, pinyin, initials, Unicode folding, and a bounded typo', () => {
  for (const query of ['太阳', 'taiyang', 'ty']) assert.equal(fuzzyMatch(query, ['太阳', 'sun']), true);
  assert.equal(fuzzyMatch('mercry', ['Mercury']), true);
  assert.equal(fuzzyMatch('STRASSE', ['Straße']), true);
  assert.equal(fuzzyMatch('liupanshui', ['六盘水']), true);
  assert.equal(fuzzyMatch('zzzzz', ['太阳', 'sun']), false);
  assert.equal(fuzzyMatch('999', ['123']), false);
  assert.equal(fuzzyMatch('太阳 第十宫', ['太阳', '第十宫']), true);
  assert.equal(fuzzyMatch('太阳 第十宫', ['月亮', '第十宫']), false);
});
test('orders exact, prefix, contained, and typo matches', () => {
  assert.ok(searchScore('sun', ['sun']) < searchScore('sun', ['sunrise']));
  assert.ok(searchScore('sun', ['sunrise']) < searchScore('sun', ['the sun']));
  assert.ok(searchScore('mars', ['the mars']) < searchScore('mars', ['marz']));
});
