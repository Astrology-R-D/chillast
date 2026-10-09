'use strict';
const { pinyin } = require('pinyin-pro');
const caseFold = require('./UnicodeCaseFold');
const cache = new Map();
const normalize = (text) => caseFold(String(text ?? '').normalize('NFKC')).trim();
function searchForms(text) {
  const value = normalize(text);
  if (cache.has(value)) return cache.get(value);
  const forms = [value];
  if (/\p{Script=Han}/u.test(value)) {
    const syllables = pinyin(value, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
    forms.push(syllables.join(''), syllables.join(' '), syllables.map((part) => part[0]).join(''));
  }
  if (cache.size >= 4096) cache.clear();
  cache.set(value, forms);
  return forms;
}
function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
function tokenScore(token, form) {
  if (form === token) return 0;
  if (form.startsWith(token)) return 1;
  if (form.includes(token)) return 2;
  if (!/^[a-z]{3,32}$/.test(token)) return Infinity;
  for (const word of form.split(/[\s/·,，]+/)) {
    if (word.length > 64) continue;
    if (token.length >= 4 && Math.abs(word.length - token.length) <= 1 && editDistance(token, word) <= 1) return 3;
    let index = 0;
    for (const character of word) if (character === token[index]) index++;
    if (index === token.length && word.length <= token.length * 2) return 4;
  }
  return Infinity;
}
function searchScore(query, fields) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const forms = fields.flatMap(searchForms);
  let score = 0;
  for (const token of tokens) {
    const best = Math.min(...forms.map((form) => tokenScore(token, form)));
    if (!Number.isFinite(best)) return Infinity;
    score += best;
  }
  return score;
}
function fuzzyMatch(query, fields) { return Number.isFinite(searchScore(query, fields)); }
module.exports = { fuzzyMatch, searchScore };
