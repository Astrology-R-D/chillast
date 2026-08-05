import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnPinningState,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { ChartIdentity } from '../contracts';
import { useChartWorkspace, type ActiveCellState } from '../../../stores/chartWorkspace';
import type { ExplorerTab, TabLayoutV1 } from '../../../stores/chartWorkspacePersistence';
import type { ExplorerRow, MachineValue } from './explorerRows';

export interface ChartDataGridHandle {
  revealRow(rowId: string): void;
  focusRow(rowId: string): void;
  getFilteredRows(): ExplorerRow[];
  getVisibleColumnIds(): string[];
}

export interface ChartDataGridProps {
  rows: ExplorerRow[];
  columns: ColumnDef<ExplorerRow, MachineValue>[];
  layout: TabLayoutV1;
  selectedRowIds: ReadonlySet<string>;
  focusedIdentity: ChartIdentity | null;
  onLayoutChange(layout: TabLayoutV1): void;
  onSelectionChange(ids: Set<string>): void;
  onFocusIdentity(identity: ChartIdentity): void;
  tab?: ExplorerTab;
  sortLabel?: string;
  filterLabel?: string;
  selectLabel?: string;
}

const NUMERIC_FILTER_COLUMNS = new Set([
  'longitude', 'degreeInSign', 'house', 'cuspLongitude', 'orb', 'strength', 'value', 'startAge', 'endAge',
  'firstLongitude', 'firstHouse', 'secondLongitude', 'secondHouse', 'longitudeDelta', 'houseDelta',
]);
const BOOLEAN_FILTER_COLUMNS = new Set(['retrograde', 'firstRetrograde', 'secondRetrograde']);

function readRowHeight(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height'));
  return Number.isFinite(value) && value > 0 ? value : 32;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function pinnedStyle(column: { getIsPinned(): false | 'left' | 'right'; getStart(position: 'left'): number; getAfter(position: 'right'): number }): CSSProperties {
  const pinned = column.getIsPinned();
  if (!pinned) return {};
  return {
    position: 'sticky',
    left: pinned === 'left' ? column.getStart('left') : undefined,
    right: pinned === 'right' ? column.getAfter('right') : undefined,
    zIndex: 2,
  };
}

export const ChartDataGrid = forwardRef<ChartDataGridHandle, ChartDataGridProps>(function ChartDataGrid({
  rows,
  columns,
  layout,
  selectedRowIds,
  focusedIdentity,
  onLayoutChange,
  onSelectionChange,
  onFocusIdentity,
  tab = 'planets',
  sortLabel = 'Sort',
  filterLabel = 'Filter',
  selectLabel = 'Select',
}, forwardedRef) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeCellOwnsFocus = useRef(false);
  const focusSequence = useRef(0);
  const previousTab = useRef(tab);
  const previousFocusedIdentity = useRef(focusedIdentity);
  const restoredActive = useChartWorkspace((state) => state.activeCells[tab]);
  const setStoredActive = useChartWorkspace((state) => state.setActiveCell);
  const [sorting, setSorting] = useState<SortingState>(layout.sorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(layout.filters);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(layout.columnVisibility);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(layout.columnPinning);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(layout.columnOrder);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(layout.columnSizing);
  const [rowHeight, setRowHeight] = useState(readRowHeight);
  const [active, setActive] = useState(() => restoredActive ?? {
    rowId: rows[0]?.id ?? '',
    columnId: columns[0]?.id ?? 'selected',
    anchorRowId: null,
  });
  const activeRef = useRef<ActiveCellState>(active);
  const selectionRef = useRef(selectedRowIds);
  selectionRef.current = selectedRowIds;

  const emitLayout = (patch: Partial<TabLayoutV1>) => onLayoutChange({
    sorting, filters: columnFilters, columnOrder, columnVisibility, columnPinning: {
      left: columnPinning.left ?? [], right: columnPinning.right ?? [],
    }, columnSizing, ...patch,
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, columnVisibility, columnPinning, columnOrder, columnSizing },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange(updater) {
      const next = functionalUpdate(updater, sorting); setSorting(next); emitLayout({ sorting: next });
    },
    onColumnFiltersChange(updater) {
      const next = functionalUpdate(updater, columnFilters); setColumnFilters(next); emitLayout({ filters: next });
    },
    onColumnVisibilityChange(updater) {
      const next = functionalUpdate(updater, columnVisibility); setColumnVisibility(next); emitLayout({ columnVisibility: next });
    },
    onColumnPinningChange(updater) {
      const next = functionalUpdate(updater, columnPinning); setColumnPinning(next);
      emitLayout({ columnPinning: { left: next.left ?? [], right: next.right ?? [] } });
    },
    onColumnOrderChange(updater) {
      const next = functionalUpdate(updater, columnOrder); setColumnOrder(next); emitLayout({ columnOrder: next });
    },
    onColumnSizingChange(updater) {
      const next = functionalUpdate(updater, columnSizing); setColumnSizing(next); emitLayout({ columnSizing: next });
    },
    columnResizeMode: 'onChange',
  });

  const modelRows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const activeIndex = modelRows.findIndex((row) => row.id === active.rowId);
  const modelSignature = modelRows.map((row) => row.id).join('\u0000');
  const columnSignature = visibleColumns.map((column) => column.id).join('\u0000');
  const rowVirtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    initialRect: { width: 960, height: 320 },
    observeElementRect(instance, callback) {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => {
        const rect = element.getBoundingClientRect();
        callback({
          width: rect.width || element.clientWidth || 960,
          height: rect.height || element.clientHeight || 320,
        });
      };
      const observer = new ResizeObserver(report);
      observer.observe(element);
      report();
      return () => observer.disconnect();
    },
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !indexes.includes(activeIndex)) indexes.push(activeIndex);
      return indexes.sort((left, right) => left - right);
    },
    scrollToFn(offset, options, instance) {
      const element = instance.scrollElement;
      if (!element) return;
      if (typeof element.scrollTo === 'function') element.scrollTo({ top: offset, behavior: options.behavior });
      else element.scrollTop = offset;
    },
  });

  useEffect(() => {
    const observer = new MutationObserver(() => setRowHeight(readRowHeight()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-density', 'style'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => rowVirtualizer.measure(), [rowHeight, rowVirtualizer]);
  useEffect(() => {
    const trackFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target === document.body) return;
      activeCellOwnsFocus.current = target instanceof HTMLElement
        && Boolean(scrollRef.current?.contains(target)) && target.getAttribute('role') === 'gridcell';
    };
    document.addEventListener('focusin', trackFocus);
    return () => document.removeEventListener('focusin', trackFocus);
  }, []);

  const visibleIds = useMemo(() => new Set(modelRows.map((row) => row.id)), [modelRows]);
  useLayoutEffect(() => {
    const next = new Set([...selectedRowIds].filter((id) => visibleIds.has(id)));
    if (!sameSet(next, selectedRowIds)) onSelectionChange(next);
  }, [onSelectionChange, selectedRowIds, visibleIds]);

  useEffect(() => {
    setSorting(layout.sorting);
    setColumnFilters(layout.filters);
    setColumnVisibility(layout.columnVisibility);
    setColumnPinning(layout.columnPinning);
    setColumnOrder(layout.columnOrder);
    setColumnSizing(layout.columnSizing);
  }, [layout]);

  const commitActive = (next: ActiveCellState) => {
    activeRef.current = next;
    setActive(next);
    setStoredActive(tab, next);
  };

  const scheduleCellFocus = (rowId: string, columnId: string) => {
    const sequence = ++focusSequence.current;
    if (!activeCellOwnsFocus.current) return;
    requestAnimationFrame(() => {
      if (sequence !== focusSequence.current) return;
      scrollRef.current?.querySelector<HTMLElement>(
        `[data-row-id="${CSS.escape(rowId)}"] [data-column-id="${CSS.escape(columnId)}"]`,
      )?.focus();
    });
  };

  const activate = (rowIndex: number, columnIndex: number, anchorRowId: string | null = activeRef.current.anchorRowId) => {
    if (!modelRows.length || !visibleColumns.length) return;
    const boundedRow = Math.max(0, Math.min(modelRows.length - 1, rowIndex));
    const boundedColumn = Math.max(0, Math.min(visibleColumns.length - 1, columnIndex));
    const next = { rowId: modelRows[boundedRow].id, columnId: visibleColumns[boundedColumn].id, anchorRowId };
    commitActive(next);
    rowVirtualizer.scrollToIndex(boundedRow, { align: 'auto' });
    scheduleCellFocus(next.rowId, next.columnId);
  };

  useLayoutEffect(() => {
    const tabChanged = previousTab.current !== tab;
    const focusChanged = previousFocusedIdentity.current !== focusedIdentity;
    previousTab.current = tab;
    previousFocusedIdentity.current = focusedIdentity;
    const currentActive = activeRef.current;
    if (!modelRows.length || !visibleColumns.length) {
      if (currentActive.rowId || currentActive.columnId) {
        const next = { rowId: '', columnId: '', anchorRowId: null };
        commitActive(next);
      }
      const sequence = ++focusSequence.current;
      if (activeCellOwnsFocus.current) requestAnimationFrame(() => {
        if (sequence === focusSequence.current) scrollRef.current?.focus();
      });
      return;
    }

    const focusedIndex = focusedIdentity
      ? modelRows.findIndex((row) => row.original.chartIdentity === focusedIdentity)
      : -1;
    const restoredIndex = restoredActive
      ? modelRows.findIndex((row) => row.id === restoredActive.rowId)
      : -1;
    const currentIndex = modelRows.findIndex((row) => row.id === currentActive.rowId);
    const preferFocused = focusedIndex >= 0 && (focusChanged || tabChanged || currentIndex < 0);
    const rowIndex = preferFocused
      ? focusedIndex
      : tabChanged && restoredIndex >= 0
        ? restoredIndex
        : currentIndex >= 0 ? currentIndex : 0;
    const preferredColumn = tabChanged ? restoredActive?.columnId : currentActive.columnId;
    const columnIndex = Math.max(0, visibleColumns.findIndex((column) => column.id === preferredColumn));
    const next = {
      rowId: modelRows[rowIndex].id,
      columnId: visibleColumns[columnIndex].id,
      anchorRowId: currentActive.anchorRowId && modelRows.some((row) => row.id === currentActive.anchorRowId)
        ? currentActive.anchorRowId
        : null,
    };
    if (next.rowId !== currentActive.rowId || next.columnId !== currentActive.columnId || next.anchorRowId !== currentActive.anchorRowId) {
      commitActive(next);
    }
    rowVirtualizer.scrollToIndex(rowIndex, { align: 'auto' });
    scheduleCellFocus(next.rowId, next.columnId);
  // Restored state is consumed when tab changes; including it here would reconcile against our own active-cell writes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnSignature, focusedIdentity, modelSignature, rowVirtualizer, setStoredActive, tab]);

  const reveal = (rowId: string, focus: boolean) => {
    const rowIndex = modelRows.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) return;
    const columnIndex = Math.max(0, visibleColumns.findIndex((column) => column.id === activeRef.current.columnId));
    if (focus) activeCellOwnsFocus.current = true;
    activate(rowIndex, columnIndex);
  };

  useImperativeHandle(forwardedRef, () => ({
    revealRow: (rowId) => reveal(rowId, false),
    focusRow: (rowId) => reveal(rowId, true),
    getFilteredRows: () => table.getRowModel().rows.map((row) => row.original),
    getVisibleColumnIds: () => table.getVisibleLeafColumns().map((column) => column.id),
  }));

  useEffect(() => {
    if (focusedIdentity) reveal(focusedIdentity, false);
  // Tab changes must replay shared focus; model reconciliation handles sort/filter/layout updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIdentity, tab]);

  const updateSelection = (next: Set<string>) => {
    selectionRef.current = next;
    onSelectionChange(next);
  };
  const toggleRow = (rowId: string) => {
    const next = new Set(selectionRef.current);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    updateSelection(next);
  };
  const selectRange = (targetIndex: number) => {
    const currentActive = activeRef.current;
    const anchorId = currentActive.anchorRowId ?? currentActive.rowId;
    const anchorIndex = Math.max(0, modelRows.findIndex((row) => row.id === anchorId));
    const [start, end] = [anchorIndex, targetIndex].sort((left, right) => left - right);
    const next = new Set(selectionRef.current);
    for (let index = start; index <= end; index += 1) next.add(modelRows[index].id);
    updateSelection(next);
    return anchorId;
  };

  const onCellKeyDown = (event: KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number) => {
    const logicalRow = modelRows.findIndex((row) => row.id === activeRef.current.rowId);
    const logicalColumn = visibleColumns.findIndex((column) => column.id === activeRef.current.columnId);
    const currentRow = logicalRow >= 0 ? logicalRow : rowIndex;
    const currentColumn = logicalColumn >= 0 ? logicalColumn : columnIndex;
    let nextRow = currentRow;
    let nextColumn = currentColumn;
    if (event.key === 'ArrowUp') nextRow -= 1;
    else if (event.key === 'ArrowDown') nextRow += 1;
    else if (event.key === 'ArrowLeft') nextColumn -= 1;
    else if (event.key === 'ArrowRight') nextColumn += 1;
    else if (event.key === 'Home') { nextRow = event.ctrlKey ? 0 : currentRow; nextColumn = 0; }
    else if (event.key === 'End') { nextRow = event.ctrlKey ? modelRows.length - 1 : currentRow; nextColumn = visibleColumns.length - 1; }
    else if (event.key === ' ') { event.preventDefault(); toggleRow(modelRows[currentRow].id); return; }
    else if (event.key === 'Enter') {
      const identity = modelRows[currentRow].original.chartIdentity;
      if (identity) onFocusIdentity(identity);
      return;
    } else return;
    event.preventDefault();
    nextRow = Math.max(0, Math.min(modelRows.length - 1, nextRow));
    const anchor = event.shiftKey && nextRow !== currentRow ? selectRange(nextRow) : null;
    activate(nextRow, nextColumn, anchor);
  };

  const filterValue = (id: string, value: unknown): string => {
    if (BOOLEAN_FILTER_COLUMNS.has(id)) return typeof value === 'boolean' ? String(value) : '';
    if (NUMERIC_FILTER_COLUMNS.has(id) && Array.isArray(value)) return `${value[0] ?? ''}..${value[1] ?? ''}`;
    if (Array.isArray(value)) return value.join(',');
    return value === undefined || value === null ? '' : String(value);
  };
  const setFilter = (id: string, raw: string, update: (value: unknown) => void) => {
    if (!raw) { update(undefined); return; }
    if (BOOLEAN_FILTER_COLUMNS.has(id)) { update(raw === 'true'); return; }
    if (NUMERIC_FILTER_COLUMNS.has(id)) {
      const [minimum, maximum] = raw.split('..');
      update([
        minimum === '' ? null : Number(minimum),
        maximum === undefined || maximum === '' ? null : Number(maximum),
      ]);
      return;
    }
    update(raw.includes(',') ? raw.split(',').map((token) => token.trim()).filter(Boolean) : raw);
  };

  return <div ref={scrollRef} className="chart-data-grid" role="grid" tabIndex={modelRows.length ? -1 : 0}
    aria-rowcount={modelRows.length + 1} aria-colcount={visibleColumns.length}>
    <div className="chart-data-grid__header" role="row" style={{ width: table.getTotalSize() }}>
      {table.getHeaderGroups()[0]?.headers.map((header, columnIndex) => <div key={header.id} role="columnheader"
        aria-colindex={columnIndex + 1} aria-label={String(header.column.columnDef.header ?? header.column.id)}
        data-pinned={header.column.getIsPinned() || undefined}
        style={{ width: header.getSize(), ...pinnedStyle(header.column) }}>
        <div className="chart-data-grid__header-label">
          {header.column.getCanSort() ? <button type="button" aria-label={`${sortLabel} ${String(header.column.columnDef.header ?? header.column.id)}`}
            onClick={header.column.getToggleSortingHandler()}>
            {flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getIsSorted() === 'asc' ? <ArrowUp size={12} /> : header.column.getIsSorted() === 'desc' ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
          </button> : flexRender(header.column.columnDef.header, header.getContext())}
        </div>
        {header.column.getCanFilter() && (BOOLEAN_FILTER_COLUMNS.has(header.column.id)
          ? <select className="chart-data-grid__filter" aria-label={`${filterLabel} ${String(header.column.columnDef.header ?? header.column.id)}`}
            value={filterValue(header.column.id, header.column.getFilterValue())}
            onChange={(event) => setFilter(header.column.id, event.target.value, header.column.setFilterValue)}>
            <option value="">*</option><option value="true">true</option><option value="false">false</option>
          </select>
          : <input className="chart-data-grid__filter" aria-label={`${filterLabel} ${String(header.column.columnDef.header ?? header.column.id)}`}
            inputMode={NUMERIC_FILTER_COLUMNS.has(header.column.id) ? 'decimal' : 'search'}
            value={filterValue(header.column.id, header.column.getFilterValue())}
            onChange={(event) => setFilter(header.column.id, event.target.value, header.column.setFilterValue)} />)}
      </div>)}
    </div>
    <div className="chart-data-grid__body" style={{ height: rowVirtualizer.getTotalSize(), width: table.getTotalSize(), position: 'relative' }}>
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = modelRows[virtualRow.index];
        const selected = selectedRowIds.has(row.id);
        const focused = row.original.chartIdentity === focusedIdentity;
        return <div key={row.id} role="row" data-row-id={row.id} data-selected={selected || undefined}
          data-focused={focused || undefined} aria-rowindex={virtualRow.index + 2}
          className="chart-data-grid__row" style={{ position: 'absolute', transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size, width: table.getTotalSize() }}>
          {row.getVisibleCells().map((cell, columnIndex) => {
            const isActive = active.rowId === row.id && active.columnId === cell.column.id;
            return <div key={cell.id} role="gridcell" aria-colindex={columnIndex + 1} tabIndex={isActive ? 0 : -1}
              data-column-id={cell.column.id} data-active={isActive || undefined} data-pinned={cell.column.getIsPinned() || undefined}
              style={{ width: cell.column.getSize(), ...pinnedStyle(cell.column) }}
              onFocus={() => activate(virtualRow.index, columnIndex)}
              onKeyDown={(event) => onCellKeyDown(event, virtualRow.index, columnIndex)}>
              {cell.column.id === 'selected'
                ? <input type="checkbox" tabIndex={-1} checked={selected} aria-label={`${selectLabel} ${row.id}`} onChange={() => toggleRow(row.id)} />
                : String(cell.getValue<MachineValue>() ?? '')}
            </div>;
          })}
        </div>;
      })}
    </div>
  </div>;
});
