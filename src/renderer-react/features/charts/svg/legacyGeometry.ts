import type { AppChartConfig } from '../../../api/contracts';
import type { ChartReferenceData, NormalizedChartResult } from '../contracts';
import { ChartWheel } from '../../../../renderer/app/components/ChartWheel.js';

export interface LegacySvgDocument {
  markup: string;
  document: XMLDocument;
}

const NUMERIC_ATTRIBUTES = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'width', 'height'];

export function assertFiniteSvg(svg: SVGSVGElement | XMLDocument): void {
  const root = 'documentElement' in svg ? svg.documentElement : svg;
  const values: string[] = [];
  for (const node of root.querySelectorAll('*')) {
    for (const name of NUMERIC_ATTRIBUTES) {
      const value = node.getAttribute(name);
      if (value !== null) values.push(value);
    }
    if (node.tagName.toLowerCase() === 'path') values.push(...(node.getAttribute('d')?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []));
  }
  values.push(...(root.getAttribute('viewBox')?.trim().split(/[ ,]+/) ?? []));
  if (values.some((value) => value === '' || !Number.isFinite(Number(value)))) throw new Error('Chart SVG contains a non-finite numeric attribute');
  if (/NaN|Infinity|undefined/.test(root.outerHTML)) throw new Error('Chart SVG contains invalid serialized values');
}

export function createLegacySvg(
  result: NormalizedChartResult,
  reference: ChartReferenceData,
  config?: AppChartConfig,
): LegacySvgDocument {
  const markup = new ChartWheel(reference, config).toSvg(result);
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (document.querySelector('parsererror')) throw new Error('Legacy chart produced invalid SVG');
  assertFiniteSvg(document);
  if (config?.svgSize === undefined && document.documentElement.getAttribute('viewBox') !== '0 0 740 740') {
    throw new Error('Legacy chart default viewBox changed');
  }
  return { markup, document };
}
