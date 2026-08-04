import { assertFiniteSvg } from './legacyGeometry';

export interface SvgExportOptions { title: string; description: string }

const SVG_NS = 'http://www.w3.org/2000/svg';
const STANDALONE_STYLE = `text{font-family:'Maple Mono NF CN','Segoe UI','Segoe UI Symbol',sans-serif}`;

export function serializeChartSvg(svg: SVGSVGElement, options: SvgExportOptions): string {
  const sourceNodes = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  const cloneSource = svg.cloneNode(true) as SVGSVGElement;
  const cloneNodes = [cloneSource, ...cloneSource.querySelectorAll<SVGElement>('*')];
  sourceNodes.forEach((source, index) => {
    const clone = cloneNodes[index];
    if (!clone || !source.hasAttribute('class')) return;
    const computed = getComputedStyle(source);
    for (const property of ['fill', 'stroke', 'color', 'font-family', 'font-size', 'font-weight']) {
      const value = computed.getPropertyValue(property);
      if (value) clone.style.setProperty(property, value);
    }
    clone.removeAttribute('class');
  });

  for (const node of cloneSource.querySelectorAll('[hidden], [aria-hidden="true"], [data-export-exclude]')) node.remove();
  for (const node of [cloneSource, ...cloneSource.querySelectorAll<SVGElement>('*')]) {
    for (const attribute of ['data-focused', 'data-hovered', 'data-tooltip', 'tabindex', 'aria-label', 'aria-pressed']) node.removeAttribute(attribute);
    if (node.getAttribute('role') === 'button') node.removeAttribute('role');
  }

  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('xmlns', SVG_NS);
  for (const attribute of [...cloneSource.attributes]) if (attribute.name !== 'xmlns') root.setAttribute(attribute.name, attribute.value);
  while (cloneSource.firstChild) root.append(cloneSource.firstChild);
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = options.title;
  const description = document.createElementNS(SVG_NS, 'desc');
  description.textContent = options.description;
  root.prepend(description);
  root.prepend(title);
  let defs = root.querySelector(':scope > defs');
  if (!defs) { defs = document.createElementNS(SVG_NS, 'defs'); root.insertBefore(defs, root.children[2] ?? null); }
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = STANDALONE_STYLE;
  defs.prepend(style);
  assertFiniteSvg(root);
  return new XMLSerializer().serializeToString(root);
}

export function downloadSvg(svg: SVGSVGElement, filename: string, options: SvgExportOptions): void {
  const blob = new Blob([serializeChartSvg(svg, options)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
