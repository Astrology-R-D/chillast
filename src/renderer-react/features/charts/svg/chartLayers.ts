import type { LayerState } from '../../../stores/chartWorkspace';
import type { ChartIdentity, ChartReferenceData, NormalizedChartResult } from '../contracts';

export function defaultLayers(result: NormalizedChartResult): LayerState {
  return {
    majorAspects: true,
    minorAspects: false,
    houses: true,
    labels: true,
    rings: Object.fromEntries(result.rings.map(({ id }) => [id, true])),
  };
}

export function isIdentityVisible(
  identity: ChartIdentity,
  result: NormalizedChartResult,
  reference: ChartReferenceData,
  layers: LayerState,
): boolean {
  if (identity.startsWith('ring:')) return layers.rings[identity.slice(5)] ?? true;
  if (identity.startsWith('house:')) return layers.houses;
  if (identity.startsWith('aspect:')) {
    const aspect = result.aspects.find(({ id }) => id === identity);
    if (!aspect || !(layers.rings[aspect.ringA] ?? true) || !(layers.rings[aspect.ringB] ?? true)) return false;
    return reference.aspects[aspect.aspectKey]?.level === 'minor' ? layers.minorAspects : layers.majorAspects;
  }
  const ring = result.rings.find((candidate) => candidate.points.some(({ id }) => id === identity));
  return ring ? layers.rings[ring.id] ?? true : false;
}

function setVisible(node: Element, visible: boolean): void {
  if (visible) {
    node.removeAttribute('hidden');
    node.removeAttribute('aria-hidden');
    node.removeAttribute('display');
  } else {
    node.setAttribute('hidden', '');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('display', 'none');
  }
}

export function applyLayers(
  svg: SVGSVGElement,
  result: NormalizedChartResult,
  reference: ChartReferenceData,
  layers: LayerState,
): void {
  for (const node of svg.querySelectorAll<SVGElement>('[data-chart-identity]')) {
    const identity = node.dataset.chartIdentity as ChartIdentity;
    const visible = isIdentityVisible(identity, result, reference, layers);
    setVisible(node, visible);
  }
  for (const node of svg.querySelectorAll('[data-chart-part="label"], [data-chart-part="leader"]')) setVisible(node, layers.labels);
  for (const node of svg.querySelectorAll('[data-chart-part="angle"]')) setVisible(node, layers.houses);
}
