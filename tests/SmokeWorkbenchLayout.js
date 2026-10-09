'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runElectronSmokeController } = require('./ElectronSmokeController');
runElectronSmokeController('chillast-workbench-layout-', app);
app.disableHardwareAcceleration();
app.setPath('userData', process.env.CHILLAST_SMOKE_USER_DATA);
const root = path.resolve(__dirname, '..');
const IpcRouter = require('../src/main/IpcRouter');
const ProfileRepository = require('../src/main/ProfileRepository');
const AiSessionStore = require('../src/main/AiSessionStore');
const AstrologyService = require('../src/core/astrology/AstrologyService');
const ChartStrategyFactory = require('../src/core/astrology/ChartStrategyFactory');
const ConfigManager = require('../src/core/config/ConfigManager');
const { profileA } = require('./ChartWorkbenchSmokeFixtures');
const { chartToolResult, sourceSnapshot } = require('../src/core/ai/ToolResult');
const { prefixHash } = require('../src/core/ai/ContextManager');
async function poll(win, script) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(script)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Readiness timed out: ${script}`);
}
app.whenReady().then(async () => {
  const data = path.join(app.getPath('userData'), 'data');
  const profiles = new ProfileRepository(data).init(); profiles.save(profileA);
  const sessions = new AiSessionStore(data).init(); const session = sessions.create();
  const astrology = new AstrologyService(new ChartStrategyFactory({backend:'horoscope'}));
  const toolChart = astrology.computeChart({type:'transit',primary:profileA,options:{targetDate:'2026-10-09T12:00:00Z'}});
  const source = sourceSnapshot({fileName:'烟测知识库.md',source:'builtin',content:'这是一段被保存的完整知识库原文，压缩后仍能展开查看。'});
  const report = {version:1,contextKey:'smoke',focus:'验证判据',questions:[],sources:[source],claims:[{id:'E1',statement:'结合实际经历核实解释',facts:[{callId:'chart',key:'natal:sun',text:'计算得到的盘面事实'}],sourceIds:[source.id],limitations:'需要用户实际经历核实',question:'这是否符合你的经历？'}]};
  sessions.appendMessage(session.id, { role:'user', content:'请分析星盘' });
  sessions.appendMessage(session.id, { role:'ai', content: Array.from({length:80}, (_,i)=>`### 第 ${i+1} 段\n\n长对话布局验证：消息区域独立滚动，会话选择和输入框保持稳定。`).join('\n\n'), toolCalls:[{callId:'a',tool:'compute_natal_chart',status:'done',argsDigest:'摘要',args:'{"profile":"星盘烟测甲"}',resultExcerpt:'摘要',result:'完整工具结果'.repeat(100),requiresConfirmation:false,durationMs:12}] });
  sessions.appendMessage(session.id,{role:'user',content:'请核对行运盘与来源'});
  sessions.appendMessage(session.id,{role:'ai',content:'先从你最近的经历说起。[判据 1](evidence:E1)',analysisReport:report,toolCalls:[
    {callId:'chart',tool:'compute_transit',status:'done',argsDigest:'目标日期',resultExcerpt:'盘面',requiresConfirmation:false,artifact:{...chartToolResult(toolChart,'盘面').artifact,providerId:'astro'},result:'盘面'},
    {callId:'kb',tool:'search_knowledge',status:'done',argsDigest:'查询',resultExcerpt:'原文',requiresConfirmation:false,artifact:{version:1,kind:'knowledge',providerId:'kb',data:{query:'行运'},sources:[source]},result:source.content},
  ]});
  const win = new BrowserWindow({show:false,width:1440,height:920,webPreferences:{preload:path.join(root,'src/preload/Preload.js'),contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}});
  const execute = win.webContents.executeJavaScript.bind(win.webContents);
  win.webContents.executeJavaScript = async (source, ...args) => {
    try { return await execute(source, ...args); }
    catch (error) { console.error('Renderer script failed:', source); throw error; }
  };
  const errors=[];
  win.webContents.on('console-message',(event)=>{if(event.level==='error' && !event.message.startsWith('ResizeObserver loop')){errors.push(event.message);console.error('Renderer error:',event.message);}});
  const router = new IpcRouter({ipcMain,profileRepository:profiles,aiSessionStore:sessions,
    astrologyService:astrology,
    config:ConfigManager.load(),locale:JSON.parse(fs.readFileSync(path.join(root,'locale/zh.json'),'utf8')),
    aiService:{status:()=>({configured:true,provider:'DeepSeek',model:'layout-test',baseUrl:'',knowledgeDocCount:0}),setContext:()=>{},
      contextUsage:(s)=>({used:s.contextSummary?3000:7600,limit:10000,percent:s.contextSummary?30:76,reserve:1000,safety:1024,estimated:true,needsCompression:false,compressedMessages:s.contextSummary?.coveredMessages||0}),
      compressSession:async(s)=>{await new Promise(resolve=>setTimeout(resolve,150));return {text:'用户当前关注星盘解读；保留判据与原文引用。',coveredMessages:2,prefixHash:prefixHash(s.messages,2),createdAt:new Date().toISOString()};},
      async *chat(){
        yield {type:'stage',data:'analysis'};yield {type:'activity',data:{phase:'analysis',topic:'火星与土星的相位问题'}};
        await new Promise(resolve=>setTimeout(resolve,1000));
        yield {type:'stage',data:'validation'};yield {type:'activity',data:{phase:'validation'}};
        await new Promise(resolve=>setTimeout(resolve,100));
        yield {type:'stage',data:'answer'};yield {type:'activity',data:{phase:'answer'}};
        for(let i=0;i<700;i++){await new Promise(resolve=>setTimeout(resolve,5));yield {type:'token',data:`\n\n### 流式段落 ${i}\n\n生成中的长回复也应独立滚动。${'这是布局与交互验证。'.repeat(8)}`};}
      }
    }});
  router.setWebContents(win.webContents);router.register();
  if(process.env.CHILLAST_SMOKE_RENDERER_URL) await win.loadURL(process.env.CHILLAST_SMOKE_RENDERER_URL);
  else await win.loadFile(path.join(root,'dist/renderer-react/index.html'));
  await poll(win,'Boolean(document.querySelector(".message-item--ai"))');
  await win.webContents.executeJavaScript('document.querySelectorAll(".shell-nav__button")[1].click()');
  await poll(win,'Boolean(document.querySelector("[data-control=primaryProfile] select"))');
  await win.webContents.executeJavaScript(`(()=>{const select=document.querySelector('[data-control=primaryProfile] select');select.value='${profileA.id}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.chart-filter-band button')).find(b=>b.textContent==='计算').click()`);
  await poll(win,'Boolean(document.querySelector(".interactive-chart__svg svg"))');
  const directory=path.join(root,'tests/screenshots');fs.mkdirSync(directory,{recursive:true});
  for (const [width,height] of [[1440,920],[1280,800],[1100,720]]) {
    win.setContentSize(width,height);
    await new Promise((resolve)=>setTimeout(resolve,250));
    if(width<1200)await win.webContents.executeJavaScript(`document.querySelector('.shell__main-toolbar button').click()`);
    const metrics=await win.webContents.executeJavaScript(`(()=>{
      const ai=document.querySelector('.ai-workspace');const scroll=document.querySelector('.message-list__scroller');const input=document.querySelector('.composer__input');const host=document.querySelector('.interactive-chart__svg');
      return {height:innerHeight,aiHeight:ai.getBoundingClientRect().height,scrollHeight:scroll.scrollHeight,scrollClient:scroll.clientHeight,inputBottom:input.getBoundingClientRect().bottom,hostWidth:host.clientWidth,hostHeight:host.clientHeight,hasGlyph:Boolean(document.querySelector('.chart-value__glyph'))};
    })()`);
    console.log(width,JSON.stringify(metrics));
    assert.ok(metrics.aiHeight<=metrics.height+1);assert.ok(metrics.scrollHeight>metrics.scrollClient);assert.ok(metrics.scrollClient>100);assert.ok(metrics.inputBottom<=metrics.height+1);assert.ok(metrics.hostWidth>200&&metrics.hostHeight>100);assert.ok(metrics.hasGlyph);
    // A centered zoom stays centered even in a rectangular SVG viewport.
    assert.ok(await win.webContents.executeJavaScript(`(()=>{
      document.querySelector('.chart-toolbar__button').click();
      return true;
    })()`));
    await new Promise((resolve)=>setTimeout(resolve,50));
    assert.ok(await win.webContents.executeJavaScript(`(()=>{
      const svg=document.querySelector('.interactive-chart__svg svg');
      const transform=svg.querySelector('[data-chart-transform]').getScreenCTM();
      const center=new DOMPoint(370,370).matrixTransform(transform);
      const rect=svg.getBoundingClientRect();
      return Math.abs(center.x-rect.left-rect.width/2)<1 && Math.abs(center.y-rect.top-rect.height/2)<1;
    })()`));
    await win.webContents.executeJavaScript(`document.querySelector('.ai-workspace__history').click()`);
    await poll(win,'Boolean(document.querySelector(".session-drawer"))');
    assert.ok(await win.webContents.executeJavaScript('document.querySelector(".session-rail__top").getBoundingClientRect().top < 100'));
    await win.webContents.executeJavaScript(`document.querySelector('.session-drawer__header button').click()`);
    // Expanding persisted full results must not stretch the AI workspace.
    await win.webContents.executeJavaScript(`document.querySelector('.tool-activity').open=true;document.querySelector('.tool-card').open=true`);
    await poll(win,'Boolean(document.querySelector(".tool-card__details"))');
    assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.tool-card__details').textContent.includes('完整工具结果'.repeat(100))`));
    assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.composer__input').getBoundingClientRect().bottom <= innerHeight+1`));
    await win.webContents.executeJavaScript(`document.querySelector('.tool-activity').open=false`);
    const image=await win.webContents.capturePage();fs.writeFileSync(path.join(directory,`workbench-layout-${width}.png`),image.toPNG());
    if(width<1200)await win.webContents.executeJavaScript(`document.querySelector('.shell__ai-toolbar button').click()`);
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.chart-result__actions button')).find(b=>b.textContent.includes('专注星盘')).click()`);
    await poll(win,'document.querySelector(".interactive-chart__svg").clientHeight > innerHeight * .65');
    assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.chart-result--focused').getBoundingClientRect().width >= innerWidth-25`));
    await new Promise((resolve)=>setTimeout(resolve,150));
    if(width===1440){
      await win.webContents.executeJavaScript(`document.querySelectorAll('.chart-toolbar__button')[4].click()`);
      await new Promise((resolve)=>setTimeout(resolve,100));
      const focusImage=await win.webContents.capturePage();fs.writeFileSync(path.join(directory,'workbench-focus.png'),focusImage.toPNG());
    }
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.chart-result__actions button')).find(b=>b.textContent.includes('返回工作台')).click()`);
  }
  win.setContentSize(1440,920);
  await poll(win,'Boolean(document.querySelector(".shell--desktop"))');
  await poll(win,'document.querySelector(".context-usage__row").textContent.includes("76%")');
  await win.webContents.executeJavaScript(`document.querySelector('.context-usage__row button').click()`);
  await poll(win,'document.querySelector(".context-usage__row").textContent.includes("30%")');
  assert.equal(sessions.get(session.id).messages.length,4,'compression must not delete history');
  assert.equal(sessions.get(session.id).messages[3].analysisReport.sources[0].content,source.content);
  await win.webContents.executeJavaScript(`document.querySelector('.evidence-chip button').click()`);
  assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.evidence-card').textContent.includes('完整知识库原文')`));
  await win.webContents.executeJavaScript(`document.querySelector('[data-tool="compute_transit"]').closest('.tool-activity').open=true;document.querySelector('[data-tool="compute_transit"]').open=true`);
  await poll(win,'Boolean(document.querySelector(".tool-chart__canvas svg"))');
  const mainTransform = await win.webContents.executeJavaScript(`document.querySelector('.chart-result [data-chart-transform]').getAttribute('transform')`);
  await win.webContents.executeJavaScript(`document.querySelector('.tool-chart .chart-toolbar__button').click()`);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.chart-result [data-chart-transform]').getAttribute('transform')`),mainTransform,'preview zoom must not alter the main canvas');
  await win.webContents.executeJavaScript(`document.querySelector('.tool-chart').scrollIntoView({block:'center'})`);
  await new Promise(resolve=>setTimeout(resolve,150));
  fs.writeFileSync(path.join(root,'tests/screenshots/ai-tool-experience.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.tool-chart button')).find(b=>b.textContent.includes('展开星盘')).click()`);
  await poll(win,'Boolean(document.querySelector(".tool-chart-dialog svg"))');
  assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.tool-chart-dialog').getBoundingClientRect().width > 1000`));
  await new Promise(resolve=>setTimeout(resolve,150));
  fs.writeFileSync(path.join(root,'tests/screenshots/ai-tool-chart-workspace.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.tool-chart-dialog header button').click()`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-tool="compute_transit"]').open=false`);
  // Reproduce the user's sequence while replies are still arriving.
  win.setContentSize(960,720);
  await poll(win,'Boolean(document.querySelector(".shell--narrow"))');
  await win.webContents.executeJavaScript(`document.querySelector('.shell__main-toolbar button').click()`);
  await win.webContents.executeJavaScript(`(()=>{
    const input=document.querySelector('.composer__input');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'开始流式布局测试');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await poll(win,'!document.querySelector(".composer__send").disabled');
  await win.webContents.executeJavaScript(`document.querySelector('.composer__send').click()`);
  await poll(win,'Boolean(document.querySelector(".composer__stop"))');
  await poll(win,'document.querySelector(".ai-activity")?.dataset.phase === "analysis"');
  assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.ai-activity').textContent.includes('火星与土星') && !document.querySelector('.message-list__stream .markdown-message')`),'status must be visible before the first answer token');
  await new Promise(resolve=>setTimeout(resolve,350));
  win.setContentSize(1920,1080);
  await poll(win,'Boolean(document.querySelector(".shell--desktop")) && !document.querySelector(".shell__main").inert');
  assert.ok(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.composer__stop'))`),'reply must still be active during interaction');
  assert.ok(await win.webContents.executeJavaScript(`(()=>{
    const [theme,density]=document.querySelectorAll('.workspace__appearance select');
    theme.focus(); if(document.activeElement!==theme)return false;
    theme.value='light';theme.dispatchEvent(new Event('change',{bubbles:true}));
    density.focus();if(document.activeElement!==density)return false;
    density.value='comfortable';density.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`),'desktop preferences must accept focus while streaming');
  await poll(win,'document.documentElement.dataset.theme === "light" && document.documentElement.dataset.density === "comfortable"');
  await new Promise(resolve=>setTimeout(resolve,150));
  if(await win.webContents.executeJavaScript(`document.querySelector('.ai-activity')?.dataset.phase === 'analysis'`))fs.writeFileSync(path.join(directory,'ai-visible-activity.png'),(await win.webContents.capturePage()).toPNG());
  await poll(win,'Boolean(document.querySelector(".message-list__stream .message-item--ai"))');
  assert.ok(await win.webContents.executeJavaScript(`(()=>{
    const stream=document.querySelector('.message-list__stream');const body=stream.querySelector('.message-item--ai');
    return body.getBoundingClientRect().bottom <= stream.getBoundingClientRect().bottom+1 && document.querySelector('.composer__input').getBoundingClientRect().bottom <= innerHeight+1;
  })()`),'live message wrapper must contain its growing content');
  await poll(win,'!document.querySelector(".composer__stop")');
  // Contrast and inline chip sizing must survive manual theme changes, independently of the OS.
  for(const theme of ['light','dark']){
    await win.webContents.executeJavaScript(`(()=>{const select=document.querySelector('.workspace__appearance select');select.value='${theme}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await poll(win,`document.documentElement.dataset.theme === '${theme}'`);
    const readingMetrics=await win.webContents.executeJavaScript(`(()=>{
      const button=document.querySelector('.evidence-chip button');const paragraph=button.closest('p');const message=paragraph.closest('.message-item__body');const style=getComputedStyle(message);
      const lum=(css)=>{const rgb=css.match(/[\\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      const a=lum(style.color),b=lum(style.backgroundColor);return {contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),chipHeight:button.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(paragraph).lineHeight)};
    })()`);
    assert.ok(readingMetrics.contrast>=4.5,JSON.stringify(readingMetrics));
    assert.ok(readingMetrics.chipHeight<readingMetrics.lineHeight,'evidence chip must not stretch text lines');
    await win.webContents.executeJavaScript(`document.querySelector('.evidence-chip').scrollIntoView({block:'center'})`);
    await new Promise(resolve=>setTimeout(resolve,150));
    fs.writeFileSync(path.join(directory,`ai-reading-${theme}.png`),(await win.webContents.capturePage()).toPNG());
  }
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.shell-nav__button')).find(b=>b.textContent.includes('设置')).click()`);
  await poll(win,'Boolean(document.querySelector("#settings-reading-fontSize"))');
  await win.webContents.executeJavaScript(`(()=>{
    for(const [key,value] of [['fontSize','20'],['lineHeight','2.1']]){const input=document.getElementById('settings-reading-'+key);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    const font=document.getElementById('settings-reading-font');font.value='serif';font.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await poll(win,'document.documentElement.style.getPropertyValue("--ai-font-size") === "20px"');
  assert.ok(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.reading-preview .markdown-message')).fontFamily.includes('SimSun') && JSON.parse(localStorage.getItem('chillast.aiReading')).lineHeight===2.1`));
  assert.ok(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.reading-preview .evidence-chip button')).minHeight === '0px' && getComputedStyle(document.querySelector('.reading-preview .evidence-chip button')).borderRadius === '999px'`),'preview evidence must use the actual inline chip style');
  await win.webContents.executeJavaScript(`document.querySelector('.reading-preview').scrollIntoView({block:'center'})`);
  await new Promise(resolve=>setTimeout(resolve,150));
  fs.writeFileSync(path.join(directory,'ai-reading-settings.png'),(await win.webContents.capturePage()).toPNG());
  win.webContents.reload();
  await poll(win,'Boolean(document.querySelector(".message-item--ai"))');
  assert.ok(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.message-item--ai .markdown-message')).fontSize==='20px' && getComputedStyle(document.querySelector('.message-item--ai .markdown-message')).lineHeight==='42px'`),'reading preferences must survive renderer restart');
  assert.deepEqual(errors,[]);
  console.log('Workbench smoke passed: activity before output, light/dark contrast, inline evidence, persistent typography, tool charts, compression, and live resize.');
  win.destroy();app.exit(0);
}).catch((error)=>{console.error(error);app.exit(1);});
