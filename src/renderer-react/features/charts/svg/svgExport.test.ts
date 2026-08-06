import { describe, expect, test, vi } from 'vitest';
import { downloadSvg, serializeChartSvg } from './svgExport';

function liveSvg(): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = `<svg viewBox="0 0 740 740" class="external-chart" xmlns="http://www.w3.org/2000/svg">
    <g data-chart-transform transform="translate(12 24) scale(2)">
      <g data-chart-identity="natal:sun" data-focused="true" role="button" tabindex="0" aria-label="Sun" cursor="pointer" style="cursor:pointer;opacity:0.8"><circle class="external-mark" style="cursor:crosshair" cx="10" cy="20" r="2"/></g>
      <g data-chart-identity="transit:saturn" hidden aria-hidden="true"><circle cx="30" cy="40" r="2"/></g>
      <g data-export-exclude="true" data-tooltip="true"><text x="1" y="2">tooltip</text></g>
    </g>
  </svg>`;
  document.body.append(host);
  const style = document.createElement('style');
  style.textContent = '.external-mark { fill: rgb(12, 34, 56); stroke: rgb(90, 80, 70); }';
  document.head.append(style);
  return host.querySelector('svg')!;
}

describe('standalone SVG export', () => {
  test('serializes current visible state without mutating the live SVG', () => {
    const svg = liveSvg();
    const before = svg.outerHTML;
    const output = serializeChartSvg(svg, { title: 'Current chart', description: 'Visible layers only' });
    expect(output).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(output).toContain('<title>Current chart</title>');
    expect(output).toContain('<desc>Visible layers only</desc>');
    expect(output).toContain('translate(12 24) scale(2)');
    expect(output).toContain('rgb(12, 34, 56)');
    expect(output).toContain('Maple Mono NF CN');
    expect(output).toContain('[data-ring-style="1"]');
    expect(output).not.toMatch(/transit:saturn|tooltip|data-focused|data-hovered|tabindex|role="button"|aria-label="Sun"/);
    expect(output).not.toMatch(/cursor\s*[:=]/i);
    expect(output).toContain('opacity: 0.8');
    expect(output).not.toMatch(/NaN|Infinity|undefined/);
    expect(svg.outerHTML).toBe(before);
  });

  test('downloads UTF-8 SVG and revokes its object URL after the click handoff task', () => {
    vi.useFakeTimers();
    const svg = liveSvg();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:chart');
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadSvg(svg, 'chart.svg', { title: 'Chart', description: 'Description' });
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('image/svg+xml;charset=utf-8');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chart');
    vi.useRealTimers();
  });

  test('schedules SVG cleanup when the browser rejects the click handoff', () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:failed', revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => downloadSvg(liveSvg(), 'chart.svg', { title: 'Chart', description: 'Description' })).toThrow('blocked');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed');
    vi.useRealTimers();
  });
});
