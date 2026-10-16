'use strict';

// Opt-in live evaluation. Sends only synthetic scenarios to the saved endpoint,
// never real profiles/conversations; credentials stay in the Electron process.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const AiService = require('../src/core/ai/AiService');
const AiConfigurationStore = require('../src/main/AiConfigurationStore');
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');

const cases = [
  { id: 'relationship', question: '这是虚构测试场景：争吵之后女友三天没回消息，之前她说每次聊天都会变成争论。我很难受，但想修复关系，也不想一直追着问。她可能最近怎么想？帮我分析，不用占星。' },
  { id: 'self-doubt', question: '这是虚构测试场景：这周两份方案被主管退回，原因是我没提前确认需求。我开始觉得自己什么都做不好，明天又要开会，很想躲掉。请帮我梳理分析，我不需要泛泛的鼓励，也不用算星盘。' },
  { id: 'career-choice', question: '这是虚构测试场景：我现在工作稳定但缺少成长。新工作收入高20%，不过每周可能多加班两晚。我需要照顾家人，也希望两年内转管理岗，目前有六个月存款。请分析我怎么权衡，并给出倾向建议，不用占星。' },
  { id: 'correction', history: [{ role: 'user', content: '我和伴侣最近沟通很难，想分析怎么处理。' }, { role: 'ai', content: '你可能在躲避沟通。' }], question: '这是虚构测试场景的补充：我没有逃避，我主动约了两次沟通，都是对方拒绝。你前面的判断不对。我想继续谈，但不愿再单方面争取，帮我重新分析。' },
  { id: 'missing-birth-time', question: '这是虚构测试场景：出生时间不详，我也没有可以确认的日期资料。我最近被分手，反复怀疑是不是自己不够好。先不推断对方或计算星盘，帮我分析怎样整理这些想法。' },
];

app.whenReady().then(async () => {
  if (!process.argv.includes('--saved-config')) throw Object.assign(new Error(), { code: 'USE_SAVED_CONFIG_FLAG' });
  const base = path.join(app.getPath('appData'), 'chillast', 'data');
  const store = new AiConfigurationStore(base, { safeStorage }).init();
  if (store.error) throw Object.assign(new Error(), { code: 'SAVED_CONFIG_UNREADABLE' });
  const entry = store.getActive();
  if (!entry?.apiKey && entry?.settings.provider !== 'ollama') throw Object.assign(new Error(), { code: 'NO_ACTIVE_CREDENTIAL' });
  const output = path.resolve('release', 'dialogue-eval.json');
  const selected = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
  if (selected && !cases.some(item => item.id === selected)) throw Object.assign(new Error(), { code: 'UNKNOWN_CASE' });
  const results = [];
  const persist = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ model: entry.settings.model, at: new Date().toISOString(), syntheticOnly: true, results }, null, 2)); };
  for (const item of cases.filter(item => !selected || item.id === selected)) {
    const service = new AiService({}, {});
    await service._mp.configure({ ...entry.settings, apiKey: entry.apiKey, maxTokens: 8192, embeddings: { provider: 'none' } });
    service._configured = true; service._registry = new ToolRegistry();
    const started = Date.now(), events = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; service.stop(item.id); }, 120000);
    try {
      for await (const event of service.chat([...(item.history || []), { role: 'user', content: item.question }], { sessionId: item.id })) events.push(event);
      const report = events.find(event => event.type === 'analysis-report')?.data;
      const text = events.filter(event => event.type === 'token').map(event => event.data).join('');
      const finished = !timedOut && Boolean(text.trim()) && events.some(event => event.type === 'done');
      results.push({ id: item.id, question: item.question, finished, timedOut, report, text, durationMs: Date.now() - started,
        truncated: events.some(event => event.type === 'truncated'), repair: events.some(event => event.data?.repair) });
      console.log(JSON.stringify({ case: item.id, finished, characters: text.length, readiness: report?.readiness.status, kinds: report?.claims.map(claim => claim.kind), durationMs: Date.now() - started }));
    } catch (error) {
      // Do not dump SDK request objects or credential-bearing errors.
      results.push({ id: item.id, finished: false, error: error.name, status: error.status || null });
      console.log(JSON.stringify({ case: item.id, finished: false, error: error.name, status: error.status || null }));
    } finally { clearTimeout(timer); await service.close(); persist(); }
  }
  fs.writeSync(1, 'Evaluation saved: ' + output + '\n');
  app.exit(results.every(result => result.finished && !result.truncated) ? 0 : 1);
}).catch(error => { fs.writeSync(2, 'Live evaluation could not run: ' + (error.code || error.name) + '\n'); app.exit(1); });
