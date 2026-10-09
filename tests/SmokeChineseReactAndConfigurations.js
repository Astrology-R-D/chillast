'use strict';
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const IpcRouter = require('../src/main/IpcRouter');
const ProfileRepository = require('../src/main/ProfileRepository');
const AiSessionStore = require('../src/main/AiSessionStore');
const AiConfigurationStore = require('../src/main/AiConfigurationStore');
const ChineseAstrologyService = require('../src/core/chinese/ChineseAstrologyService');
const ConfigManager = require('../src/core/config/ConfigManager');
const fixture = require('./fixtures/chinese-ui-results.json');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-chinese-react-'));
app.setPath('userData', temporary);
let win;
async function execute(source) {
  try { return await win.webContents.executeJavaScript(source); }
  catch (error) { console.error('Renderer script failed:', source); throw error; }
}
async function waitFor(source, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await execute(source)) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  console.error(await execute('document.body.innerText'));
  await screenshot('migration-smoke-failure.png');
  throw new Error(`Timed out: ${source}`);
}
async function clickText(text) {
  await waitFor(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled))`);
  await execute(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled).click()`);
}
async function input(id, value) {
  await execute(`(()=>{const el=document.getElementById(${JSON.stringify(id)}); const setter=Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set; setter.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
}
async function screenshot(name) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  fs.mkdirSync(path.join(root, 'tests/screenshots'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests/screenshots', name), (await win.webContents.capturePage()).toPNG());
}

app.whenReady().then(async () => {
  const baseDir = path.join(temporary, 'data');
  const profiles = new ProfileRepository(baseDir).init(); profiles.save(fixture.profile);
  const sessions = new AiSessionStore(baseDir).init();
  const store = new AiConfigurationStore(baseDir, { safeStorage }).init();
  store.migrateLegacy({ provider: 'ollama', model: 'local-a', maxTokens: 0, contextWindow: 40000 });
  let active = store.getActive(); let context = null;
  const fakeAi = {
    configure: async (settings) => { active = { settings, apiKey: settings.apiKey }; return { accepted: true }; },
    status: () => ({ configured: true, ...active.settings, apiKey: undefined, knowledgeDocCount: 0 }),
    getInitStatus: () => null, setContext: (value) => { context = value; },
    getCatalogProviders: () => [{ key: 'ollama', label: 'Ollama (本地)', needsKey: false, modelCount: 0, catalogId: null }],
    getCatalogModels: () => [], getToolRegistry: () => null, getMcpManager: () => null,
    testWithSettings: async () => ({ ok: true }),
    contextUsage: () => ({ used: 100, limit: 40000, percent: .25, reserve: 4096, safety: 1024, estimated: true, needsCompression: false }),
    async *chat() { yield { type: 'token', data: '已收到当前八字命盘。' }; },
    generateSessionTitle: async () => '命理分析',
  };
  const router = new IpcRouter({ ipcMain, profileRepository: profiles, chineseAstrologyService: new ChineseAstrologyService(), aiSessionStore: sessions, aiConfigurationStore: store, aiService: fakeAi, config: ConfigManager.load(), locale: JSON.parse(fs.readFileSync(path.join(root, 'locale/zh.json'), 'utf8')) }).register();
  win = new BrowserWindow({ width: 1540, height: 1020, show: false, webPreferences: { preload: path.join(root, 'src/preload/Preload.js'), sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  router.setWebContents(win.webContents);
  const errors = [];
  win.webContents.on('console-message', (event) => { if (event.level === 'error' && !event.message.includes('ResizeObserver')) { errors.push(event.message); console.error(event.message); } });
  await win.loadFile(path.join(root, 'dist/renderer-react/index.html'));
  await clickText('命理分析'); await clickText('✶ 排盘');
  await waitFor(`document.body.textContent.includes('10:09:26')&&document.querySelectorAll('.bazi-pillar').length===4`);
  assert.equal(context.kind, 'chinese-chart'); assert.equal(context.lastBaziData.bazi.pillars.hour.full, '乙巳');
  assert.equal(await execute(`document.querySelectorAll('tr[data-current]').length`), 1);
  await execute(`(()=>{const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='light'));s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await screenshot('migration-chinese-light.png');
  win.setSize(1050, 850);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await execute(`document.querySelector('.chinese-page').scrollWidth<=document.querySelector('.chinese-page').clientWidth+1`), true);
  await execute(`(()=>{const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='dark'));s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await screenshot('migration-chinese-dark.png');
  await clickText('AI 解读');
  await waitFor(`document.body.textContent.includes('已收到当前八字命盘。')`);
  assert.equal(context.lastBaziData.bazi.pillars.hour.full, '乙巳');
  await clickText('节气年历');
  await waitFor(`document.querySelectorAll('.solar-term').length===24`);
  await input('solar-term-search', 'lichun');
  await waitFor(`document.querySelectorAll('.solar-term').length===1&&document.querySelector('.solar-term').textContent.includes('立春')`);
  await input('solar-term-search', '');
  await input('solar-term-month', '10');
  await waitFor(`document.querySelectorAll('.solar-term').length===2`);
  await input('solar-term-month', '0');
  win.setSize(1540, 1020); await screenshot('migration-solar-calendar.png');
  await clickText('设置');
  await waitFor(`document.getElementById('settings-configuration-name')?.value==='当前配置'`);
  await input('settings-saved-configuration', '');
  await input('settings-configuration-name', '本地研究');
  await input('settings-model', 'local-b');
  await input('settings-base-url', 'http://localhost:11434');
  await clickText('保存配置');
  await waitFor(`document.body.textContent.includes('配置已保存')`);
  assert.equal(store.list().configurations.length, 2);
  assert.equal(store.getActive().name, '本地研究');
  const first = store.list().configurations.find((c) => c.name === '当前配置');
  await input('settings-saved-configuration', first.id);
  await waitFor(`document.getElementById('settings-model')?.value==='local-a'`);
  assert.equal(active.settings.model, 'local-a');
  assert.equal(new AiConfigurationStore(baseDir, { safeStorage }).init().getActive().id, first.id);
  await execute(`(()=>{const section=document.getElementById('settings-ai-config').closest('section');section.querySelector('.settings-configuration-list').open=true;section.scrollIntoView({block:'start'});})()`);
  await screenshot('migration-named-ai-configurations.png');
  assert.deepEqual(errors, []);
  console.log('Chinese/calendar/configuration smoke passed: real Chinese calculation, AI context, narrow layout, themes, 24 terms, fuzzy filters, named save/switch, and restart persistence.');
  win.destroy(); app.quit();
}).catch((error) => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); });
