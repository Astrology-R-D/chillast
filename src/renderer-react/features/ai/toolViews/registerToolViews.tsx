import { lazy, Suspense } from 'react';
import type { Profile } from '../../../api/contracts';
import { SourceCard } from '../SourceCard';
import { NestedValue, toolUserViews, type ToolViewProps } from './ToolUserViewRegistry';

const ChartUserView = lazy(() => import('./ChartUserView').then((m) => ({ default: m.ChartUserView })));
function ChartView(props: ToolViewProps) { return <Suspense fallback={<p>正在加载星盘…</p>}><ChartUserView {...props} /></Suspense>; }
function ProfilesView({ data, context }: ToolViewProps) {
  if (!Array.isArray(data)) throw new Error('档案数据格式无效');
  return <div className="tool-profiles">{data.map((value) => {
    const p = value as Partial<Profile>;
    if (!p || typeof p.id !== 'string') throw new Error('档案缺少 ID');
    const birth = p.birthData;
    return <article key={p.id}><strong>{p.nameZh || p.nameEn || p.id}</strong>
      {birth && <p>{birth.year}-{birth.month}-{birth.day} {birth.hour}:{String(birth.minute).padStart(2, '0')} · {birth.location?.label}</p>}
      {context.openProfile && <button type="button" onClick={() => context.openProfile?.(p.id!)}>用此档案查看星盘</button>}
    </article>;
  })}</div>;
}
function SourcesView({ call, data }: ToolViewProps) {
  return <div className="tool-sources">{call.artifact?.sources?.length ? call.artifact.sources.map((source) => <SourceCard key={source.id} source={source} />) : <NestedValue value={data} />}</div>;
}
function BirthInputView({ data }: ToolViewProps) {
  const input = data as Record<string, unknown>;
  if (!input || typeof input !== 'object') return <NestedValue value={data} />;
  return <div className="tool-birth"><NestedValue value={input} /></div>;
}
function BaziView({ data }: ToolViewProps) {
  const value = data as { bazi?: { pillars?: Record<string, { full: string }>; dayMaster?: { char?: string; element?: string } } };
  const pillars = value?.bazi?.pillars;
  if (!pillars) throw new Error('八字数据格式无效');
  return <div><div className="tool-bazi-pillars">{[['year', '年柱'], ['month', '月柱'], ['day', '日柱'], ['hour', '时柱']].map(([key, label]) => <div key={key}><small>{label}</small><strong>{pillars[key]?.full || '—'}</strong></div>)}</div><p>日主：{value.bazi?.dayMaster?.char} · {value.bazi?.dayMaster?.element}</p><details><summary>详细数据</summary><NestedValue value={data} /></details></div>;
}
for (const name of ['compute_natal_chart', 'compute_transit', 'compute_synastry', 'compute_solar_return', 'compute_progressed']) toolUserViews.register('astro', name, 1, { InputUserView: BirthInputView, OutputUserView: ChartView });
toolUserViews.register('astro', 'compute_bazi', 1, { InputUserView: BirthInputView, OutputUserView: BaziView });
toolUserViews.register('context', 'get_current_chart', 1, { OutputUserView: ChartView });
for (const name of ['list_profiles', 'find_profile_by_name']) toolUserViews.register('profiles', name, 1, { OutputUserView: ProfilesView });
toolUserViews.register('kb', 'search_knowledge', 1, { OutputUserView: SourcesView });
for (const name of ['web_search', 'read_webpage']) toolUserViews.register('web', name, 1, { OutputUserView: SourcesView });
toolUserViews.register('conversation', 'read_tool_result', 1, { OutputUserView: (props) => props.call.artifact?.kind === 'chart' ? <ChartView {...props} /> : <SourcesView {...props} /> });
