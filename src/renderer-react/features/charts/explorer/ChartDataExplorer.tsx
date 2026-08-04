import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { useChartWorkspace } from '../../../stores/chartWorkspace';
import type { ComparisonMode, ExplorerTab, TabLayoutV1 } from '../../../stores/chartWorkspacePersistence';
import type { ChartType, NormalizedChartResult } from '../contracts';
import type { ChartSelectionTarget } from '../svg/chartSelection';
import { ChartDataGrid, type ChartDataGridHandle } from './ChartDataGrid';
import { columnsFor } from './explorerColumns';
import {
  aspectRows,
  comparisonRows,
  distributionRows,
  houseRows,
  planetRows,
  strategyMetadataRows,
  type ExplorerRow,
} from './explorerRows';

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

  return <section className="chart-data-explorer" aria-label="Chart data explorer">
    <div className="chart-data-explorer__tabs" role="tablist" aria-label="Explorer views">
      {TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab}
        aria-controls={`chart-explorer-panel-${tab}`} onClick={() => chooseTab(tab)}>{tab}</button>)}
    </div>
    <div className="chart-data-explorer__toolbar">
      {activeTab === 'comparison' && result.rings.length >= 2 && <div className="chart-data-explorer__modes" aria-label="Comparison mode">
        {MODES.map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => chooseMode(item)}>{item}</button>)}
      </div>}
      <output aria-live="polite">{selected.length ? `${selected.length} selected` : ''}</output>
    </div>
    <div id={`chart-explorer-panel-${activeTab}`} role="tabpanel" className="chart-data-explorer__panel">
      {activeTab === 'comparison' && result.rings.length < 2
        ? <p role="status">Comparison unavailable: two rings are required.</p>
        : <ChartDataGrid ref={gridRef} tab={activeTab} rows={rows} columns={columns}
          layout={tableLayout.tabs[activeTab]} selectedRowIds={new Set(selected)} focusedIdentity={focusedIdentity}
          onLayoutChange={updateTabLayout} onSelectionChange={(ids) => setBulkSelection([...ids])}
          onFocusIdentity={(identity) => setFocus(identity)} />}
    </div>
  </section>;
});
