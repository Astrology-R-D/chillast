import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import type { NormalizedChartResult } from '../contracts';
import { twoRingResult } from '../svg/chartTestFixtures';
import { ChartDataExplorer, type ChartDataExplorerHandle } from './ChartDataExplorer';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

function renderExplorer(result: NormalizedChartResult = twoRingResult, ref = createRef<ChartDataExplorerHandle>()) {
  const store = createChartWorkspaceStore(storage());
  const view = render(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={store}>
    <ChartDataExplorer ref={ref} result={result} chartType={result.meta.type} />
  </ChartWorkspaceProvider></I18nProvider>);
  return { ...view, store, ref };
}

describe('chart data explorer', () => {
  it('always renders five tabs and explains unavailable one-ring comparison', async () => {
    const user = userEvent.setup();
    const oneRing = structuredClone(twoRingResult);
    oneRing.rings = [oneRing.rings[0]];
    const { store } = renderExplorer(oneRing);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    await user.click(screen.getByRole('tab', { name: /comparison/i }));
    expect(screen.getByText(/Comparison unavailable/i)).toHaveAttribute('role', 'status');
    expect(store.getState().workspace.tableLayouts[oneRing.meta.type].activeTab).toBe('comparison');
  });

  it('switches all three two-ring comparison modes and persists exact chart layout', async () => {
    const user = userEvent.setup();
    const { store } = renderExplorer();
    await user.click(screen.getByRole('tab', { name: /comparison/i }));
    for (const mode of ['merged', 'sideBySide', 'difference']) {
      await user.click(screen.getByRole('button', { name: new RegExp(mode, 'i') }));
      expect(screen.getByRole('button', { name: new RegExp(mode, 'i') })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(store.getState().workspace.tableLayouts.transit).toMatchObject({ activeTab: 'comparison', comparisonMode: 'difference' });
  });

  it('reveals chart selections in the matching tab and grid row without clearing focus', async () => {
    const user = userEvent.setup();
    const ref = createRef<ChartDataExplorerHandle>();
    const { container, store } = renderExplorer(twoRingResult, ref);
    act(() => ref.current?.revealSelection({ identity: 'transit:saturn', tab: 'planets' }));
    expect(screen.getByRole('tab', { name: /planets/i })).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('[data-row-id="transit:saturn"] [tabindex="0"]')).toBeInTheDocument();
    const active = container.querySelector<HTMLElement>('[data-row-id="transit:saturn"] [tabindex="0"]')!;
    active.focus();
    await user.keyboard('{Enter}');
    expect(store.getState().focusedIdentity).toBe('transit:saturn');
    await user.click(screen.getByRole('tab', { name: /houses/i }));
    expect(store.getState().focusedIdentity).toBe('transit:saturn');
    act(() => ref.current?.revealSelection({ identity: 'house:2', tab: 'houses' }));
    expect(container.querySelector('[data-row-id="house:2"]')).toBeInTheDocument();
  });

  it('shows structured strategy and unknown metadata while layer visibility leaves rows intact', async () => {
    const user = userEvent.setup();
    const result = { ...twoRingResult, meta: { ...twoRingResult.meta,
      firdaria: { major: { ruler: 'sun', startAge: 0, endAge: 10 } },
      profection: { age: 36 }, strategyFacts: { score: 3 },
    } } as NormalizedChartResult;
    const { container, store } = renderExplorer(result);
    store.getState().setLayers({ rings: { natal: false, transit: false } });
    expect(container.querySelectorAll('[data-row-id^="natal:"]').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: /distributions/i }));
    expect(container.querySelector('[data-row-id="firdaria:major"]')).toBeInTheDocument();
    expect(container.querySelector('[data-row-id="profection:age"]')).toBeInTheDocument();
    expect(container.querySelector('[data-row-id="metadata:strategyFacts"]')).toBeInTheDocument();
  });

  it('copies and downloads the current filtered visible machine columns', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:explorer');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderExplorer();
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toMatch(/^ring\tpoint\tlongitude\tsign\tdegreeInSign\thouse\tretrograde\r\n/);
    await user.click(screen.getByRole('button', { name: /csv/i }));
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('text/csv;charset=utf-8');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:explorer');
  });
});
