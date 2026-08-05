import { act, render, screen, within } from '@testing-library/react';
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
    await user.click(screen.getByRole('tab', { name: /comparison|比较/i }));
    expect(screen.getByText(/无法比较|Comparison unavailable/i)).toHaveAttribute('role', 'status');
    expect(store.getState().workspace.tableLayouts[oneRing.meta.type].activeTab).toBe('comparison');
  });

  it('keeps one-ring relationship results unavailable even with two subjects', async () => {
    const user = userEvent.setup();
    const relationship = structuredClone(twoRingResult);
    relationship.rings = [relationship.rings[0]];
    relationship.subjects = ['primary', 'secondary'].map((role) => ({
      role, nameZh: role, nameEn: role, gender: 'other', birthLabel: '2000-01-01',
      location: { label: role, latitude: 0, longitude: 0 },
    }));
    renderExplorer(relationship);

    await user.click(screen.getByRole('tab', { name: /comparison|比较/i }));

    expect(screen.getByText(/无法比较|Comparison unavailable/i)).toHaveAttribute('role', 'status');
    expect(screen.queryByLabelText('比较模式')).not.toBeInTheDocument();
  });

  it('switches all three two-ring comparison modes and persists exact chart layout', async () => {
    const user = userEvent.setup();
    const { store } = renderExplorer();
    await user.click(screen.getByRole('tab', { name: /comparison|比较/i }));
    const modeGroup = screen.getByLabelText('比较模式');
    for (const mode of [['merged', '合并'], ['sideBySide', '并排'], ['difference', '差值']] as const) {
      const name = new RegExp(`${mode[0]}|${mode[1]}`, 'i');
      await user.click(within(modeGroup).getByRole('button', { name }));
      expect(within(modeGroup).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(store.getState().workspace.tableLayouts.transit).toMatchObject({ activeTab: 'comparison', comparisonMode: 'difference' });
  });

  it('reveals chart selections in the matching tab and grid row without clearing focus', async () => {
    const user = userEvent.setup();
    const ref = createRef<ChartDataExplorerHandle>();
    const { container, store } = renderExplorer(twoRingResult, ref);
    act(() => ref.current?.revealSelection({ identity: 'transit:saturn', tab: 'planets' }));
    expect(screen.getByRole('tab', { name: /planets|星体/i })).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('[data-row-id="transit:saturn"] [tabindex="0"]')).toBeInTheDocument();
    const active = container.querySelector<HTMLElement>('[data-row-id="transit:saturn"] [tabindex="0"]')!;
    active.focus();
    await user.keyboard('{Enter}');
    expect(store.getState().focusedIdentity).toBe('transit:saturn');
    await user.click(screen.getByRole('tab', { name: /houses|宫位/i }));
    expect(store.getState().focusedIdentity).toBe('transit:saturn');
    await user.click(screen.getByRole('tab', { name: /planets|星体/i }));
    expect(container.querySelector('[data-row-id="transit:saturn"] [tabindex="0"]')).toBeInTheDocument();
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
    await user.click(screen.getByRole('tab', { name: /distributions|分布/i }));
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
    await user.click(screen.getByRole('button', { name: /copy|复制/i }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toMatch(/^ring\tpoint\tlongitude\tsign\tdegreeInSign\thouse\tretrograde\r\n/);
    await user.click(screen.getByRole('button', { name: /csv/i }));
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('text/csv;charset=utf-8');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:explorer');
  });

  it('localizes explorer tabs, comparison controls, exports, and column tools', async () => {
    const user = userEvent.setup();
    renderExplorer();
    expect(screen.getByRole('tab', { name: '星体' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载 CSV' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '列设置' }));
    expect(screen.getByRole('group', { name: '列设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /隐藏.*ring/i })).toBeInTheDocument();
  });
});
