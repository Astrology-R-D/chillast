import { useLayoutEffect, useMemo, useRef } from 'react';
import type { AppChartConfig } from '../../../api/contracts';
import { useChartWorkspace } from '../../../stores/chartWorkspace';
import type { ChartIdentity, ChartReferenceData, NormalizedChartResult } from '../contracts';
import { selectionTargetForIdentity, type ChartSelectionTarget } from './chartSelection';
import { createLegacySvg } from './legacyGeometry';
import { applyLayers } from './chartLayers';
import { ChartLayerMenu } from './ChartLayerMenu';

export interface InteractiveChartProps {
  result: NormalizedChartResult;
  reference: ChartReferenceData;
  config?: AppChartConfig;
  onRevealSelection?(target: ChartSelectionTarget): void;
  onSvgReady?(svg: SVGSVGElement | null): void;
}

function objectLabel(result: NormalizedChartResult, identity: ChartIdentity): string {
  for (const ring of result.rings) {
    const point = ring.points.find(({ id }) => id === identity);
    if (point) return `${ring.label} ${point.nameZh || point.nameEn} ${point.signNameZh} ${point.degreeInSign.toFixed(2)}°${point.retrograde ? ' 逆行' : ''}`;
  }
  const house = result.houses.find(({ id }) => id === identity);
  if (house) return `第 ${house.index} 宫 ${house.signNameZh} ${house.degreeInSign.toFixed(2)}°`;
  const aspect = result.aspects.find(({ id }) => id === identity);
  if (aspect) {
    const left = result.rings.find(({ id }) => id === aspect.ringA)?.points.find(({ key }) => key === aspect.point1);
    const right = result.rings.find(({ id }) => id === aspect.ringB)?.points.find(({ key }) => key === aspect.point2);
    return `${left?.nameZh || aspect.point1} ${aspect.nameZh} ${right?.nameZh || aspect.point2} 容许度 ${aspect.orb.toFixed(2)}°`;
  }
  return identity;
}

export function InteractiveChart({ result, reference, config, onRevealSelection, onSvgReady }: InteractiveChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => createLegacySvg(result, reference, config).markup, [result, reference, config]);
  const focusedIdentity = useChartWorkspace((state) => state.focusedIdentity);
  const hoverIdentity = useChartWorkspace((state) => state.hoverIdentity);
  const setFocus = useChartWorkspace((state) => state.setFocus);
  const clearFocus = useChartWorkspace((state) => state.clearFocus);
  const setHover = useChartWorkspace((state) => state.setHover);
  const layers = useChartWorkspace((state) => state.layers);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host) host.innerHTML = markup;
  }, [markup]);

  useLayoutEffect(() => {
    const svg = hostRef.current?.querySelector('svg');
    onSvgReady?.(svg instanceof SVGSVGElement ? svg : null);
    return () => onSvgReady?.(null);
  }, [markup, onSvgReady]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const svg = host?.querySelector('svg');
    if (!host || !(svg instanceof SVGSVGElement)) return undefined;
    svg.setAttribute('aria-label', result.meta.title);

    const selectable = [...svg.querySelectorAll<SVGGElement>('[data-chart-identity]')];
    for (const node of selectable) {
      const identity = node.dataset.chartIdentity as ChartIdentity;
      if (!selectionTargetForIdentity(result, identity)) continue;
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', objectLabel(result, identity));
      if (focusedIdentity === identity) node.setAttribute('data-focused', 'true');
      else node.removeAttribute('data-focused');
      if (hoverIdentity === identity) node.setAttribute('data-hovered', 'true');
      else node.removeAttribute('data-hovered');
    }

    const identityFromEvent = (event: Event): ChartIdentity | null => {
      const target = event.target instanceof Element ? event.target.closest<SVGGElement>('[data-chart-identity]') : null;
      const identity = target?.dataset.chartIdentity as ChartIdentity | undefined;
      return identity && selectionTargetForIdentity(result, identity) ? identity : null;
    };
    const pointerOver = (event: PointerEvent) => setHover(identityFromEvent(event));
    const pointerOut = (event: PointerEvent) => {
      const identity = identityFromEvent(event);
      const related = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-chart-identity]') : null;
      if (!identity || related?.getAttribute('data-chart-identity') !== identity) setHover(null);
    };
    const activate = (identity: ChartIdentity | null) => {
      if (!identity) return;
      const target = selectionTargetForIdentity(result, identity);
      setFocus(identity);
      if (target) onRevealSelection?.(target);
    };
    const click = (event: MouseEvent) => activate(identityFromEvent(event));
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { clearFocus(); return; }
      if (event.key === 'Enter' || event.key === ' ') {
        const identity = identityFromEvent(event);
        if (identity) { event.preventDefault(); activate(identity); }
      }
    };
    host.addEventListener('pointerover', pointerOver);
    host.addEventListener('pointerout', pointerOut);
    host.addEventListener('click', click);
    host.addEventListener('keydown', keyDown);
    return () => {
      host.removeEventListener('pointerover', pointerOver);
      host.removeEventListener('pointerout', pointerOut);
      host.removeEventListener('click', click);
      host.removeEventListener('keydown', keyDown);
    };
  }, [clearFocus, focusedIdentity, hoverIdentity, onRevealSelection, result, setFocus, setHover, markup]);

  useLayoutEffect(() => {
    const svg = hostRef.current?.querySelector('svg');
    if (svg instanceof SVGSVGElement) applyLayers(svg, result, reference, layers);
  }, [focusedIdentity, hoverIdentity, layers, markup, reference, result]);

  return <div className="interactive-chart">
    <div className="chart-toolbar"><ChartLayerMenu result={result} /></div>
    <div ref={hostRef} className="interactive-chart__svg" />
    {hoverIdentity && <div role="tooltip" className="interactive-chart__tooltip">{objectLabel(result, hoverIdentity)}</div>}
    <div role="status" aria-live="polite" className="interactive-chart__status">
      {focusedIdentity ? objectLabel(result, focusedIdentity) : ''}
    </div>
  </div>;
}
