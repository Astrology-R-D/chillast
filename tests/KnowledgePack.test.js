'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const AdmZip = require('adm-zip');
const protocol = require('../src/shared/KnowledgePack.cjs');
const Manager = require('../src/core/ai/KnowledgePackManager');
const KnowledgeBase = require('../src/core/ai/KnowledgeBase');
const { sourceSnapshot } = require('../src/core/ai/ToolResult');
const makePack = (version, text = '日主与十神的可核对原文。') => protocol.createPack({ id: 'bazi-library', name: '八字知识库', version,
  documents: [{ id: 'Dbook-shishen', title: '八字书 · 十神', corpus: 'bazi', domain: 'shishen', text }] });
test('bundled packs register offline, become searchable with embeddings, and preserve user disable/removal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-bundled-'));
  try {
    const bundledPath = path.join(root, 'shipped'); fs.mkdirSync(bundledPath);
    fs.writeFileSync(path.join(bundledPath, 'library.kbpack'), makePack('1.0.0'));
    const options = { root: path.join(root, 'installed'), bundledPath, modelProvider: { embeddings: () => null } };
    let manager = await new Manager(options).initialize();
    assert.equal(manager.listPacks().packs[0].active, true);
    assert.equal(manager.listPacks().packs[0].ready, false);
    manager = await new Manager({ ...options, modelProvider: provider() }).initialize();
    assert.ok((await manager.retrieve('十神', 2)).length);
    await manager.disable('bazi-library');
    manager = await new Manager(options).initialize();
    assert.equal(manager.listPacks().packs[0].active, false);
    await manager.remove('bazi-library', '1.0.0');
    manager = await new Manager(options).initialize();
    assert.equal(manager.listPacks().packs.length, 0);
    fs.writeFileSync(path.join(bundledPath, 'new.kbpack'), makePack('2.0.0'));
    manager = await new Manager(options).initialize();
    assert.equal(manager.listPacks().packs[0].active, false);
    assert.equal(manager.listPacks().packs[0].version, '2.0.0');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
function provider() {
  return { _settings: { embeddings: { provider: 'mock', model: 'model-a' } }, embeddings: () => ({ embedQuery: async () => [1, 0, 0, 0], embedDocuments: async (texts) => texts.map(() => [1, 0, 0, 0]) }) };
}

test('package metadata is available during slow legacy initialization and startup does not test the chat API', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-pack-startup-'));
  const service = new (require('../src/core/ai/AiService'))({}, {});
  const original = KnowledgeBase.prototype.initialize;
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  KnowledgeBase.prototype.initialize = async () => { entered(); await blocked; };
  const mp = provider();
  mp.configure = async () => {}; mp.isConfigured = () => true; mp.close = async () => {};
  let connectionTests = 0;
  mp.testConnection = async () => { connectionTests++; throw new Error('offline'); };
  service._mp = mp;
  let configuring;
  try {
    const bundledPath = path.join(root, 'bundled'); fs.mkdirSync(bundledPath);
    fs.writeFileSync(path.join(bundledPath, 'book.kbpack'), makePack('1.0.0'));
    configuring = service.configure({ knowledgeBuiltinPath: path.join(root, 'legacy'), knowledgePackPath: path.join(root, 'packages'), knowledgeBundledPackPath: bundledPath });
    await started;
    const manager = service.getKnowledgePacks();
    assert.equal(manager.listPacks().packs[0].active, true);
    assert.equal(manager.listPacks().busy, true);
    await assert.rejects(() => manager.disable('bazi-library'), /正在准备/);
    release(); await configuring;
    assert.equal(connectionTests, 0);
    assert.equal(manager.listPacks().busy, false);
    assert.equal(manager.listPacks().packs[0].ready, true);
    assert.ok((await manager.retrieve('十神', 2)).length);
  } finally {
    release(); await configuring;
    KnowledgeBase.prototype.initialize = original;
    await service.close(); fs.rmSync(root, { recursive: true, force: true });
  }
});
test('pack protocol validates checksums, metadata and safe ZIP paths', () => {
  const buffer = makePack('1.0.0'), pack = protocol.validatePack(buffer);
  assert.equal(pack.catalog.documents[0].corpus, 'bazi');
  const tampered = new AdmZip(buffer); tampered.updateFile(pack.catalog.documents[0].path, Buffer.from('被修改'));
  assert.throws(() => protocol.validatePack(tampered.toBuffer()), /哈希不匹配/);
  const unsafe = new AdmZip(buffer); unsafe.addFile('../outside.md', Buffer.from('x'));
  assert.throws(() => protocol.validatePack(unsafe.toBuffer()), /路径|类型/);
  const executable = new AdmZip(buffer); executable.addFile('documents/code.js', Buffer.from('code'));
  assert.throws(() => protocol.validatePack(executable.toBuffer()), /路径|类型/);
  const future = new AdmZip(buffer); const manifest = pack.manifest; manifest.schemaVersion = 9;
  future.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  assert.throws(() => protocol.validatePack(future.toBuffer()), /不兼容/);
  assert.equal(protocol.safePath('documents/CON.md'), false);
  assert.equal(protocol.safePath('documents/c:/x.md'), false);
});
test('export provenance omits API keys and local paths, and does not invent original page mappings', () => {
  const p = protocol.preparationProvenance({ source: 'C:/private/book.pdf', sourceHash: 'abc', title: '书', config: { apiKey: 'TOP-SECRET', outputDir: 'C:/private', baseUrl: 'https://private-api', corpus: 'bazi', model: 'mock' } });
  assert.equal(p.sourceName, 'book.pdf');
  assert.equal(p.originalPageMapping, 'unverified');
  assert.ok(!JSON.stringify(p).includes('TOP-SECRET'));
  assert.ok(!JSON.stringify(p).includes('C:/private'));
});
test('installation, update and rollback pin in-flight sources and never replace the legacy index', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-pack-'));
  try {
    const builtin = path.join(root, 'builtin'), user = path.join(root, 'user'), index = path.join(root, 'legacy'); fs.mkdirSync(builtin);
    fs.writeFileSync(path.join(builtin, '八字旧资料.md'), '# 八字\n旧索引独有的八字知识。');
    const mp = provider(), legacy = new KnowledgeBase(mp); await legacy.initialize(builtin, user, index);
    const imported = path.join(root, 'notes.md'); fs.writeFileSync(imported, '# 个人笔记\n用户资料。'); await legacy.importDocuments([imported]);
    const original = fs.readFileSync(path.join(index, 'docstore.json'));
    const manager = await new Manager({ root: path.join(root, 'packages'), modelProvider: mp, legacy }).initialize();
    const v1 = path.join(root, 'v1.kbpack'), v2 = path.join(root, 'v2.kbpack'); fs.writeFileSync(v1, makePack('1.0.0')); fs.writeFileSync(v2, makePack('2.0.0', '新版十神解释原文。'));
    await manager.install(v1); assert.equal(manager.listPacks().packs[0].active, false);
    await manager.activate('bazi-library', '1.0.0');
    const pinned = manager.createSnapshot(); const fp1 = pinned.fingerprint;
    const service = new (require('../src/core/ai/AiService'))({}, {});
    service._packs = manager;
    service._registry = new (require('../src/core/ai/tools/ToolRegistry'))().register(new (require('../src/core/ai/tools/KnowledgeToolProvider'))(manager));
    const boundTools = await service._toolsForSession(null, [], null, pinned);
    const firstContextKey = service._contextKey();
    const first = (await pinned.retrieve('十神', 4, { corpus: 'bazi' })).find((d) => d.pack);
    const originalSource = sourceSnapshot(first);
    assert.ok(first.blockId);
    const read = await boundTools.find(tool => tool.name === 'read_knowledge').invoke({ type: 'tool_call', id: 'read-pinned', name: 'read_knowledge', args: { blockId: first.blockId, radius: 0 } });
    assert.equal(read.artifact.sources[0].content, first.content);
    assert.equal(read.artifact.sources[0].id, originalSource.id);
    assert.equal(originalSource.pack.version, '1.0.0');
    assert.equal(originalSource.location.basis, 'prepared-text');
    await manager.install(v2); await manager.activate('bazi-library', '2.0.0');
    assert.notEqual(service._contextKey(), firstContextKey, 'knowledge changes invalidate same-chart report reuse');
    const bound = await boundTools.find((tool) => tool.name === 'search_knowledge').invoke({ type: 'tool_call', id: 'pinned-call', name: 'search_knowledge', args: { query: '十神', corpus: 'bazi' } });
    assert.equal(bound.artifact.sources.find((s) => s.pack).pack.version, '1.0.0', 'AI tool binding uses the turn snapshot, not the current selection');
    assert.equal(pinned.read(first.blockId, 0)[0].pack.version, '1.0.0');
    assert.deepEqual(manager.read(first.blockId, 0), [], 'new snapshots cannot resolve IDs from inactive package versions');
    assert.notEqual(manager.fingerprint(), fp1);
    assert.equal((await pinned.retrieve('十神', 4, { corpus: 'bazi' })).find((d) => d.pack).pack.version, '1.0.0');
    const latest = (await manager.retrieve('十神', 4, { corpus: 'bazi' })).find((d) => d.pack);
    assert.match(latest.content, /新版/); assert.equal(latest.pack.version, '2.0.0');
    assert.notEqual(sourceSnapshot(latest).id, originalSource.id);
    assert.equal(originalSource.content, first.content);
    await manager.activate('bazi-library', '1.0.0'); assert.equal(manager.fingerprint(), fp1);
    await manager.setBuiltinEnabled(false);
    assert.ok(manager.listDocuments().some((d) => d.source === 'user'));
    assert.ok(!manager.listDocuments().some((d) => d.source === 'builtin'));
    assert.ok(!(await manager.retrieve('旧资料', 6)).some((d) => d.source === 'builtin'));
    assert.ok((await manager.retrieve('笔记', 6)).some((d) => d.source === 'user'));
    assert.deepEqual(fs.readFileSync(path.join(index, 'docstore.json')), original);
    const reload = await new Manager({ root: manager.root, modelProvider: mp, legacy }).initialize();
    assert.equal(reload.listPacks().packs.find((p) => p.active).version, '1.0.0');
    assert.equal(reload.listPacks().builtinEnabled, false);
    await assert.rejects(() => reload.remove('bazi-library', '1.0.0'), /先停用/);
    await reload.disable('bazi-library'); await reload.remove('bazi-library', '1.0.0');
    assert.ok(!reload.listPacks().packs.some((p) => p.version === '1.0.0'));
    assert.equal((await pinned.retrieve('十神', 4, { corpus: 'bazi' })).find((d) => d.pack).pack.version, '1.0.0');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('conflicting versions and failed index preparation leave the active library unchanged; embedding changes get a new cache', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-pack-failure-'));
  try {
    const mp = provider(), manager = await new Manager({ root: path.join(root, 'packages'), modelProvider: mp }).initialize();
    const file = path.join(root, 'book.kbpack'); fs.writeFileSync(file, makePack('1.0.0'));
    await manager.install(file); await manager.activate('bazi-library', '1.0.0'); const before = manager.fingerprint();
    fs.writeFileSync(file, makePack('1.0.0', '同一版本的新内容'));
    await assert.rejects(() => manager.install(file), /不同内容/); assert.equal(manager.fingerprint(), before);
    fs.writeFileSync(file, makePack('2.0.0'));
    const old = mp.embeddings; mp.embeddings = () => ({ embedDocuments: async () => { throw new Error('测试：嵌入失败'); } });
    await assert.rejects(() => manager.install(file), /嵌入失败/); mp.embeddings = old;
    assert.equal(manager.fingerprint(), before);
    assert.equal(manager.listPacks().packs.length, 1);
    const caches = fs.readdirSync(path.join(manager.root, 'indexes')).length;
    mp._settings.embeddings.model = 'model-b';
    const reconfigured = await new Manager({ root: manager.root, modelProvider: mp }).initialize();
    assert.ok(reconfigured.listPacks().packs[0].ready);
    assert.equal(fs.readdirSync(path.join(manager.root, 'indexes')).length, caches + 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('AI service preserves the selected knowledge version across chat configuration changes and builds usable retrieval tools', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-pack-service-'));
  const service = new (require('../src/core/ai/AiService'))({}, {});
  const mp = provider();
  mp.configure = async (settings) => { mp._settings = settings; };
  mp.isConfigured = () => false; mp.close = async () => {};
  service._mp = mp;
  try {
    await service.configure({ provider: 'controlled', model: 'chat-a', embeddings: mp._settings.embeddings,
      knowledgeBuiltinPath: path.join(root, 'builtin'), knowledgeUserPath: path.join(root, 'user'), knowledgeIndexDir: path.join(root, 'legacy'), knowledgePackPath: path.join(root, 'packages') });
    const file = path.join(root, 'book.kbpack'); fs.writeFileSync(file, makePack('1.0.0'));
    await service.getKnowledgePacks().install(file); await service.getKnowledgePacks().activate('bazi-library', '1.0.0');
    await service.refreshKnowledgeTools();
    assert.ok((await service.getToolRegistry().getTools()).some((t) => t.name === 'search_knowledge'));
    await service.configure({ model: 'chat-b' });
    assert.equal(service.getKnowledgePacks().listPacks().packs.find((p) => p.active).version, '1.0.0');
    assert.equal((await service.getKnowledgeBase().retrieve('十神', 4, { corpus: 'bazi' }))[0].pack.version, '1.0.0');
    assert.equal(service.status().knowledgeDocCount, 1);
  } finally { await service.close(); fs.rmSync(root, { recursive: true, force: true }); }
});


test('prepared unit chunk boundaries and body-relative source lines are preserved by real HNSW indexing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-unit-index-'));
  try {
    const unit = require('../src/shared/KnowledgeUnit.cjs');
    const text = '# Moon / 月亮\n\n' + 'This is the original English source. 中文和 ☽ 符号。\n'.repeat(50);
    const doc = unit.decodeUnit(unit.encodeUnit({id: 'Dmoon', title: 'Moon', corpus: 'astrology', domain: 'planets-signs', text}));
    const file = path.join(root, 'prepared.kbpack');
    fs.writeFileSync(file, protocol.createPack({id: 'prepared', name: '已分块知识', version: '1', documents: [doc]}));
    const embedded = [], mp = provider();
    mp.embeddings = () => ({embedQuery: async () => [1, 0, 0, 0], embedDocuments: async texts => {embedded.push(...texts); return texts.map(() => [1, 0, 0, 0]);}});
    const manager = await new Manager({root: path.join(root, 'packages'), modelProvider: mp}).initialize();
    await manager.install(file); await manager.activate('prepared', '1');
    assert.deepEqual(embedded, doc.chunking.chunks.map(c => text.slice(c.start, c.end)));
    assert.equal(embedded.join(''), text);
    const runtime = manager._runtimeFor(manager._activeEntries()[0]);
    const stored = [...runtime.store.docstore._docs.values()];
    assert.deepEqual(stored.map(d => d.metadata.loc.lines), doc.chunking.chunks.map(c => ({from: c.lineStart, to: c.lineEnd})));
    const sources = await manager.retrieve('Moon', 20, {corpus: 'astrology'});
    assert.equal(sources.length, doc.chunking.chunks.length);
    assert.ok(sources.every(source => source.location.basis === 'prepared-text' && source.location.lines.from >= 1));
    const reload = await new Manager({root: manager.root, modelProvider: mp}).initialize();
    assert.equal((await reload.retrieve('Moon', 20)).length, sources.length);
    assert.equal(embedded.length, sources.length, 'restart reuses the index without embedding again');
    const invalid = {...doc, chunking: {...doc.chunking, chunks: [{...doc.chunking.chunks[0], start: 1}, ...doc.chunking.chunks.slice(1)]}};
    assert.throws(() => protocol.createPack({id: 'bad', name: '错位', version: '1', documents: [invalid]}), /分块范围/);
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});
