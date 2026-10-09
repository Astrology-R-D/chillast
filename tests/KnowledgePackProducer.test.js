'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { validatePack } = require('../src/shared/KnowledgePack.cjs');
test('the preparer and CHILLAST share the same protocol and its output imports without conversion', async (t) => {
  const producer = path.resolve(__dirname, '../../knowledge_library/src/knowledge-pack.mjs');
  if (!fs.existsSync(producer)) { t.skip('sibling preparer checkout is unavailable'); return; }
  assert.deepEqual(fs.readFileSync(path.resolve(__dirname, '../../knowledge_library/src/vendor/KnowledgePack.cjs')), fs.readFileSync(path.resolve(__dirname, '../src/shared/KnowledgePack.cjs')));
  assert.deepEqual(fs.readFileSync(path.resolve(__dirname, '../../knowledge_library/src/vendor/KnowledgeUnit.cjs')), fs.readFileSync(path.resolve(__dirname, '../src/shared/KnowledgeUnit.cjs')));
  const { buildKnowledgePack } = await import(pathToFileURL(producer));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-producer-contract-'));
  try {
    fs.writeFileSync(path.join(root, 'test.md'), '# 八字十神\n保留的整理文本。');
    const buffer = await buildKnowledgePack([{ status: 'done', result: { readyDir: root, report: { source: 'test.pdf', sourceHash: 'a'.repeat(64), title: '书', config: { corpus: 'bazi' }, outputs: [{ outName: 'test.md', domain: 'shishen' }] } } }], { id: 'bazi', name: '八字库', version: '1.0.0' });
    const pack = validatePack(buffer); assert.deepEqual(pack.manifest.corpora, ['bazi']); assert.equal(pack.catalog.documents.length, 1); assert.ok(pack.catalog.documents[0].chunking.chunks.length);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
