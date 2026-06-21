'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock embeddings — deterministic vectors from text hash
const MockEmbeddings = {
  embedQuery: async (text) => {
    const v = new Array(384).fill(0);
    for (let i = 0; i < text.length && i < 384; i++) v[i] = text.charCodeAt(i) / 128;
    return v;
  },
  embedDocuments: async (texts) => texts.map((t) => {
    const v = new Array(384).fill(0);
    for (let i = 0; i < t.length && i < 384; i++) v[i] = t.charCodeAt(i) / 128;
    return v;
  }),
};

const MockModelProvider = {
  embeddings: () => MockEmbeddings,
};

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(() => {
    passed++; console.log(`  ✓ ${name}`);
  }).catch((e) => {
    failed++; console.log(`  ✗ ${name}: ${e.message}`);
  });
}

async function run() {
  const KnowledgeBase = require('../src/core/ai/KnowledgeBase');
  const tmpDir = path.join(os.tmpdir(), `kb-test-${Date.now()}`);
  const builtinDir = path.join(tmpDir, 'builtin');
  const indexDir = path.join(tmpDir, 'index');
  fs.mkdirSync(builtinDir, { recursive: true });
  fs.writeFileSync(
    path.join(builtinDir, 'test.md'),
    '# 行星落座\n\n## 太阳白羊座\n充满开创精神与行动力，性格直率果断。\n\n## 太阳金牛座\n务实稳重，重视物质安全与感官享受。'
  );

  console.log('\nKnowledgeBase');
  const kb = new KnowledgeBase(MockModelProvider);
  kb.setRagTopK(3);
  await kb.initialize(builtinDir, null, indexDir);

  await test('initializes and creates index', () => {
    assert.ok(kb.isReady(), 'KB should be ready');
  });

  await test('persists index to disk', () => {
    assert.ok(fs.existsSync(indexDir), 'index dir should exist');
    assert.ok(fs.existsSync(path.join(indexDir, 'args.json')), 'should have args.json');
  });

  await test('lists documents', () => {
    const docs = kb.listDocuments();
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].name, 'test.md');
  });

  await test('retrieve returns results', async () => {
    const results = await kb.retrieve('太阳白羊座');
    assert.ok(results.length > 0, 'should have results');
    assert.ok(results[0].content.includes('太阳'), 'should contain relevant content');
  });

  await test('retrieve respects ragTopK', async () => {
    const results = await kb.retrieve('太阳');
    assert.ok(results.length <= 3, `should respect topK=3, got ${results.length}`);
  });

  await test('retrieve includes domain metadata', async () => {
    const results = await kb.retrieve('太阳白羊座');
    assert.ok(results[0].domain, 'should have domain field');
    assert.strictEqual(results[0].domain, 'planets-signs', 'should detect domain from title');
  });

  // Test loading from persisted index
  const kb2 = new KnowledgeBase(MockModelProvider);
  kb2.setRagTopK(3);
  await kb2.initialize(builtinDir, null, indexDir);

  await test('loads from persisted index', () => {
    assert.ok(kb2.isReady(), 'should load from disk');
  });

  await test('loaded index retrieves correctly', async () => {
    const results = await kb2.retrieve('太阳金牛座');
    assert.ok(results.length > 0, 'should retrieve from loaded index');
  });

  await test('loaded index has doc list', () => {
    const docs = kb2.listDocuments();
    assert.strictEqual(docs.length, 1, 'should rebuild doc list');
  });

  // Test importDocuments
  const importFile = path.join(tmpDir, 'import-test.md');
  fs.writeFileSync(importFile, '# 相位解读\n\n## 合相\n两行星黄经接近，能量融合。');
  const importCount = await kb.importDocuments([importFile]);

  await test('importDocuments adds chunks', () => {
    assert.ok(importCount > 0, 'should import at least 1 chunk');
  });

  await test('importDocuments persists updated index', () => {
    // index dir should still exist after import
    assert.ok(fs.existsSync(indexDir), 'index should be persisted after import');
  });

  await test('imported doc is retrievable', async () => {
    const results = await kb.retrieve('合相');
    assert.ok(results.length > 0, 'should find imported content');
  });

  // Test removeDocument
  const removed = kb.removeDocument(importFile);
  await test('removeDocument removes from list', () => {
    assert.ok(removed, 'should return true for existing doc');
    const docs = kb.listDocuments();
    assert.strictEqual(docs.filter((d) => d.id === importFile).length, 0, 'should be gone from list');
  });

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
