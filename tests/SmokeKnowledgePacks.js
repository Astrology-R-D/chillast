"use strict";
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const Manager = require('../src/core/ai/KnowledgePackManager');
const KnowledgeBase = require('../src/core/ai/KnowledgeBase');
const { createPack } = require('../src/shared/KnowledgePack.cjs');
const IpcRouter = require('../src/main/IpcRouter');
const AiSessionStore = require('../src/main/AiSessionStore');
const ProfileRepository = require('../src/main/ProfileRepository');
const ConfigManager = require('../src/core/config/ConfigManager');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-pack-ui-'));
app.setPath('userData', temporary);
let win;
async function execute(source) { return win.webContents.executeJavaScript(source); }
async function waitFor(source) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await execute(source)) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  console.error(await execute(`JSON.stringify({text:document.body.textContent?.slice(-6000),buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled})),html:document.body.innerHTML.length,url:location.href})`));
  throw new Error(`Timed out: ${source}`);
}
async function clickText(text) {
  const selector = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`;
  await waitFor(`Boolean(${selector})`); await execute(`${selector}.click()`);
}
async function screenshot(name) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const directory = path.join(root, 'tests/screenshots'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), (await win.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  const provider = { _settings: { embeddings: { provider: 'mock', model: 'offline-smoke' } }, embeddings: () => ({
    embedQuery: async () => [1, 0, 0, 0], embedDocuments: async (texts) => texts.map(() => [1, 0, 0, 0]),
  }) };
  const builtin = path.join(temporary, 'builtin'), index = path.join(temporary, 'legacy'); fs.mkdirSync(builtin);
  fs.writeFileSync(path.join(builtin, '四柱旧索引.md'), '# 四柱旧知识\n仅存旧索引的八字资料。');
  const legacy = new KnowledgeBase(provider); await legacy.initialize(builtin, path.join(temporary, 'user'), index);
  const original = fs.readFileSync(path.join(index, 'docstore.json'));
  const onProgress = (value) => win?.webContents.send('ai:initProgress', value);
  let manager = await new Manager({ root: path.join(temporary, 'packages'), modelProvider: provider, legacy, onProgress }).initialize();
  const packFile = path.join(temporary, 'book.kbpack');
  const writePack = (version) => fs.writeFileSync(packFile, createPack({ id: 'bazi-library', name: '八字知识库', version, description: '整理原文与来源报告', documents: [{
    id: 'Dbook-shishen', title: '十神原文', text: `# 十神\n版本 ${version} 的可核对原文。`, corpus: 'bazi', domain: 'shishen',
    provenance: { sourceName: '八字原书.pdf', lineBasis: 'prepared-text', originalPageMapping: 'unverified' },
  }] }));
  writePack('1.0.0');
  const sessions = new AiSessionStore(path.join(temporary, 'data')).init();
  const fakeAi = {
    status: () => ({ configured: false, provider: 'ollama', model: '', baseUrl: '', knowledgeDocCount: manager.listDocuments().length }),
    getInitStatus: () => null, getKnowledgeBase: () => manager, getKnowledgePacks: () => manager, refreshKnowledgeTools: async () => {},
    getCatalogProviders: () => [{ key: 'ollama', label: 'Ollama', needsKey: false, modelCount: 0 }], getCatalogModels: () => [],
    getToolRegistry: () => null, getMcpManager: () => null, setContext: () => {},
    contextUsage: () => ({ used: 0, limit: 40000, percent: 0, reserve: 4096, safety: 1024, estimated: true, needsCompression: false }),
  };
  const router = new IpcRouter({ ipcMain, aiService: fakeAi, aiSessionStore: sessions,
    profileRepository: new ProfileRepository(path.join(temporary, 'data')).init(),
    config: ConfigManager.load(), locale: JSON.parse(fs.readFileSync(path.join(root, 'locale/zh.json'))), chooseKnowledgePack: async () => packFile }).register();
  win = new BrowserWindow({ width: 1500, height: 980, show: false, webPreferences: {
    preload: path.join(root, 'src/preload/Preload.js'), sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false,
  } });
  router.setWebContents(win.webContents);
  const errors = [];
  win.webContents.on('console-message', (...args) => { const detail=args.at(-1); const level=typeof args[1]==='number'?args[1]:detail.level; const message=typeof args[2]==='string'?args[2]:detail.message; if ((level==='error'||level>=3) && !message.includes('ResizeObserver')) { errors.push(message); console.error('Renderer:',message); } });
  await win.loadFile(path.join(root, 'dist/renderer-react/index.html'));
  await clickText('设置'); await waitFor(`Boolean(document.getElementById('settings-knowledge-packs'))`);
  await execute(`document.getElementById('settings-knowledge-packs').scrollIntoView({block:'start'})`);
  await clickText('导入知识包'); await waitFor(`Boolean(document.querySelector('.knowledge-pack-preview'))`);
  assert.equal(manager.listPacks().packs.length, 0, 'preview cannot install');
  await screenshot('knowledge-pack-preview.png');
  await clickText('安装知识包'); await waitFor(`document.body.textContent.includes('知识包已安装')`);
  assert.equal(manager.listPacks().packs[0].active, false);
  await clickText('启用此版本'); await waitFor(`document.querySelector('.knowledge-pack-item')?.textContent.includes('已启用 v1.0.0')`);
  const pinned = manager.createSnapshot();
  writePack('2.0.0'); await clickText('导入知识包'); await waitFor(`document.querySelector('.knowledge-pack-preview')?.textContent.includes('v2.0.0')`);
  await clickText('安装知识包'); await waitFor(`document.querySelector('.knowledge-pack-item select')?.options.length===2`);
  const chooseVersion = async (version) => execute(`(()=>{const s=document.querySelector('.knowledge-pack-item select');s.value=${JSON.stringify(version)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await chooseVersion('2.0.0'); await clickText('切换版本'); await waitFor(`document.querySelector('.knowledge-pack-item')?.textContent.includes('已启用 v2.0.0')`);
  assert.equal((await pinned.retrieve('十神', 4, { corpus: 'bazi' })).find((d) => d.pack).pack.version, '1.0.0');
  assert.equal((await manager.retrieve('十神', 4, { corpus: 'bazi' })).find((d) => d.pack).pack.version, '2.0.0');
  await chooseVersion('1.0.0'); await clickText('切换版本'); await waitFor(`document.querySelector('.knowledge-pack-item')?.textContent.includes('已启用 v1.0.0')`);
  await execute(`document.getElementById('settings-knowledge-packs').closest('section').querySelector('input[type="checkbox"]').click()`);
  await waitFor(`!document.getElementById('settings-knowledge-packs').closest('section').querySelector('input[type="checkbox"]').checked`);
  assert.equal(manager.listPacks().builtinEnabled, false);
  manager = await new Manager({ root: manager.root, modelProvider: provider, legacy, onProgress }).initialize();
  assert.equal(manager.listPacks().packs.find((p) => p.active).version, '1.0.0');
  assert.equal(manager.listPacks().builtinEnabled, false);
  assert.deepEqual(fs.readFileSync(path.join(index, 'docstore.json')), original);
  assert.equal(await execute(`typeof require==='undefined'&&typeof process==='undefined'`), true);
  await screenshot('knowledge-pack-dark.png');
  await execute(`(()=>{const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='light'));s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await screenshot('knowledge-pack-light.png');
  win.setSize(1000, 820);
  await execute(`document.getElementById('settings-knowledge-packs').scrollIntoView({block:'start'})`);
  await screenshot('knowledge-pack-narrow.png');
  assert.equal(await execute(`document.querySelector('.settings-page').scrollWidth<=document.querySelector('.settings-page').clientWidth+1`), true);
  assert.deepEqual(errors, []);
  console.log('KNOWLEDGE_PACK_UI_PASS: native selection, reviewed install, real HNSW search, enable/update/rollback, pinned version, restart state, themes/narrow layout, legacy preservation.');
  win.destroy(); app.quit();
}).catch((error) => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); });
