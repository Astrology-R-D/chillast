import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import locale from '../../../../locale/zh.json';
import type { AiToolCall, AnalysisReport } from '../../api/contracts';
import { ToolView, ToolUserViewRegistry } from './toolViews/ToolUserViewRegistry';
import './toolViews/registerToolViews';
import { MarkdownMessage } from './MarkdownMessage';

const call: AiToolCall = { callId: 'c1', tool: 'unknown', status: 'done', argsDigest: '', resultExcerpt: '', args: '{"query":"姓名","nested":{"items":[1,2]}}', result: '正常结果', requiresConfirmation: false };
test('registry resolves input and output independently and unknown versions fall back to nested fields', () => {
  const registry = new ToolUserViewRegistry().register('sample', 'unknown', 1, { InputUserView: () => <span>输入</span> });
  expect(registry.find({ ...call, artifact: { version: 1, providerId: 'sample', kind: 'generic', data: {} } })?.OutputUserView).toBeUndefined();
  expect(registry.find({ ...call, artifact: { version: 2, providerId: 'sample', kind: 'generic', data: {} } })).toBeUndefined();
  render(<ToolView call={call} side="input" />);
  expect(screen.getByText('查询词')).toBeInTheDocument();
  expect(screen.getByText('nested')).toBeInTheDocument();
  expect(screen.getByText('2 项')).toBeInTheDocument();
});
test('knowledge tools show source snapshots, while unavailable modules keep readable results', () => {
  const source = { id: 'S1', documentId: 'd', version: 'v1', title: '书籍片段', source: 'builtin', content: '保留的原始引文' };
  render(<ToolView call={{ ...call, tool: 'search_knowledge', artifact: { providerId: 'kb', version: 1, kind: 'knowledge', data: {}, sources: [source] } }} side="output" />);
  expect(screen.getByText('书籍片段')).toBeInTheDocument();
  expect(screen.getByText('保留的原始引文')).toBeInTheDocument();
});
test('web tools show the fallback provider with source snapshots and preserve readable failure output', () => {
  const source = { id: 'SW1', documentId: 'web:https://news.example', version: 'v1', title: '新闻来源', source: 'web', url: 'https://news.example', content: '原始检索摘要' };
  const { unmount } = render(<ToolView call={{ ...call, tool: 'web_search', artifact: { providerId: 'web', version: 1, kind: 'web', data: [], sources: [source], search: { provider: 'duckduckgo', requestedProvider: 'bing', fallback: true, attempts: [] } } }} side="output" />);
  expect(screen.getByText(/已改用 DuckDuckGo/)).toBeInTheDocument();
  expect(screen.getByText('原始检索摘要')).toBeInTheDocument();
  unmount();
  render(<ToolView call={{ ...call, tool: 'web_search', status: 'error', artifact: { providerId: 'web', version: 1, kind: 'web', data: '联网搜索失败：请求超时', sources: [] } }} side="output" />);
  expect(screen.getByText('联网搜索失败：请求超时')).toBeInTheDocument();
});
test('inline evidence expands exact facts and source quotes; invented IDs never become verified cards', () => {
  const report: AnalysisReport = { version: 1, contextKey: 'ctx', focus: '问题', questions: [], sources: [{ id: 'S1', documentId: 'd', version: 'v1', title: '原书', source: 'builtin', content: '原文保持原样' }], claims: [{ id: 'E1', statement: '解释需要核实', facts: [{ callId: 'c', key: 'sun', text: '精确盘面事实' }], sourceIds: ['S1'], limitations: '存在不确定性', question: '是否符合你的经历？' }] };
  render(<I18nProvider dictionary={locale}><MarkdownMessage content="自然交流。[判据](evidence:E1) [假引用](evidence:E99)" report={report} /></I18nProvider>);
  expect(screen.queryByText('原文保持原样')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '判据 1' }));
  expect(screen.getByText('原文保持原样')).toBeInTheDocument();
  expect(screen.getByText('精确盘面事实')).toBeInTheDocument();
  expect(screen.getByText('存在不确定性')).toBeInTheDocument();
  expect(screen.getByText('判据未通过校验')).toBeInTheDocument();
});

test('historical package evidence displays the saved package version, prepared lines and original filename', () => {
  const report: AnalysisReport = { version: 1, contextKey: 'ctx', focus: '问题', questions: [], sources: [{
    id: 'S1', documentId: 'pack:bazi:doc', version: 'saved-content-hash', title: '八字原书 · 十神', source: 'pack', content: '生成时保存的原文', corpus: 'bazi',
    pack: { id: 'bazi', name: '八字知识库', version: '1.0.0', fingerprint: 'old-fingerprint' },
    location: { lines: { from: 3, to: 7 }, basis: 'prepared-text', originalPageMapping: 'unverified' }, provenance: { sourceName: '八字原书.pdf' },
  }], claims: [{ id: 'E1', statement: '可核对的解释', facts: [], sourceIds: ['S1'], limitations: '', question: '' }] };
  render(<I18nProvider dictionary={locale}><MarkdownMessage content="回应。[判据](evidence:E1)" report={report} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '判据 1' }));
  expect(screen.getByText(/八字知识库 · v1.0.0/)).toBeInTheDocument();
  expect(screen.getByText(/整理文本第 3–7 行/)).toBeInTheDocument();
  expect(screen.getByText(/原始文件：八字原书.pdf/)).toBeInTheDocument();
  expect(screen.getByText('生成时保存的原文')).toBeInTheDocument();
});
