'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { structureMarkdown, validateStructure } = require('../src/shared/KnowledgeStructure.cjs');
const { encodeUnit, decodeUnit } = require('../src/shared/KnowledgeUnit.cjs');
const { createReader } = require('../src/core/ai/KnowledgeRetrieval');

test('book structure preserves bytes, order, hierarchy, Unicode and chapter boundaries', () => {
  const text = '# Book\n## 目录\n月亮刑土星\n## 相位\n### Moon square Saturn\n' + '条件与例外 ☽ 😀\n'.repeat(40) + '\n## Summary\n概述。';
  const structure = structureMarkdown(text, 100);
  assert.equal(structure.chunks.map(c => text.slice(c.start, c.end)).join(''), text);
  assert.equal(structure.sections[1].type, 'toc');
  assert.deepEqual(structure.sections[3].chapterPath, ['Book', '相位', 'Moon square Saturn']);
  assert.equal(structure.sections.at(-1).type, 'overview');
  assert.ok(structure.sections[3].tags.includes('aspects'));
  for (const chunk of structure.chunks) {
    const section = structure.sections.find(s => s.id === chunk.sectionId);
    assert.ok(chunk.start >= section.start && chunk.end <= section.end);
    assert.ok(!/[\uD800-\uDBFF]$/.test(text.slice(chunk.start, chunk.end)));
  }
  validateStructure(text, structure);
  const bad = structuredClone(structure); bad.chunks[0].end++;
  assert.throws(() => validateStructure(text, bad), /不匹配/);
  const doc = decodeUnit(encodeUnit({ id: 'book', title: 'Book', corpus: 'astrology', domain: 'general', text }));
  assert.equal(doc.text, text); assert.ok(doc.structure.sections.length > 3);
});

test('hybrid retrieval prioritizes specific body, deduplicates, and reads pinned neighbors only', async () => {
  const doc = (text, type, n, corpus = 'astrology') => ({ pageContent: text, metadata: { source: 'pack', documentId: 'book', corpus, contentType: type, chapterPath: ['书', type], loc: {lines: {from: n, to: n}} } });
  const docs = [doc('月亮刑土星，太阳，金星，火星，全部目录', 'toc', 1), doc('月亮刑土星：概述', 'overview', 2), doc('月亮刑土星：具体解释与适用条件', 'body', 3), doc('例外：另有支持性相位时需修正解释。', 'body', 4), doc('月亮刑土星：具体解释与适用条件', 'body', 5), doc('八字十神', 'body', 6, 'bazi')];
  const store = { docstore: {_docs: new Map(docs.map((d, i) => [i, d]))}, similaritySearchWithScore: async (q, k, filter) => docs.filter(filter).slice(0, k).map((d, i) => [d, i]) };
  const reader = createReader([store], () => true, d => ({content: d.pageContent, corpus: d.metadata.corpus}));
  const results = await reader.search('月亮刑土星', 6, {corpus: 'astrology'});
  assert.equal(results[0].content, docs[2].pageContent);
  assert.equal(results.filter(r => r.content === docs[2].pageContent).length, 1);
  assert.ok(!results.some(r => r.corpus === 'bazi'));
  assert.deepEqual(reader.read(results[0].blockId, 1).map(r => r.content), docs.slice(1, 4).map(d => d.pageContent));
  assert.deepEqual(reader.read('../../arbitrary-file'), []);
  assert.equal(reader.read(results[0].nextBlockId, 0)[0].content, docs[3].pageContent);
  assert.equal((await reader.search('目录', 6))[0].contentType, 'toc');
});
