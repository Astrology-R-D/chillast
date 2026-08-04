import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import type { NormalizedChartResult } from '../contracts';
import { chartReference, twoRingResult } from './chartTestFixtures';
import { InteractiveChart } from './InteractiveChart';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

function renderChart(onRevealSelection = vi.fn(), result = twoRingResult) {
  const store = createChartWorkspaceStore(storage());
  const view = render(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={store}>
    <InteractiveChart result={result} reference={chartReference} onRevealSelection={onRevealSelection} />
  </ChartWorkspaceProvider></I18nProvider>);
  return { ...view, store, onRevealSelection };
}

function denseResult(): NormalizedChartResult {
  const result = structuredClone(twoRingResult);
  const template = result.aspects[0];
  result.aspects = Array.from({ length: 105 }, (_, index) => ({
    ...template,
    id: `aspect:natal:moon:trine-${index}:natal:sun`,
  }));
  result.identities = [
    ...result.identities.filter((identity) => !identity.startsWith('aspect:')),
    ...result.aspects.map(({ id }) => id),
  ];
  return result;
}

function semanticObjects(container: HTMLElement) {
  return [...container.querySelectorAll<SVGGElement>('[role="button"][data-chart-identity]:not([hidden])')];
}

describe('interactive chart', () => {
  test('decorates selectable geometry with normalized accessible facts', () => {
    const { container } = renderChart(vi.fn(), denseResult());
    expect(container.querySelector('.chart-svg-host svg')).toBeInTheDocument();
    const svg = container.querySelector('.interactive-chart__svg svg');
    expect(svg).toHaveAttribute('role', 'application');
    expect(svg).not.toHaveAttribute('tabindex');
    expect(svg).toHaveAccessibleName(/方向键.*Home.*End.*Enter|Home.*End.*Enter.*方向键/i);
    const selectable = semanticObjects(container);
    expect(selectable.length).toBeGreaterThan(100);
    expect(selectable.filter((node) => node.tabIndex === 0)).toHaveLength(1);
    expect(selectable.filter((node) => node.tabIndex === -1)).toHaveLength(selectable.length - 1);
    for (const node of selectable) {
      expect(node).toHaveAttribute('role', 'button');
      expect(node).toHaveAccessibleName();
    }
    expect(container.querySelector('[data-chart-identity="natal:sun"]')).toHaveAccessibleName(/本命.*sun|sun.*本命/i);
    expect(container.querySelector('[data-chart-identity="house:1"]')).toHaveAccessibleName(/1/);
    expect(container.querySelector('[data-chart-identity^="aspect:"]')).toHaveAccessibleName(/拱/);
  });

  test('moves a non-wrapping roving focus in DOM order without changing locked selection', async () => {
    const user = userEvent.setup();
    const { container, store, onRevealSelection } = renderChart(vi.fn(), denseResult());
    const objects = semanticObjects(container);
    objects[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(objects[1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(objects[2]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(objects[1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(objects[0]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(objects[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(objects.at(-1));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(objects.at(-1));
    expect(store.getState().focusedIdentity).toBeNull();
    expect(objects.filter((node) => node.tabIndex === 0)).toEqual([objects.at(-1)]);
    await user.keyboard('{Enter}');
    expect(store.getState().focusedIdentity).toBe(objects.at(-1)?.dataset.chartIdentity);
    expect(onRevealSelection).toHaveBeenCalledOnce();
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(objects[0]);
    await user.keyboard(' ');
    expect(store.getState().focusedIdentity).toBe(objects[0].dataset.chartIdentity);
  });

  test('click makes an object current while keeping roving identity separate from locked selection', async () => {
    const user = userEvent.setup();
    const { container, store } = renderChart();
    const moon = container.querySelector<SVGGElement>('[data-chart-identity="natal:moon"]')!;
    await user.click(moon);
    expect(store.getState().focusedIdentity).toBe('natal:moon');
    expect(semanticObjects(container).filter((node) => node.tabIndex === 0)).toEqual([moon]);
    await user.click(moon);
    expect(store.getState().focusedIdentity).toBeNull();
    expect(semanticObjects(container).filter((node) => node.tabIndex === 0)).toEqual([moon]);
  });

  test('preserves the current identity across results when visible and falls back when removed', async () => {
    const user = userEvent.setup();
    const view = renderChart();
    await user.click(view.container.querySelector('[data-chart-identity="natal:moon"]')!);
    const retained = structuredClone(twoRingResult);
    retained.meta.title = 'Updated chart';
    view.rerender(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={view.store}>
      <InteractiveChart result={retained} reference={chartReference} />
    </ChartWorkspaceProvider></I18nProvider>);
    expect(view.container.querySelector('[data-chart-identity="natal:moon"]')).toHaveAttribute('tabindex', '0');

    const removed = structuredClone(retained);
    removed.rings[0].points = removed.rings[0].points.filter(({ id }) => id !== 'natal:moon');
    removed.aspects = [];
    removed.identities = removed.identities.filter((identity) => identity !== 'natal:moon' && !identity.startsWith('aspect:'));
    view.rerender(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={view.store}>
      <InteractiveChart result={removed} reference={chartReference} />
    </ChartWorkspaceProvider></I18nProvider>);
    const stops = semanticObjects(view.container).filter((node) => node.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].dataset.chartIdentity).not.toBe('natal:moon');
  });

  test('keeps hover transient and toggles one locked selection by pointer and keyboard', async () => {
    const user = userEvent.setup();
    const { container, store, onRevealSelection } = renderChart();
    const sun = container.querySelector('[data-chart-identity="natal:sun"]')!;
    const moon = container.querySelector<SVGGElement>('[data-chart-identity="natal:moon"]')!;
    fireEvent.pointerOver(sun);
    expect(store.getState()).toMatchObject({ hoverIdentity: 'natal:sun', focusedIdentity: null });
    expect(screen.getByRole('tooltip')).toHaveTextContent(/sun/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/sun/i);
    fireEvent.pointerOut(sun);
    expect(store.getState().hoverIdentity).toBeNull();
    await user.click(sun);
    expect(store.getState().focusedIdentity).toBe('natal:sun');
    expect(sun).toHaveAttribute('data-focused', 'true');
    expect(onRevealSelection).toHaveBeenLastCalledWith({ identity: 'natal:sun', tab: 'planets' });
    moon.focus();
    await user.keyboard('{Enter}');
    expect(store.getState().focusedIdentity).toBe('natal:moon');
    expect(sun).not.toHaveAttribute('data-focused');
    expect(moon).toHaveAttribute('data-focused', 'true');
    await user.keyboard('{Escape}');
    expect(store.getState().focusedIdentity).toBeNull();
    await user.click(moon);
    await user.click(moon);
    expect(store.getState().focusedIdentity).toBeNull();
  });

  test('retains focus through unrelated state and reports the live svg', () => {
    const ready = vi.fn();
    const { container, store, rerender } = renderChart();
    store.getState().setFocus('natal:sun');
    store.getState().setActiveTab('houses');
    rerender(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={store}>
      <InteractiveChart result={twoRingResult} reference={chartReference} onSvgReady={ready} />
    </ChartWorkspaceProvider></I18nProvider>);
    expect(store.getState()).toMatchObject({ focusedIdentity: 'natal:sun', activeTab: 'houses' });
    const svg = container.querySelector('.interactive-chart__svg svg');
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(ready).toHaveBeenLastCalledWith(svg);
  });

  test('hides a ring and coupled aspects without clearing locked focus, then resets only layers', async () => {
    const user = userEvent.setup();
    const { container, store } = renderChart();
    store.getState().setFocus('transit:saturn');
    store.getState().setTransform({ scale: 2, x: 3, y: 4 });
    await user.click(screen.getByRole('button', { name: /图层|layers/i }));
    await user.click(screen.getByRole('checkbox', { name: /行运/ }));
    expect(container.querySelector('[data-ring-id="transit"]')).toHaveAttribute('hidden');
    expect(store.getState()).toMatchObject({ focusedIdentity: 'transit:saturn', transform: { scale: 2, x: 3, y: 4 } });
    await user.click(screen.getByRole('button', { name: /重置图层/ }));
    expect(container.querySelector('[data-ring-id="transit"]')).not.toHaveAttribute('hidden');
    expect(store.getState()).toMatchObject({ focusedIdentity: 'transit:saturn', transform: { scale: 2, x: 3, y: 4 } });
  });

  test('falls back from a hidden current object to the locked visible object and keeps one tab stop', () => {
    const { container, store } = renderChart();
    store.getState().setFocus('natal:sun');
    const transit = container.querySelector<SVGGElement>('[data-chart-identity="transit:saturn"]')!;
    fireEvent.focusIn(transit);
    transit.focus();
    act(() => store.getState().setLayers({ rings: { natal: true, transit: false } }));
    const sun = container.querySelector<SVGGElement>('[data-chart-identity="natal:sun"]')!;
    expect(transit).toHaveAttribute('hidden');
    expect(sun).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(sun);
    expect(semanticObjects(container).filter((node) => node.tabIndex === 0)).toEqual([sun]);
    expect(store.getState().focusedIdentity).toBe('natal:sun');
  });

  test('uses a disclosure panel that closes on Escape and outside click with trigger focus restored', async () => {
    const user = userEvent.setup();
    const { container, store } = renderChart();
    await user.click(container.querySelector('[data-chart-identity="transit:saturn"]')!);
    const trigger = screen.getByRole('button', { name: /图层|layers/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls');
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!);
    expect(panel).toHaveAttribute('role', 'dialog');
    const group = within(panel!).getByRole('group', { name: /图层|layers/i });
    expect(group).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const checkboxes = within(group).getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveFocus();
    await user.tab();
    expect(checkboxes[1]).toHaveFocus();
    const ringToggle = screen.getByRole('checkbox', { name: /行运/ });
    ringToggle.focus();
    await user.keyboard('{Escape}');
    expect(store.getState().focusedIdentity).toBeNull();
    expect(screen.queryByRole('group', { name: /图层|layers/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(screen.getByRole('group', { name: /图层|layers/i })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('group', { name: /图层|layers/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('applies toolbar, wheel, and keyboard transforms without changing layers or focus', async () => {
    const user = userEvent.setup();
    const { container, store } = renderChart();
    store.getState().setFocus('natal:sun');
    const layers = store.getState().layers;
    await user.click(screen.getByRole('button', { name: /放大|zoom in/i }));
    expect(store.getState().transform.scale).toBeGreaterThan(1);
    const svg = container.querySelector<SVGSVGElement>('.interactive-chart__svg svg')!;
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(store.getState().transform.x).not.toBe(0);
    fireEvent.wheel(svg, { deltaY: -100, clientX: 370, clientY: 370 });
    expect(store.getState().transform.scale).toBeGreaterThan(1);
    await user.click(screen.getByRole('button', { name: /重置视图|reset view/i }));
    expect(store.getState()).toMatchObject({ transform: { scale: 1, x: 0, y: 0 }, focusedIdentity: 'natal:sun', layers });
    expect(container.querySelector('[data-chart-transform]')).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  });

  test('supports one-pointer pan and bounded two-pointer pinch', () => {
    const { container, store } = renderChart();
    const svg = container.querySelector<SVGSVGElement>('.interactive-chart__svg svg')!;
    const releasePointerCapture = vi.fn();
    svg.setPointerCapture = vi.fn();
    svg.hasPointerCapture = vi.fn(() => true);
    svg.releasePointerCapture = releasePointerCapture;
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: pointerId }, clientX: { value: clientX }, clientY: { value: clientY } });
      svg.dispatchEvent(event);
    };
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 120, 130);
    expect(store.getState().transform).toMatchObject({ x: 20, y: 30 });
    pointer('pointerup', 1, 120, 130);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    store.getState().setTransform({ scale: 1, x: 0, y: 0 });
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointermove', 2, 300, 100);
    expect(store.getState().transform.scale).toBe(2);
    expect(store.getState().transform.scale).toBeLessThanOrEqual(8);
  });

  test('exposes an accessible SVG export command', () => {
    renderChart();
    expect(screen.getByRole('button', { name: '导出 SVG' })).toHaveAttribute('title', '导出 SVG');
  });
});
