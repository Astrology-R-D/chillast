import { ChevronLeft, ChevronRight, ClipboardCopy, Columns3, Eye, EyeOff, FileDown } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { useChartWorkspace } from '../../../stores/chartWorkspace';
import type { ComparisonMode, ExplorerTab, TabLayoutV1 } from '../../../stores/chartWorkspacePersistence';
import type { ChartType, NormalizedChartResult } from '../contracts';
import type { ChartSelectionTarget } from '../svg/chartSelection';
import { ChartDataGrid, type ChartDataGridHandle } from './ChartDataGrid';
import { columnIds, columnsFor } from './explorerColumns';
import {
  aspectRows,
  comparisonRows,
  distributionRows,
  houseRows,
  planetRows,
  strategyMetadataRows,
  type ExplorerRow,
} from './explorerRows';
import { copyExplorerData, downloadCsv, selectExportRows, type ExportColumn } from './tabularExport';

const TABS: ExplorerTab[] = ['planets', 'houses', 'aspects', 'distributions', 'comparison'];
const MODES: ComparisonMode[] = ['merged', 'sideBySide', 'difference'];

export interface ChartDataExplorerHandle {
  revealSelection(target: ChartSelectionTarget): void;
}

function rowsFor(result: NormalizedChartResult, tab: ExplorerTab, mode: ComparisonMode): ExplorerRow[] {
  if (tab === 'planets') return planetRows(result);
  if (tab === 'houses') return houseRows(result);
  if (tab === 'aspects') return aspectRows(result);
  if (tab === 'distributions') return [...distributionRows(result), ...strategyMetadataRows(result)];
  return comparisonRows(result, mode);
}

export const ChartDataExplorer = forwardRef<ChartDataExplorerHandle, {
  result: NormalizedChartResult;
  chartType: ChartType;
}>(function ChartDataExplorer({ result, chartType }, forwardedRef) {
  const { t } = useI18n();
  const gridRef = useRef<ChartDataGridHandle>(null);
  const [exportStatus, setExportStatus] = useState('');
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const pendingReveal = useRef<ChartSelectionTarget | null>(null);
  const tableLayout = useChartWorkspace((state) => state.workspace.tableLayouts[chartType]);
  const selected = useChartWorkspace((state) => state.bulkSelection);
  const focusedIdentity = useChartWorkspace((state) => state.focusedIdentity);
  const setActiveTab = useChartWorkspace((state) => state.setActiveTab);
  const setComparisonMode = useChartWorkspace((state) => state.setComparisonMode);
  const setTableLayout = useChartWorkspace((state) => state.setTableLayout);
  const setBulkSelection = useChartWorkspace((state) => state.setBulkSelection);
  const setFocus = useChartWorkspace((state) => state.setFocus);
  const activeTab = tableLayout.activeTab;
  const mode = tableLayout.comparisonMode;
  const rows = useMemo(() => rowsFor(result, activeTab, mode), [activeTab, mode, result]);
  const labels = useMemo(() => new Proxy<Record<string, string>>({}, {
    get: (_target, key) => t(`chart.explorer.columns.${String(key)}`),
  }), [t]);
  const columns = useMemo(() => columnsFor(activeTab, mode, labels), [activeTab, labels, mode]);

  const updateTable = (patch: Partial<typeof tableLayout>) => {
    setTableLayout(chartType, { ...tableLayout, ...patch });
  };
  const chooseTab = (tab: ExplorerTab) => {
    setActiveTab(tab);
    updateTable({ activeTab: tab });
  };
  const chooseMode = (next: ComparisonMode) => {
    setComparisonMode(next);
    updateTable({ comparisonMode: next });
  };
  const updateTabLayout = (layout: TabLayoutV1) => {
    setTableLayout(chartType, { ...tableLayout, tabs: { ...tableLayout.tabs, [activeTab]: layout } });
  };
  const exportData = () => {
    const exportColumns: ExportColumn[] = (gridRef.current?.getVisibleColumnIds() ?? [])
      .filter((id) => id !== 'selected')
      .map((id) => ({ id, visible: true }));
    const filteredRows = gridRef.current?.getFilteredRows() ?? [];
    return { exportColumns, exportRows: selectExportRows(filteredRows, new Set(selected)) };
  };
  const copy = async () => {
    const { exportColumns, exportRows } = exportData();
    try {
      await copyExplorerData(exportColumns, exportRows);
      setExportStatus(t('chart.explorer.copied'));
    } catch {
      setExportStatus(t('chart.explorer.copyFailed'));
    }
  };
  const csv = () => {
    const { exportColumns, exportRows } = exportData();
    downloadCsv(exportColumns, exportRows, `${chartType}-${activeTab}.csv`);
    setExportStatus(t('chart.explorer.csvDownloaded'));
  };
  const layoutColumns = columnIds(activeTab, mode);
  const orderedColumns = tableLayout.tabs[activeTab].columnOrder.length
    ? [...tableLayout.tabs[activeTab].columnOrder, ...layoutColumns.filter((id) => !tableLayout.tabs[activeTab].columnOrder.includes(id))]
    : layoutColumns;
  const patchActiveLayout = (patch: Partial<TabLayoutV1>) => updateTabLayout({ ...tableLayout.tabs[activeTab], ...patch });
  const moveColumn = (id: string, direction: -1 | 1) => {
    const order = [...orderedColumns];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    patchActiveLayout({ columnOrder: order });
  };
  const pinColumn = (id: string, position: '' | 'left' | 'right') => {
    const pinning = tableLayout.tabs[activeTab].columnPinning;
    patchActiveLayout({ columnPinning: {
      left: [...pinning.left.filter((entry) => entry !== id), ...(position === 'left' ? [id] : [])],
      right: [...pinning.right.filter((entry) => entry !== id), ...(position === 'right' ? [id] : [])],
    } });
  };

  useImperativeHandle(forwardedRef, () => ({
    revealSelection(target) {
      if (target.tab === activeTab) {
        setActiveTab(target.tab);
        gridRef.current?.revealRow(target.identity);
        gridRef.current?.focusRow(target.identity);
        return;
      }
      pendingReveal.current = target;
      chooseTab(target.tab);
    },
  }));

  useEffect(() => {
    const target = pendingReveal.current;
    if (!target || target.tab !== activeTab) return;
    pendingReveal.current = null;
    gridRef.current?.revealRow(target.identity);
    gridRef.current?.focusRow(target.identity);
  }, [activeTab, rows]);

  return <section className="chart-data-explorer" aria-label={t('chart.explorer.label')}>
    <div className="chart-data-explorer__tabs" role="tablist" aria-label={t('chart.explorer.views')}>
      {TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab}
        aria-controls={`chart-explorer-panel-${tab}`} onClick={() => chooseTab(tab)}>{t(`chart.explorer.tabs.${tab}`)}</button>)}
    </div>
    <div className="chart-data-explorer__toolbar">
      <button type="button" onClick={() => void copy()} aria-label={t('chart.explorer.copy')}><ClipboardCopy size={15} />{t('chart.explorer.copy')}</button>
      <button type="button" onClick={csv} aria-label={t('chart.explorer.csv')}><FileDown size={15} />{t('chart.explorer.csv')}</button>
      <button type="button" aria-expanded={columnMenuOpen} aria-label={t('chart.explorer.columnMenu')}
        onClick={() => setColumnMenuOpen((open) => !open)}><Columns3 size={15} />{t('chart.explorer.columnMenu')}</button>
      {activeTab === 'comparison' && result.rings.length >= 2 && <div className="chart-data-explorer__modes" aria-label={t('chart.explorer.comparisonMode')}>
        {MODES.map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => chooseMode(item)}>{t(`chart.explorer.modes.${item}`)}</button>)}
      </div>}
      <output aria-live="polite">{exportStatus || (selected.length ? t('chart.explorer.selectedCount', { count: selected.length }) : '')}</output>
    </div>
    {columnMenuOpen && <div className="chart-data-explorer__column-menu" role="group" aria-label={t('chart.explorer.columnMenu')}>
      {orderedColumns.filter((id) => id !== 'selected').map((id, index) => {
        const visible = tableLayout.tabs[activeTab].columnVisibility[id] !== false;
        const pinning = tableLayout.tabs[activeTab].columnPinning;
        const pinned = pinning.left.includes(id) ? 'left' : pinning.right.includes(id) ? 'right' : '';
        return <div key={id} className="chart-data-explorer__column-row">
          <code>{id}</code>
          <button type="button" aria-label={`${t(visible ? 'chart.explorer.hide' : 'chart.explorer.show')} ${id}`}
            onClick={() => patchActiveLayout({ columnVisibility: { ...tableLayout.tabs[activeTab].columnVisibility, [id]: !visible } })}>
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <select aria-label={`${t('chart.explorer.pinNone')} ${id}`} value={pinned} onChange={(event) => pinColumn(id, event.target.value as '' | 'left' | 'right')}>
            <option value="">{t('chart.explorer.pinNone')}</option><option value="left">{t('chart.explorer.pinLeft')}</option><option value="right">{t('chart.explorer.pinRight')}</option>
          </select>
          <button type="button" disabled={index === 0} aria-label={`${t('chart.explorer.moveLeft')} ${id}`} onClick={() => moveColumn(id, -1)}><ChevronLeft size={14} /></button>
          <button type="button" disabled={index === orderedColumns.length - 2} aria-label={`${t('chart.explorer.moveRight')} ${id}`} onClick={() => moveColumn(id, 1)}><ChevronRight size={14} /></button>
          <input type="number" min="48" max="480" aria-label={`${t('chart.explorer.size')} ${id}`}
            value={tableLayout.tabs[activeTab].columnSizing[id] ?? ''} onChange={(event) => patchActiveLayout({ columnSizing: {
              ...tableLayout.tabs[activeTab].columnSizing, [id]: Number(event.target.value) || 96,
            } })} />
        </div>;
      })}
    </div>}
    <div id={`chart-explorer-panel-${activeTab}`} role="tabpanel" className="chart-data-explorer__panel">
      {activeTab === 'comparison' && result.rings.length < 2
        ? <p role="status">{t('chart.explorer.comparisonUnavailable')}</p>
        : <ChartDataGrid ref={gridRef} tab={activeTab} rows={rows} columns={columns}
          layout={tableLayout.tabs[activeTab]} selectedRowIds={new Set(selected)} focusedIdentity={focusedIdentity}
          onLayoutChange={updateTabLayout} onSelectionChange={(ids) => setBulkSelection([...ids])}
          onFocusIdentity={(identity) => setFocus(identity)} sortLabel={t('chart.explorer.sort')}
          filterLabel={t('chart.explorer.filter')} selectLabel={t('chart.explorer.columns.selected')} />}
    </div>
  </section>;
});
