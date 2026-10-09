'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const KnowledgeBase = require('../src/core/ai/KnowledgeBase');

const embeddings = {
  embedQuery: async () => [1, 0, 0, 0],
  embedDocuments: async (texts) => texts.map(() => [1, 0, 0, 0]),
};
const provider = { embeddings: () => embeddings };

test('cached inventory follows indexed documents, including Bazi files absent from the current checkout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-kb-inventory-'));
  const builtin = path.join(root, 'builtin');
  const index = path.join(root, 'index');
  fs.mkdirSync(builtin);
  const baziFile = path.join(builtin, '四柱算命术.md');
  fs.writeFileSync(baziFile, '# 八字知识\n\n' + '四柱八字的日主、十神与用神知识。\n'.repeat(160));
  fs.writeFileSync(path.join(builtin, 'planets.md'), '# 行星落座\n太阳落座的知识。');
  try {
    const first = new KnowledgeBase(provider);
    await first.initialize(builtin, null, index);
    fs.unlinkSync(baziFile);
    fs.writeFileSync(path.join(builtin, 'not-indexed.md'), '# 尚未建立索引的文档');
    const reloaded = new KnowledgeBase(provider);
    const events = []; reloaded.setProgressHandler((event) => events.push(event));
    await reloaded.initialize(builtin, null, index);
    const docs = reloaded.listDocuments();
    assert.deepEqual(docs.map((d) => d.name).sort(), ['planets.md', '四柱算命术.md'].sort());
    assert.equal(docs.find((d) => d.name === '四柱算命术.md').cachedOnly, true);
    assert.equal(docs.find((d) => d.name === 'planets.md').cachedOnly, false);
    assert.equal(docs.find((d) => d.name === 'planets.md').id, path.join(builtin, 'planets.md'));
    assert.ok(events.some((e) => e.phase === 'ready' && e.fromCache && e.docs === 2));
    assert.ok((await reloaded.retrieve('八字', 10)).some((d) => d.fileName === '四柱算命术.md' && d.content.includes('十神')));
    const another = new KnowledgeBase(provider);
    await another.initialize(null, null, index);
    assert.equal(another.listDocuments().length, 2);
    assert.equal(another.listDocuments().find((d) => d.name === '四柱算命术.md').id, docs.find((d) => d.name === '四柱算命术.md').id);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('user imports remain visible after restarting even when not copied to a managed directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-kb-import-inventory-'));
  const builtin = path.join(root, 'builtin');
  const user = path.join(root, 'user');
  const index = path.join(root, 'index');
  fs.mkdirSync(builtin);
  fs.writeFileSync(path.join(builtin, 'planets.md'), '# 行星落座\n太阳知识。');
  const imported = path.join(root, 'user-bazi.md');
  fs.writeFileSync(imported, '# 八字十神\n日主与十神的知识。');
  try {
    const first = new KnowledgeBase(provider);
    await first.initialize(builtin, user, index);
    await first.importDocuments([imported]);
    const reloaded = new KnowledgeBase(provider);
    await reloaded.initialize(builtin, user, index);
    const doc = reloaded.listDocuments().find((d) => d.name === 'user-bazi.md');
    assert.ok(doc);
    assert.equal(doc.source, 'user');
    assert.equal(doc.cachedOnly, true);
    assert.equal(reloaded._userPath, user);
    assert.ok((await reloaded.retrieve('日主', 5)).some((d) => d.fileName === doc.name));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
