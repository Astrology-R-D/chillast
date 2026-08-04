import type { ChartIdentity, ChartPoint, NormalizedChartResult } from '../contracts';
import type { ComparisonMode } from '../../../stores/chartWorkspacePersistence';

export type MachineValue = string | number | boolean | null;

export interface ExplorerRow {
  id: string;
  chartIdentity: ChartIdentity | null;
  values: Record<string, MachineValue>;
  metadata?: unknown;
}

function machineValue(value: unknown): MachineValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : null;
}

function pointValues(point: ChartPoint, ringLabel: string): Record<string, MachineValue> {
  return {
    ring: point.ringId,
    ringLabel,
    point: point.key,
    longitude: point.longitude,
    sign: point.signKey,
    degreeInSign: point.degreeInSign,
    house: point.house,
    retrograde: point.retrograde,
  };
}

export function planetRows(result: NormalizedChartResult): ExplorerRow[] {
  return result.rings.flatMap((ring) => ring.points.map((point) => ({
    id: point.id,
    chartIdentity: point.id,
    values: pointValues(point, ring.label),
    metadata: point,
  })));
}

export function houseRows(result: NormalizedChartResult): ExplorerRow[] {
  return result.houses.map((house) => ({
    id: house.id,
    chartIdentity: house.id,
    values: {
      house: house.index,
      cuspLongitude: house.cuspLongitude,
      sign: house.signKey,
      degreeInSign: house.degreeInSign,
    },
    metadata: house,
  }));
}

export function aspectRows(result: NormalizedChartResult): ExplorerRow[] {
  return result.aspects.map((aspect) => ({
    id: aspect.id,
    chartIdentity: aspect.id,
    values: {
      ringA: aspect.ringA,
      point1: aspect.point1,
      aspect: aspect.aspectKey,
      ringB: aspect.ringB,
      point2: aspect.point2,
      orb: aspect.orb,
      strength: aspect.strength,
    },
    metadata: aspect,
  }));
}

function structuredRows(section: 'firdaria' | 'profection', value: unknown): ExplorerRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const fields = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    return {
      id: `${section}:${key}`,
      chartIdentity: null,
      values: {
        section,
        key,
        value: machineValue(entry) ?? machineValue(fields.ruler),
        startAge: machineValue(fields.startAge),
        endAge: machineValue(fields.endAge),
      },
      metadata: entry,
    };
  });
}

export function distributionRows(result: NormalizedChartResult): ExplorerRow[] {
  const rows: ExplorerRow[] = [];
  for (const [key, value] of Object.entries(result.distributions.elements)) {
    rows.push({
      id: `distribution:element:${key}`,
      chartIdentity: null,
      values: { section: 'element', key, value, startAge: null, endAge: null },
    });
  }
  for (const [key, value] of Object.entries(result.distributions.modalities)) {
    rows.push({
      id: `distribution:modality:${key}`,
      chartIdentity: null,
      values: { section: 'modality', key, value, startAge: null, endAge: null },
    });
  }
  rows.push(...structuredRows('firdaria', result.meta.firdaria));
  rows.push(...structuredRows('profection', result.meta.profection));
  return rows;
}

export function shortestSignedDelta(first: number, second: number): number {
  return ((second - first + 540) % 360) - 180;
}

export function compareNullableNumbers(
  left: number | null,
  right: number | null,
  descending: boolean,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return descending ? right - left : left - right;
}

function pairedValues(first: ChartPoint | undefined, second: ChartPoint | undefined): Record<string, MachineValue> {
  const firstLongitude = first?.longitude ?? null;
  const secondLongitude = second?.longitude ?? null;
  const firstHouse = first?.house ?? null;
  const secondHouse = second?.house ?? null;
  return {
    point: first?.key ?? second?.key ?? null,
    firstRing: first?.ringId ?? null,
    firstLongitude,
    firstSign: first?.signKey ?? null,
    firstHouse,
    firstRetrograde: first?.retrograde ?? null,
    secondRing: second?.ringId ?? null,
    secondLongitude,
    secondSign: second?.signKey ?? null,
    secondHouse,
    secondRetrograde: second?.retrograde ?? null,
    longitudeDelta: firstLongitude === null || secondLongitude === null
      ? null
      : shortestSignedDelta(firstLongitude, secondLongitude),
    houseDelta: firstHouse === null || secondHouse === null ? null : secondHouse - firstHouse,
  };
}

export function comparisonRows(
  result: NormalizedChartResult,
  mode: ComparisonMode,
): ExplorerRow[] {
  if (mode === 'merged') return planetRows(result);
  const [firstRing, secondRing] = result.rings;
  if (!firstRing || !secondRing) return [];
  const first = new Map(firstRing.points.map((entry) => [entry.key, entry]));
  const second = new Map(secondRing.points.map((entry) => [entry.key, entry]));
  const pointKeys = [
    ...firstRing.points.map(({ key }) => key),
    ...secondRing.points.map(({ key }) => key).filter((key) => !first.has(key)),
  ];
  return pointKeys.map((key) => ({
    id: `comparison:${key}`,
    chartIdentity: first.get(key)?.id ?? second.get(key)?.id ?? null,
    values: pairedValues(first.get(key), second.get(key)),
    metadata: { first: first.get(key) ?? null, second: second.get(key) ?? null },
  }));
}

const BASE_META_KEYS = new Set([
  'type', 'typeNameZh', 'title', 'subtitle', 'settings', 'generatedAt', 'instantUtc',
  'firdaria', 'profection',
]);

export function strategyMetadataRows(result: NormalizedChartResult): ExplorerRow[] {
  return Object.entries(result.meta)
    .filter(([key]) => !BASE_META_KEYS.has(key))
    .map(([key, value]) => ({
      id: `metadata:${key}`,
      chartIdentity: null,
      values: { section: 'metadata', key, value: machineValue(value) },
      metadata: value,
    }));
}
