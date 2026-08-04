import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import { chartReference, twoRingResult } from './chartTestFixtures';
import { InteractiveChart } from './InteractiveChart';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

function renderChart(onRevealSelection = vi.fn()) {
  const store = createChartWorkspaceStore(storage());
  const view = render(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={store}>
    <InteractiveChart result={twoRingResult} reference={chartReference} onRevealSelection={onRevealSelection} />
  </ChartWorkspaceProvider></I18nProvider>);
  return { ...view, store, onRevealSelection };
}

describe('interactive chart', () => {
  test('decorates selectable geometry with normalized accessible facts', () => {
    const { container } = renderChart();
    const selectable = container.querySelectorAll('[data-chart-kind="point"], [data-chart-kind="house"], [data-chart-kind="aspect"]');
    expect(selectable.length).toBeGreaterThan(0);
    for (const node of selectable) {
      expect(node).toHaveAttribute('role', 'button');
      expect(node).toHaveAttribute('tabindex', '0');
      expect(node).toHaveAccessibleName();
    }
    expect(container.querySelector('[data-chart-identity="natal:sun"]')).toHaveAccessibleName(/本命.*sun|sun.*本命/i);
    expect(container.querySelector('[data-chart-identity="house:1"]')).toHaveAccessibleName(/1/);
    expect(container.querySelector('[data-chart-identity^="aspect:"]')).toHaveAccessibleName(/拱/);
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
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: pointerId }, clientX: { value: clientX }, clientY: { value: clientY } });
      svg.dispatchEvent(event);
    };
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 120, 130);
    expect(store.getState().transform).toMatchObject({ x: 20, y: 30 });
    pointer('pointerup', 1, 120, 130);
    store.getState().setTransform({ scale: 1, x: 0, y: 0 });
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointermove', 2, 300, 100);
    expect(store.getState().transform.scale).toBe(2);
    expect(store.getState().transform.scale).toBeLessThanOrEqual(8);
  });
});
