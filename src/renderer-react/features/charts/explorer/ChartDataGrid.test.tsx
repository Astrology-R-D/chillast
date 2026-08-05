import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import { defaultTabLayout, type TabLayoutV1 } from '../../../stores/chartWorkspacePersistence';
import { columnsFor } from './explorerColumns';
import { ChartDataGrid, type ChartDataGridHandle } from './ChartDataGrid';
import type { ExplorerRow } from './explorerRows';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

const labels = new Proxy<Record<string, string>>({}, { get: (_target, key) => String(key) });
const rows = Array.from({ length: 500 }, (_, index): ExplorerRow => ({
  id: `natal:p${index}`,
  chartIdentity: `natal:p${index}`,
  values: {
    ring: 'natal', point: `p${index}`, longitude: index % 360,
    sign: index % 2 ? 'aries' : 'taurus', degreeInSign: index % 30,
    house: (index % 12) + 1, retrograde: index % 3 === 0,
  },
}));

function GridHarness({ initial = defaultTabLayout(), selected = new Set<string>(), onFocus = vi.fn(), gridRef = createRef<ChartDataGridHandle>() }: {
  initial?: TabLayoutV1; selected?: Set<string>; onFocus?: (identity: string) => void; gridRef?: React.RefObject<ChartDataGridHandle | null>;
}) {
  const [layout, setLayout] = useState(initial);
  const [selection, setSelection] = useState(selected);
  const store = useState(() => createChartWorkspaceStore(storage()))[0];
  return <ChartWorkspaceProvider store={store}><ChartDataGrid ref={gridRef} tab="planets"
    rows={rows} columns={columnsFor('planets', 'merged', labels)} layout={layout}
    selectedRowIds={selection} focusedIdentity={null} onLayoutChange={setLayout}
    onSelectionChange={setSelection} onFocusIdentity={onFocus as never} /></ChartWorkspaceProvider>;
}

function ComparisonGrid({ comparisonRows, initial }: { comparisonRows: ExplorerRow[]; initial: TabLayoutV1 }) {
  const [layout, setLayout] = useState(initial);
  const [selection, setSelection] = useState(new Set<string>());
  const store = useState(() => createChartWorkspaceStore(storage()))[0];
  return <ChartWorkspaceProvider store={store}><ChartDataGrid tab="comparison"
    rows={comparisonRows} columns={columnsFor('comparison', 'sideBySide', labels)} layout={layout}
    selectedRowIds={selection} focusedIdentity={null} onLayoutChange={setLayout}
    onSelectionChange={setSelection} onFocusIdentity={vi.fn()} /></ChartWorkspaceProvider>;
}

describe('virtual chart data grid', () => {
  it('virtualizes 500 rows and imperatively reveals a sorted row', () => {
    const ref = createRef<ChartDataGridHandle>();
    const { container } = render(<GridHarness gridRef={ref} />);
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '501');
    expect(screen.getAllByRole('row').length).toBeLessThan(40);
    act(() => ref.current?.revealRow('natal:p499'));
    expect(container.querySelector('[data-row-id="natal:p499"]')).toBeInTheDocument();
    expect(container.querySelector('[data-row-id="natal:p499"] [tabindex="0"]')).toBeInTheDocument();
  });

  it('applies simultaneous filters, descending sort, pinning, visibility, order, and size', () => {
    const layout = defaultTabLayout();
    layout.filters = [{ id: 'sign', value: ['aries'] }, { id: 'house', value: [2, 6] }];
    layout.sorting = [{ id: 'longitude', desc: true }];
    layout.columnVisibility.retrograde = false;
    layout.columnOrder = ['selected', 'point', 'longitude', 'ring', 'sign', 'degreeInSign', 'house', 'retrograde'];
    layout.columnPinning = { left: ['selected', 'point'], right: ['house'] };
    layout.columnSizing.longitude = 166;
    const { container } = render(<GridHarness initial={layout} />);
    const rendered = [...container.querySelectorAll<HTMLElement>('[data-row-id]')];
    expect(rendered.length).toBeGreaterThan(0);
    for (const row of rendered) {
      const source = rows.find(({ id }) => id === row.dataset.rowId)!;
      expect(source.values.sign).toBe('aries');
      expect(source.values.house as number).toBeGreaterThanOrEqual(2);
      expect(source.values.house as number).toBeLessThanOrEqual(6);
    }
    expect(screen.queryByRole('columnheader', { name: 'retrograde' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'longitude' })).toHaveStyle({ width: '166px' });
    expect(screen.getByRole('columnheader', { name: 'point' })).toHaveAttribute('data-pinned', 'left');
    expect(screen.getByRole('columnheader', { name: 'house' })).toHaveAttribute('data-pinned', 'right');
  });

  it('moves an active cell, focuses rows, toggles and extends range selection', async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const { container } = render(<GridHarness onFocus={onFocus} />);
    const first = container.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!;
    first.focus();
    await user.keyboard('{ArrowRight}{End}{Home}{ArrowDown} ');
    const active = container.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!;
    expect(active).toHaveAttribute('aria-colindex', '1');
    expect(active.closest('[role="row"]')).toHaveAttribute('data-selected', 'true');
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(3);
    await user.keyboard('{Enter}');
    expect(onFocus).toHaveBeenCalledWith(expect.stringMatching(/^natal:p/));
    fireEvent.keyDown(active, { key: 'End', ctrlKey: true });
    expect(container.querySelector('[data-row-id="natal:p499"] [tabindex="0"]')).toHaveAttribute('aria-colindex', '8');
    fireEvent.keyDown(container.querySelector('[data-row-id="natal:p499"] [tabindex="0"]')!, { key: 'Home', ctrlKey: true });
    expect(container.querySelector('[data-row-id="natal:p0"] [tabindex="0"]')).toHaveAttribute('aria-colindex', '1');
  });

  it('prunes selected IDs outside the filtered row model but preserves selection through sorting', () => {
    const layout = defaultTabLayout();
    layout.filters = [{ id: 'point', value: 'p1' }];
    const { container, rerender } = render(<GridHarness initial={layout} selected={new Set(['natal:p1', 'natal:p2'])} />);
    expect(container.querySelector('[data-row-id="natal:p1"]')).toHaveAttribute('data-selected', 'true');
    expect(container.querySelector('[data-row-id="natal:p2"]')).not.toBeInTheDocument();
    layout.sorting = [{ id: 'longitude', desc: true }];
    rerender(<GridHarness initial={layout} selected={new Set(['natal:p1'])} />);
    expect(container.querySelector('[data-row-id="natal:p1"]')).toHaveAttribute('data-selected', 'true');
  });

  it('keeps missing comparison numbers last in descending table sorts', () => {
    const layout = defaultTabLayout();
    layout.sorting = [{ id: 'secondLongitude', desc: true }];
    const comparisonRows: ExplorerRow[] = [
      { id: 'present-low', chartIdentity: null, values: { secondLongitude: 10 } },
      { id: 'missing', chartIdentity: null, values: { secondLongitude: null } },
      { id: 'present-high', chartIdentity: null, values: { secondLongitude: 20 } },
    ];

    const { container } = render(<ComparisonGrid comparisonRows={comparisonRows} initial={layout} />);

    expect([...container.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id')))
      .toEqual(['present-high', 'present-low', 'missing']);
  });
});
