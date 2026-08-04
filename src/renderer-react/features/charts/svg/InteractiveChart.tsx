import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppChartConfig } from '../../../api/contracts';
import { useChartWorkspace } from '../../../stores/chartWorkspace';
import type { ChartIdentity, ChartReferenceData, NormalizedChartResult } from '../contracts';
import { selectionTargetForIdentity, type ChartSelectionTarget } from './chartSelection';
import { createLegacySvg } from './legacyGeometry';
import { applyLayers } from './chartLayers';
import { ChartToolbar } from './ChartToolbar';
import { useChartTransform } from './useChartTransform';
import { useI18n, type InterpolationVariables } from '../../../i18n/I18nProvider';

export interface InteractiveChartProps {
  result: NormalizedChartResult;
  reference: ChartReferenceData;
  config?: AppChartConfig;
  onRevealSelection?(target: ChartSelectionTarget): void;
  onSvgReady?(svg: SVGSVGElement | null): void;
}

function objectLabel(result: NormalizedChartResult, identity: ChartIdentity, t: (key: string, values?: InterpolationVariables) => string): string {
  for (const ring of result.rings) {
    const point = ring.points.find(({ id }) => id === identity);
    if (point) return t('chart.svg.pointObject', { ring: ring.label, name: point.nameZh || point.nameEn, sign: point.signNameZh, degree: point.degreeInSign.toFixed(2), retrograde: point.retrograde ? ' 逆行' : '' });
  }
  const house = result.houses.find(({ id }) => id === identity);
  if (house) return t('chart.svg.houseObject', { index: house.index, sign: house.signNameZh, degree: house.degreeInSign.toFixed(2) });
  const aspect = result.aspects.find(({ id }) => id === identity);
  if (aspect) {
    const left = result.rings.find(({ id }) => id === aspect.ringA)?.points.find(({ key }) => key === aspect.point1);
    const right = result.rings.find(({ id }) => id === aspect.ringB)?.points.find(({ key }) => key === aspect.point2);
    return t('chart.svg.aspectObject', { left: left?.nameZh || aspect.point1, aspect: aspect.nameZh, right: right?.nameZh || aspect.point2, orb: aspect.orb.toFixed(2) });
  }
  return identity;
}

export function InteractiveChart({ result, reference, config, onRevealSelection, onSvgReady }: InteractiveChartProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
  const markup = useMemo(() => createLegacySvg(result, reference, config).markup, [result, reference, config]);
  const focusedIdentity = useChartWorkspace((state) => state.focusedIdentity);
  const hoverIdentity = useChartWorkspace((state) => state.hoverIdentity);
  const setFocus = useChartWorkspace((state) => state.setFocus);
  const clearFocus = useChartWorkspace((state) => state.clearFocus);
  const setHover = useChartWorkspace((state) => state.setHover);
  const layers = useChartWorkspace((state) => state.layers);
  const transform = useChartWorkspace((state) => state.transform);
  const setTransform = useChartWorkspace((state) => state.setTransform);
  useChartTransform({ svg: svgElement, transform, onChange: setTransform });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = markup;
    const svg = host.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) { setSvgElement(null); return; }
    const transformGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.dataset.chartTransform = '';
    for (const child of [...svg.children]) if (child.tagName.toLowerCase() !== 'defs') transformGroup.append(child);
    svg.append(transformGroup);
    svg.setAttribute('tabindex', '0');
    setSvgElement(svg);
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
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', result.meta.title);

    const selectable = [...svg.querySelectorAll<SVGGElement>('[data-chart-identity]')];
    result.rings.forEach((ring, index) => svg.querySelector(`[data-ring-id="${CSS.escape(ring.id)}"]`)?.setAttribute('data-ring-style', String(index % 3)));
    for (const node of selectable) {
      const identity = node.dataset.chartIdentity as ChartIdentity;
      if (!selectionTargetForIdentity(result, identity)) continue;
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', objectLabel(result, identity, t));
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
  }, [clearFocus, focusedIdentity, hoverIdentity, onRevealSelection, result, setFocus, setHover, markup, t]);

  useLayoutEffect(() => {
    const svg = hostRef.current?.querySelector('svg');
    if (svg instanceof SVGSVGElement) applyLayers(svg, result, reference, layers);
  }, [focusedIdentity, hoverIdentity, layers, markup, reference, result]);

  useLayoutEffect(() => {
    hostRef.current?.querySelector('[data-chart-transform]')?.setAttribute(
      'transform', `translate(${transform.x} ${transform.y}) scale(${transform.scale})`,
    );
  }, [markup, transform]);

  return <div className="interactive-chart" onKeyDownCapture={(event) => { if (event.key === 'Escape') clearFocus(); }}>
    <ChartToolbar result={result} svg={svgElement} transform={transform} onChange={setTransform} />
    <div ref={hostRef} className="interactive-chart__svg chart-svg-host" />
    {hoverIdentity && <div role="tooltip" className="interactive-chart__tooltip">{t('chart.svg.hoverFact', { fact: objectLabel(result, hoverIdentity, t) })}</div>}
    <div role="status" aria-live="polite" className="interactive-chart__status">
      {focusedIdentity ? t('chart.svg.lockedFact', { fact: objectLabel(result, focusedIdentity, t) }) : t('chart.svg.selectionCleared')}
    </div>
  </div>;
}
