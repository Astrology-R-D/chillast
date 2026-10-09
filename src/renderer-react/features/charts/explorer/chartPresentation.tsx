import type { NormalizedChartResult } from '../contracts';
import { formatDegreeMinutes } from '@chillast/degree-format';
import type { ExplorerRow } from './explorerRows';

export function presentChartValue(row: ExplorerRow, id: string, result?: NormalizedChartResult): { text: string; glyph?: string; aliases: string[] } {
  const value = row.values[id];
  const raw = value === null || value === undefined ? '' : String(value);
  if (!result) return { text: raw, aliases: [raw] };
  const points = result?.rings.flatMap((ring) => ring.points) ?? [];
  const point = points.find((entry) => entry.key === value);
  const metadata = row.metadata as Record<string, unknown> | undefined;
  let text = raw;
  let glyph: string | undefined;
  const aliases = [raw];
  if (['point', 'point1', 'point2'].includes(id) && point) {
    text = point.nameZh || point.nameEn; glyph = point.glyph; aliases.push(point.nameEn);
  } else if (['ring', 'ringA', 'ringB', 'firstRing', 'secondRing'].includes(id)) {
    text = result?.rings.find((ring) => ring.id === value)?.label ?? raw;
  } else if (['sign', 'firstSign', 'secondSign'].includes(id)) {
    const sign = points.find((entry) => entry.signKey === value) ?? result?.houses.find((entry) => entry.signKey === value);
    text = sign?.signNameZh ?? raw; glyph = sign?.signGlyph;
  } else if (id === 'aspect' && metadata) {
    text = String(metadata.nameZh || metadata.nameEn || raw); glyph = String(metadata.glyph || ''); aliases.push(String(metadata.nameEn || ''));
  } else if (['house', 'firstHouse', 'secondHouse'].includes(id) && typeof value === 'number') {
    text = `第 ${value} 宫`; aliases.push(`第${value}宫`);
  } else if (id.toLowerCase().includes('retrograde') && typeof value === 'boolean') {
    text = value ? '逆行' : '顺行'; glyph = value ? '℞' : undefined;
  } else if (typeof value === 'number') {
    if (id === 'degreeInSign') text = formatDegreeMinutes(value);
    else if (['longitude', 'cuspLongitude', 'firstLongitude', 'secondLongitude', 'orb', 'longitudeDelta'].includes(id)) text = `${Number(value.toFixed(3))}°`;
    else text = String(Number(value.toFixed(3)));
  }
  aliases.push(text);
  return { text, glyph, aliases };
}

export function ChartValue({ row, id, result, raw }: { row: ExplorerRow; id: string; result?: NormalizedChartResult; raw?: boolean }) {
  const display = presentChartValue(row, id, result);
  return <span className="chart-value" title={String(row.values[id] ?? '')}>
    {!raw && display.glyph && <span className="chart-value__glyph" aria-hidden="true">{display.glyph}</span>}
    <span>{raw ? String(row.values[id] ?? '') : display.text}</span>
  </span>;
}
