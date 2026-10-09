import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { apiClient } from '../../../api/client';
import { normalizeChartResult } from '../../charts/normalizeChartResult';
import { InteractiveChart } from '../../charts/svg/InteractiveChart';
import { ChartDataExplorer } from '../../charts/explorer/ChartDataExplorer';
import type { ToolViewProps } from './ToolUserViewRegistry';
import '../../charts/workbench/charts.css';

export function ChartUserView({ data }: ToolViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const result = useMemo(() => normalizeChartResult(data), [data]);
  const reference = useQuery({ queryKey: ['western-chart-reference'], queryFn: apiClient.getChartReference });
  return <div ref={host} className="tool-chart">
    <div className="tool-chart__heading"><strong>{result.meta.title}</strong><small>{result.rings.length} 层 · {result.aspects.length} 个相位</small></div>
    {!reference.data && <p>{reference.isError ? '星盘参考数据加载失败，可查看原始数据。' : '正在加载星盘…'}</p>}
    {reference.data && <div className="tool-chart__canvas"><InteractiveChart isolated result={result} reference={reference.data} /></div>}
    <details><summary>星体数据</summary><table className="tool-fields"><tbody>{result.rings.flatMap((ring) => ring.points.map((p) => <tr key={p.id}><th>{p.glyph} {p.nameZh || p.nameEn}</th><td>{ring.label} · {p.signGlyph} {p.signNameZh} {p.degreeInSign.toFixed(2)}° · 第{p.house ?? '—'}宫 {p.retrograde ? '℞' : ''}</td></tr>))}</tbody></table></details>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button type="button">展开星盘与数据</button></Dialog.Trigger>
      <Dialog.Portal container={host.current?.closest('.ai-workspace') as HTMLElement | undefined}>
        <Dialog.Overlay className="tool-chart-dialog__overlay" />
        <Dialog.Content className="tool-chart-dialog" aria-describedby={undefined}>
          <header><Dialog.Title>{result.meta.title}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="关闭星盘详情">×</button></Dialog.Close></header>
          {reference.data && <div className="tool-chart-dialog__canvas"><InteractiveChart isolated result={result} reference={reference.data} /></div>}
          <div className="tool-chart-dialog__data"><ChartDataExplorer result={result} chartType={result.meta.type} /></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
