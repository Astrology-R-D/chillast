import { Component, createContext, useContext, useState, type ComponentType, type ReactNode } from 'react';
import type { AiToolCall } from '../../../api/contracts';
import { MarkdownMessage } from '../MarkdownMessage';

export interface ToolViewContext { openProfile?(id: string): void }
export interface ToolViewProps { call: AiToolCall; data: unknown; context: ToolViewContext }
export interface ToolUserView {
  InputUserView?: ComponentType<ToolViewProps>;
  OutputUserView?: ComponentType<ToolViewProps>;
}
export const ToolViewsContext = createContext<ToolViewContext>({});

/** Local modules register components. Tool data can never supply executable UI code. */
export class ToolUserViewRegistry {
  private views = new Map<string, ToolUserView>();
  register(provider: string, tool: string, version: number, view: ToolUserView) { this.views.set(`${provider}/${tool}@${version}`, view); return this; }
  find(call: AiToolCall) { return this.views.get(`${call.artifact?.providerId || ''}/${call.tool}@${call.artifact?.version || 1}`); }
}
export const toolUserViews = new ToolUserViewRegistry();

export function parseToolData(text: string | undefined): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

const LABELS: Record<string, string> = { year: '出生年份', month: '出生月份', day: '出生日（几号）', hour: '小时', minute: '分钟', latitude: '纬度', longitude: '经度', name: '姓名', query: '查询词', targetYear: '目标年份', targetMonth: '目标月份', targetDay: '目标日（几号）', targetDate: '目标时刻（优先使用）', url: '网址' };
export function NestedValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [visible, setVisible] = useState(50);
  if (value === null || value === undefined) return <span>—</span>;
  if (typeof value !== 'object') return <span className="tool-value">{String(value)}</span>;
  if (depth >= 8) return <details><summary>嵌套数据</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
  const entries = Object.entries(value);
  return <table className="tool-fields"><tbody>{entries.slice(0, visible).map(([key, entry]) => <tr key={key}><th>{LABELS[key] || key}</th><td>{entry && typeof entry === 'object'
    ? <details><summary>{Array.isArray(entry) ? `${entry.length} 项` : `${Object.keys(entry).length} 个字段`}</summary><NestedValue value={entry} depth={depth + 1} /></details>
    : <NestedValue value={entry} depth={depth + 1} />}</td></tr>)}{entries.length > visible && <tr><td colSpan={2}><button type="button" onClick={() => setVisible((n) => n + 50)}>显示更多（剩余 {entries.length - visible} 项）</button></td></tr>}</tbody></table>;
}
export function InputUserView({ data }: ToolViewProps) {
  const input = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const birth = ['year', 'month', 'day'].every(key => Number.isInteger(input[key]))
    ? `${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}` : null;
  const time = ['hour', 'minute'].every(key => Number.isInteger(input[key]))
    ? ` ${String(input.hour).padStart(2, '0')}:${String(input.minute).padStart(2, '0')}` : '';
  return <>{birth && <p>出生日期与时间：{birth}{time}</p>}<NestedValue value={data} /></>;
}
export function OutputUserView({ data }: ToolViewProps) {
  return typeof data === 'string' ? <MarkdownMessage content={data} /> : <NestedValue value={data} />;
}

class ViewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function ToolView({ call, side }: { call: AiToolCall; side: 'input' | 'output' }) {
  const context = useContext(ToolViewsContext);
  const data = side === 'input' ? parseToolData(call.args || call.argsDigest) : call.artifact?.data ?? parseToolData(call.result || call.resultExcerpt);
  const props = { call, data, context };
  const fallback = side === 'input' ? <InputUserView {...props} /> : <OutputUserView {...props} />;
  // Unknown schema versions always use a safe generic view.
  const view = toolUserViews.find(call);
  const View = side === 'input' ? view?.InputUserView : view?.OutputUserView;
  return View ? <ViewBoundary key={`${call.callId}/${side}/${call.artifact?.version}`} fallback={fallback}><View {...props} /></ViewBoundary> : fallback;
}
