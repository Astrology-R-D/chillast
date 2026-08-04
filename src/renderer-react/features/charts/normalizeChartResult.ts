import type {
  AspectIdentity,
  ChartAspect,
  ChartHouse,
  ChartIdentity,
  ChartPoint,
  ChartRing,
  NormalizedChartResult,
} from './contracts';
import { parseRawChartResult } from './schemas';

export function pointIdentity(ringId: string, pointKey: string): `${string}:${string}` {
  return `${ringId}:${pointKey}`;
}

export function houseIdentity(index: number): `house:${number}` {
  return `house:${index}`;
}

export function aspectIdentity(
  ringA: string,
  point1: string,
  aspectKey: string,
  ringB: string,
  point2: string,
): AspectIdentity {
  return `aspect:${ringA}:${point1}:${aspectKey}:${ringB}:${point2}`;
}

function addUnique(identities: Set<ChartIdentity>, identity: ChartIdentity): void {
  if (identities.has(identity)) throw new Error(`Duplicate chart identity: ${identity}`);
  identities.add(identity);
}

export function normalizeChartResult(value: unknown): NormalizedChartResult {
  const raw = parseRawChartResult(value);
  if (raw.rings.length > 2) throw new Error('Chart response has more than two rings');

  const identities = new Set<ChartIdentity>();
  const pointKeysByRing = new Map<string, Set<string>>();
  const rings: ChartRing[] = raw.rings.map((ring): ChartRing => {
    const identity = `ring:${ring.id}` as const;
    addUnique(identities, identity);
    const pointKeys = new Set<string>();
    pointKeysByRing.set(ring.id, pointKeys);
    const points = ring.points.map((point): ChartPoint => {
      if (pointKeys.has(point.key)) throw new Error(`Duplicate point identity: ${pointIdentity(ring.id, point.key)}`);
      pointKeys.add(point.key);
      const id = pointIdentity(ring.id, point.key);
      addUnique(identities, id);
      return { ...point, id, ringId: ring.id };
    });
    return { ...ring, identity, points };
  });

  const houses: ChartHouse[] = raw.houses.map((house): ChartHouse => {
    const id = houseIdentity(house.index);
    addUnique(identities, id);
    return { ...house, id };
  });

  const aspects: ChartAspect[] = raw.aspects.map((aspect): ChartAspect => {
    let ringA: string;
    let ringB: string;
    let point1 = aspect.point1;
    let point2 = aspect.point2;
    if (rings.length === 1) {
      ringA = rings[0].id;
      ringB = rings[0].id;
      const points = pointKeysByRing.get(ringA)!;
      if (!points.has(point1)) throw new Error(`Aspect endpoint missing: ${point1}`);
      if (!points.has(point2)) throw new Error(`Aspect endpoint missing: ${point2}`);
      [point1, point2] = [point1, point2].sort((left, right) => left.localeCompare(right));
    } else if (rings.length === 2) {
      ringA = rings[0].id;
      ringB = rings[1].id;
      if (!pointKeysByRing.get(ringA)!.has(point1)) throw new Error(`Aspect endpoint missing: ${point1}`);
      if (!pointKeysByRing.get(ringB)!.has(point2)) throw new Error(`Aspect endpoint missing: ${point2}`);
    } else {
      throw new Error(`Aspect endpoint missing: ${point1}`);
    }
    const id = aspectIdentity(ringA, point1, aspect.aspectKey, ringB, point2);
    addUnique(identities, id);
    return { ...aspect, id, ringA, ringB, point1, point2 };
  });

  return {
    resultId: `${raw.meta.type}:${raw.meta.generatedAt}:${raw.rings.map(({ id }) => id).join('+')}`,
    meta: raw.meta,
    subjects: raw.subjects,
    houses,
    angles: raw.angles,
    rings,
    aspects,
    distributions: raw.distributions,
    identities: [
      ...rings.map(({ identity }) => identity),
      ...rings.flatMap(({ points }) => points.map(({ id }) => id)),
      ...houses.map(({ id }) => id),
      ...aspects.map(({ id }) => id),
    ],
  };
}
