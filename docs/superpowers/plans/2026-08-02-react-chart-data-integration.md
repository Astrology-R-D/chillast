# React Chart Data Explorer and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the western chart workbench with professional virtualized explorers, comparison/copy/CSV behavior, bidirectional chart linkage, stable AI context, genuine Electron workflows, responsive visual coverage, and packaged release verification.

**Architecture:** Pure row adapters derive stable machine-readable explorer records from the plan-1 normalized result and retain strategy metadata. TanStack Table owns sort/filter/column models while TanStack Virtual owns visible rows; Zustand persists per-exact-type layouts and owns transient active/bulk/focused selection. One integration layer connects chart focus, table reveal, export serializers, and last-successful AI context without allowing draft, late, failed, cancelled, or malformed responses to replace accepted data.

**Tech Stack:** React 19, TypeScript, Zustand 5, TanStack Table 8, TanStack Virtual 3, TanStack Query 5, Electron 42, Swiss Ephemeris, Vitest, React Testing Library, Node test runner, Electron nativeImage smoke checks, electron-builder

---

## Dependencies and Completion Boundary

This is plan 4 of 4. It requires plans 1-3 complete and consumes their exact
contracts, store, result shell, and `InteractiveChart` linkage callback. This
plan is the integration/release increment; it may extend the real Electron smoke
and package scripts but must not switch the default renderer or remove legacy
code, because that cutover belongs to the parent redesign sequence.

The completed workbench calculates all 20 types, renders and links SVG/table
data, exports clipboard/CSV/SVG, publishes accurate AI context, survives trusted
IPC failures and close handshake, and passes the required 24-screenshot matrix.

## File Map

- Modify `package.json` and `package-lock.json`: add TanStack Table and Virtual and chart-specific verification scripts.
- Create `src/renderer-react/features/charts/explorer/explorerRows.ts`: planets/houses/aspects/distributions/comparison/metadata row adapters.
- Create `src/renderer-react/features/charts/explorer/explorerRows.test.ts`: stable IDs, all modes, `-180`, null, and metadata retention.
- Create `src/renderer-react/features/charts/explorer/explorerColumns.tsx`: stable nonlocalized column IDs and typed definitions.
- Create `src/renderer-react/features/charts/explorer/explorerColumns.test.tsx`: exact IDs/values/filter availability.
- Create `src/renderer-react/features/charts/explorer/ChartDataGrid.tsx`: Table/Virtual grid, sort/multifilter/pin/hide/order/size/keyboard/selection.
- Create `src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx`: complete grid and virtualization behavior.
- Create `src/renderer-react/features/charts/explorer/ChartDataExplorer.tsx`: tabs, comparison modes, layout persistence, linkage, metadata sections.
- Create `src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx`: tabs, unavailable comparison, saved 20-token layouts, reveal/focus linkage.
- Modify `src/renderer-react/stores/chartWorkspacePersistence.ts`: validate known per-tab column IDs and reset only invalid layouts.
- Modify `src/renderer-react/stores/chartWorkspacePersistence.test.ts`: all 20 independent layouts and invalid recovery.
- Modify `src/renderer-react/stores/chartWorkspace.ts`: active cell and visible bulk selection pruning.
- Create `src/renderer-react/features/charts/explorer/tabularExport.ts`: exact tab-delimited and RFC 4180 CSV serializers/download.
- Create `src/renderer-react/features/charts/explorer/tabularExport.test.ts`: exact bytes, headers, filters, selected rows, quoting, CRLF, BOM.
- Create `src/renderer-react/features/charts/context/chartAiContext.ts`: accepted-result/stale/focus context producer.
- Create `src/renderer-react/features/charts/context/chartAiContext.test.ts`: success-only replacement and stale labeling.
- Modify `src/renderer-react/api/contracts.ts`, `types/myst-api.d.ts`, `api/client.ts`, and `api/client.test.ts`: typed AI chart-context publishing through existing `ai:setContext`.
- Modify `src/renderer-react/features/charts/workbench/ChartResultShell.tsx` and `ChartWorkbenchPage.tsx`: explorer/linkage/context integration.
- Modify `src/renderer-react/features/charts/workbench/charts.css`: dense virtual grid and responsive explorer.
- Modify `locale/zh.json` and `src/renderer-react/shell/locale.test.ts`: explorer/export/comparison/accessibility labels.
- Create `tests/ChartWorkbenchSmokeFixtures.js`: deterministic real single/dual chart inputs and delayed trusted service wrapper.
- Modify `tests/SmokeReactRenderer.js`: genuine real preload/router/profile/Swiss chart flow, overlap/cancellation, all exports, failure retention, intent, parser rejection, security, and close handshake.
- Modify `tests/NativeImageMetrics.js` and create `tests/ChartVisualMetrics.test.js`: central pixels, distinct colors, layer deltas, and geometry helpers.
- Modify `tests/VerifyPackage.js`, `tests/SmokePackagedRenderer.js`, and `package.json`: React chart assets, Swiss module/data, source/package verification.

### Task 1: Install TanStack Table and Virtual

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer-react/build-configuration.test.ts`

- [ ] **Step 1: Write a failing direct-dependency assertion**

Add:

```ts
it('declares the professional chart grid engines', () => {
  expect(packageJson.dependencies).toMatchObject({
    '@tanstack/react-table': expect.any(String),
    '@tanstack/react-virtual': expect.any(String),
  });
});
```

- [ ] **Step 2: Run test and verify both keys are absent**

Run: `npm run test:renderer -- src/renderer-react/build-configuration.test.ts`

Expected: FAIL naming both missing dependencies.

- [ ] **Step 3: Install the proven engines**

Run:

```powershell
npm install @tanstack/react-table @tanstack/react-virtual
```

Expected: exit 0 and lockfile resolves one compatible version of each.

- [ ] **Step 4: Run focused test and commit**

Run: `npm run test:renderer -- src/renderer-react/build-configuration.test.ts`

Expected: PASS.

```powershell
git add package.json package-lock.json src/renderer-react/build-configuration.test.ts
git commit -m "build(charts): add explorer table engines"
```

### Task 2: Derive Stable Explorer and Comparison Rows

**Files:**
- Create: `src/renderer-react/features/charts/explorer/explorerRows.ts`
- Create: `src/renderer-react/features/charts/explorer/explorerRows.test.ts`

- [ ] **Step 1: Write failing row and comparison tests**

Using one-ring and two-ring normalized fixtures, assert planet rows use
ring-qualified point ID and machine fields (`ring`, `point`, `longitude`,
`sign`, `house`, `retrograde`); houses use `house:index`; aspects preserve
normalized aspect IDs and orb; distributions include element/modality and
structured firdaria/profection rows.

Assert comparison modes:

```ts
const twoRingMissingMoon = makeResult({
  rings: [
    ring('natal', [point('sun', 10), point('moon', 20)]),
    ring('transit', [point('sun', 350)]),
  ],
});
expect(comparisonRows(twoRing, 'merged').map((row) => row.id))
  .toEqual(['natal:sun', 'natal:moon', 'transit:sun', 'transit:moon']);
expect(comparisonRows(twoRing, 'sideBySide')[0]).toMatchObject({
  id: 'comparison:sun', values: { point: 'sun', firstLongitude: 10, secondLongitude: 350 },
});
expect(shortestSignedDelta(0, 180)).toBe(-180);
expect(shortestSignedDelta(350, 10)).toBe(20);
expect(shortestSignedDelta(10, 350)).toBe(-20);
expect(comparisonRows(twoRingMissingMoon, 'difference').find((row) => row.id === 'comparison:moon')?.values)
  .toMatchObject({ secondLongitude: null, longitudeDelta: null });
```

Sort present/missing values ascending and descending through exported
`compareNullableNumbers` and assert missing always last. Assert unknown
`meta.strategyFacts = { score: 3 }` remains in summary metadata rows.

- [ ] **Step 2: Run test and verify missing module**

Run: `npm run test:renderer -- src/renderer-react/features/charts/explorer/explorerRows.test.ts`

Expected: FAIL with unresolved `explorerRows`.

- [ ] **Step 3: Define the row vocabulary and adapters**

Create these exact public types/functions:

```ts
export type MachineValue = string | number | boolean | null;
export interface ExplorerRow { id: string; chartIdentity: ChartIdentity | null; values: Record<string, MachineValue>; metadata?: unknown }
export function planetRows(result: NormalizedChartResult): ExplorerRow[];
export function houseRows(result: NormalizedChartResult): ExplorerRow[];
export function aspectRows(result: NormalizedChartResult): ExplorerRow[];
export function distributionRows(result: NormalizedChartResult): ExplorerRow[];
export function comparisonRows(result: NormalizedChartResult, mode: ComparisonMode): ExplorerRow[];
export function strategyMetadataRows(result: NormalizedChartResult): ExplorerRow[];
export function shortestSignedDelta(first: number, second: number): number;
export function compareNullableNumbers(left: number | null, right: number | null, descending: boolean): number;
```

Implement circular delta exactly
`((second - first + 540) % 360) - 180`. Use ordinary second-minus-first for
non-circular numeric values. Side-by-side/difference pair by exact point key in
service ring order. Missing side and every derived delta are explicit null.
Merged rows include stable ring ID/label. Retain `meta.firdaria`,
`meta.profection`, return/progression fields, and unknown metadata objects.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/explorerRows.test.ts
npm run typecheck
```

Expected: exact row IDs/math/metadata tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer-react/features/charts/explorer/explorerRows.ts src/renderer-react/features/charts/explorer/explorerRows.test.ts
git commit -m "feat(charts): derive explorer comparison data"
```

### Task 3: Define Stable Columns and Per-Type Layout Validation

**Files:**
- Create: `src/renderer-react/features/charts/explorer/explorerColumns.tsx`
- Create: `src/renderer-react/features/charts/explorer/explorerColumns.test.tsx`
- Modify: `src/renderer-react/stores/chartWorkspacePersistence.ts`
- Modify: `src/renderer-react/stores/chartWorkspacePersistence.test.ts`

- [ ] **Step 1: Write failing column and 20-layout tests**

Assert stable nonlocalized IDs by tab:

```ts
expect(columnIds('planets')).toEqual(['selected', 'ring', 'point', 'longitude', 'sign', 'degreeInSign', 'house', 'retrograde']);
expect(columnIds('houses')).toEqual(['selected', 'house', 'cuspLongitude', 'sign', 'degreeInSign']);
expect(columnIds('aspects')).toEqual(['selected', 'ringA', 'point1', 'aspect', 'ringB', 'point2', 'orb', 'strength']);
expect(columnIds('distributions')).toEqual(['selected', 'section', 'key', 'value', 'startAge', 'endAge']);
```

Assert comparison column IDs differ by mode and include grouped first/second/
delta IDs. Assert planet/sign/house/retrograde and aspect/type/orb filters exist.

Write each of 20 chart token layouts with a distinct `columnSizing.longitude`
value, reload, and assert all restore independently. Inject unknown column into
one type and assert only that exact type/tab resets while other types, recents,
and split values remain equal. Future top-level schema resets only western data.

- [ ] **Step 2: Run tests and verify missing definitions/validation**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/explorerColumns.test.tsx src/renderer-react/stores/chartWorkspacePersistence.test.ts
```

Expected: FAIL because columns are absent and persistence accepts no known-ID map.

- [ ] **Step 3: Implement typed column definitions**

Export:

```ts
export type ChartColumnId = string;
export function columnsFor(tab: ExplorerTab, mode: ComparisonMode, labels: Record<string, string>): ColumnDef<ExplorerRow, MachineValue>[];
export function columnIds(tab: ExplorerTab, mode?: ComparisonMode): string[];
export function allowedColumnIds(): Record<ExplorerTab, ReadonlySet<string>>;
```

Use accessor functions reading `row.values[id]`; localized labels exist only in
headers/cells, never IDs or exports. Set `sortUndefined: 'last'`; use custom
nullable numeric sorting. Add filter functions for token sets, numeric range,
boolean, and substring. `selected` is pinned/non-hideable and contains checkbox.

- [ ] **Step 4: Validate layouts against exact tab/mode columns**

Pass `allowedColumnIds()` into the persistence parser. Drop unknown sorting/
filter/pinning/order/sizing/visibility entries. If a layout has invalid types,
duplicate column order, or pinning the same ID both sides, reset that tab only.
Fill missing tabs/defaults. Keep one layout entry per exact `ChartType`.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/explorerColumns.test.tsx src/renderer-react/stores/chartWorkspacePersistence.test.ts
npm run typecheck
```

Expected: columns and independent layout recovery PASS.

```powershell
git add src/renderer-react/features/charts/explorer/explorerColumns.tsx src/renderer-react/features/charts/explorer/explorerColumns.test.tsx src/renderer-react/stores/chartWorkspacePersistence.ts src/renderer-react/stores/chartWorkspacePersistence.test.ts
git commit -m "feat(charts): persist exact explorer layouts"
```

### Task 4: Build the Virtualized Keyboard Data Grid

**Files:**
- Create: `src/renderer-react/features/charts/explorer/ChartDataGrid.tsx`
- Create: `src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx`
- Modify: `src/renderer-react/stores/chartWorkspace.ts`
- Modify: `src/renderer-react/stores/chartWorkspace.test.ts`

- [ ] **Step 1: Write failing professional-grid tests**

Render 500 rows in a 320px viewport and assert fewer than 40 DOM rows, then call
`revealRow('natal:sun')` and assert virtualizer `scrollToIndex` receives its
post-sort/filter index and active row remains mounted. Test simultaneous sign +
house filters, asc/desc sorting, pin left/right, hide/show, reorder, resize, and
persist callbacks.

Test keyboard grid behavior exactly: arrows move active cell; Home/End row
edges; Ctrl+Home/Ctrl+End first/last grid cell; Space toggles row selection;
Enter calls `onFocusIdentity`; Shift+Arrow extends row range. After sort, bulk
selection remains by row ID. After filter, selected IDs outside filtered row
model are immediately pruned. Focus remains visible after virtual scroll,
sort/filter/layout restore whenever row exists.

- [ ] **Step 2: Run test and verify missing grid**

Run: `npm run test:renderer -- src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx`

Expected: FAIL with unresolved `ChartDataGrid`.

- [ ] **Step 3: Implement the controlled Table/Virtual grid**

Use this ref/props contract:

```ts
export interface ChartDataGridHandle { revealRow(rowId: string): void; focusRow(rowId: string): void }
export interface ChartDataGridProps {
  rows: ExplorerRow[]; columns: ColumnDef<ExplorerRow, MachineValue>[]; layout: TabLayoutV1;
  selectedRowIds: ReadonlySet<string>; focusedIdentity: ChartIdentity | null;
  onLayoutChange(layout: TabLayoutV1): void; onSelectionChange(ids: Set<string>): void;
  onFocusIdentity(identity: ChartIdentity): void;
}
```

Create `useReactTable` with controlled sorting, columnFilters, visibility,
pinning, order, sizing and `getRowId: row => row.id`. Feed the filtered/sorted
row model to `useVirtualizer`, `estimateSize` from density row token, overscan 8,
and `rangeExtractor` that always includes active row index. Render WAI-ARIA grid,
row, columnheader, and gridcell roles with row/column indexes.

- [ ] **Step 4: Implement active-cell and range selection without conflating focus**

Store `{ rowId, columnId, anchorRowId }` as transient active cell state.
Keyboard row focus may call chart `setFocus`; checkbox/range selection only
updates `bulkSelection`. On filtered row model change, intersect selection with
visible IDs synchronously. Sorting does not prune. Tab switch retains chart
focus but each tab maintains its active row/cell transiently.

- [ ] **Step 5: Run grid/store/full tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx src/renderer-react/stores/chartWorkspace.test.ts
npm run test:renderer
npm run typecheck
```

Expected: all grid keyboard/virtualization/state tests PASS without act warnings.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/explorer/ChartDataGrid.tsx src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx src/renderer-react/stores/chartWorkspace.ts src/renderer-react/stores/chartWorkspace.test.ts
git commit -m "feat(charts): add virtual keyboard data grid"
```

### Task 5: Integrate Explorer Tabs and Bidirectional Chart Linkage

**Files:**
- Create: `src/renderer-react/features/charts/explorer/ChartDataExplorer.tsx`
- Create: `src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx`
- Modify: `src/renderer-react/features/charts/workbench/ChartResultShell.tsx`
- Modify: `src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`

- [ ] **Step 1: Write failing tabs/linkage tests**

Assert five persistent tabs always render. One-ring Comparison displays a clear
unavailable state without removing/disable-hiding the tab, including one-ring
composite results with two subjects. Two-ring results support segmented
`merged`, `sideBySide`, `difference` controls.

Click chart `transit:saturn`: active tab becomes Planets and grid reveals exact
row. Click house/aspect: switch/reveal corresponding tab/row. Press Enter on a
row: shared chart focus updates and SVG emphasizes exact ID. User switches tab:
focus remains; returning restores focused row. Failed/cancelled recalculation
retains linkage. Successful result removes missing focus only via store.

Assert firdaria/profection structured rows and unknown metadata summary are
visible/queryable. Hidden chart layers do not remove explorer rows.

- [ ] **Step 2: Run test and verify missing explorer**

Run: `npm run test:renderer -- src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx`

Expected: FAIL with unresolved `ChartDataExplorer`.

- [ ] **Step 3: Compose tabs, rows, columns, and persisted layout**

Implement:

```ts
export interface ChartDataExplorerHandle { revealSelection(target: ChartSelectionTarget): void }
export function ChartDataExplorer(props: { result: NormalizedChartResult; chartType: ChartType }): JSX.Element;
```

Select row adapter by active tab/mode, columns through `columnsFor`, and layout
through exact `workspace.tableLayouts[chartType]`. Persist each controlled model
change immediately. `revealSelection` sets corresponding tab, then after render
calls grid `revealRow(identity)` and `focusRow(identity)`; do not clear focus on
manual tab switches.

- [ ] **Step 4: Wire one bidirectional interface in ResultShell**

Hold explorer ref in `ChartResultShell`. Pass
`onRevealSelection={target => explorerRef.current?.revealSelection(target)}` to
`InteractiveChart`. Render `ChartDataExplorer` in the data pane. Grid Enter calls
the existing `chartWorkspaceStore.getState().setFocus(identity)`. Remove the
plan-2 interim data summary, retaining summary/status header.

- [ ] **Step 5: Run linkage, interaction, and full tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx src/renderer-react/features/charts/svg/InteractiveChart.test.tsx src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx
npm run test:renderer
npm run typecheck
```

Expected: tabs/layout/linkage/metadata and full suites PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/explorer/ChartDataExplorer.tsx src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx src/renderer-react/features/charts/workbench/ChartResultShell.tsx src/renderer-react/features/charts/svg/InteractiveChart.test.tsx
git commit -m "feat(charts): link wheel and data explorer"
```

### Task 6: Add Exact Clipboard and CSV Exports

**Files:**
- Create: `src/renderer-react/features/charts/explorer/tabularExport.ts`
- Create: `src/renderer-react/features/charts/explorer/tabularExport.test.ts`
- Modify: `src/renderer-react/features/charts/explorer/ChartDataExplorer.tsx`
- Modify: `src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx`

- [ ] **Step 1: Write failing exact-byte tests**

Use visible columns `['point','longitude','retrograde','label']`, filtered rows
with selected visible IDs, and assert clipboard exact text:

```ts
expect(toClipboardText(columns, rows)).toBe(
  'point\tlongitude\tretrograde\tlabel\r\n' +
  'sun\t10.25\tfalse\t太阳\r\n',
);
```

Assert no selected visible rows exports all filtered visible rows; hidden
columns and filtered-out rows never export; a stale selected hidden-by-filter ID
does not count as selection. Assert stable lowercase tokens, decimal numbers,
ISO strings, `true`/`false`, blank null.

Assert CSV exact string starts BOM `\uFEFF`, uses CRLF, quotes comma/quote/newline
as RFC 4180 (`"a,b"`, `"a""b"`), preserves non-ASCII, and has no trailing
platform-dependent line ending. Assert download Blob type
`text/csv;charset=utf-8` and URL revocation.

- [ ] **Step 2: Run test and verify missing serializers**

Run: `npm run test:renderer -- src/renderer-react/features/charts/explorer/tabularExport.test.ts`

Expected: FAIL with unresolved `tabularExport`.

- [ ] **Step 3: Implement stable row/column inclusion and serializers**

Export:

```ts
export interface ExportColumn { id: string; visible: boolean }
export function selectExportRows(filteredRows: readonly ExplorerRow[], selectedIds: ReadonlySet<string>): ExplorerRow[];
export function toClipboardText(columns: readonly ExportColumn[], rows: readonly ExplorerRow[]): string;
export function toCsv(columns: readonly ExportColumn[], rows: readonly ExplorerRow[]): string;
export async function copyExplorerData(columns: readonly ExportColumn[], rows: readonly ExplorerRow[]): Promise<void>;
export function downloadCsv(columns: readonly ExportColumn[], rows: readonly ExplorerRow[], filename: string): void;
```

Headers are exact column IDs. End every output row including header with CRLF.
CSV prepends one BOM. Use `navigator.clipboard.writeText`; surface rejection in
the explorer status without clearing selection.

- [ ] **Step 4: Add explorer commands**

Render Copy and CSV icon+text commands with accessible names. Derive rows from
the current filtered row model and columns from visible leaf columns. Use
selected visible rows when intersection is nonempty. Filename is
`${chartType}-${activeTab}.csv`.

- [ ] **Step 5: Run export/explorer tests and commit**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/tabularExport.test.ts src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx
npm run typecheck
```

Expected: exact-byte and UI tests PASS.

```powershell
git add src/renderer-react/features/charts/explorer/tabularExport.ts src/renderer-react/features/charts/explorer/tabularExport.test.ts src/renderer-react/features/charts/explorer/ChartDataExplorer.tsx src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx
git commit -m "feat(charts): copy and export explorer data"
```

### Task 7: Publish Last-Successful AI Chart Context

**Files:**
- Create: `src/renderer-react/features/charts/context/chartAiContext.ts`
- Create: `src/renderer-react/features/charts/context/chartAiContext.test.ts`
- Modify: `src/renderer-react/api/contracts.ts`
- Modify: `src/renderer-react/types/myst-api.d.ts`
- Modify: `src/renderer-react/api/client.ts`
- Modify: `src/renderer-react/api/client.test.ts`
- Modify: `src/renderer-react/features/charts/workbench/ChartWorkbenchPage.tsx`

- [ ] **Step 1: Write failing success-only context tests**

Create a successful accepted result A, then edit draft, fail B, cancel C, feed
late D, and parser-reject E. Assert chart type/result/accepted filters remain A.
Assert stale context is:

```ts
expect(context).toMatchObject({
  kind: 'western-chart', chartType: 'natal', resultId: resultA.resultId,
  draftIsStale: true,
  draftSummary: { label: 'uncalculated', zodiac: 'sidereal' },
  successfulFilters: { zodiac: 'tropical' },
});
```

Revert draft and assert `draftIsStale:false`, `draftSummary:null`. Change chart
focus and assert only `focusedIdentity` changes. Bulk selection is absent unless
`includeSelectedRows:true` is passed, and never replaces `resultId`.

- [ ] **Step 2: Run test and verify missing producer**

Run: `npm run test:renderer -- src/renderer-react/features/charts/context/chartAiContext.test.ts`

Expected: FAIL with unresolved `chartAiContext`.

- [ ] **Step 3: Define and implement the context contract**

Add to API contracts:

```ts
export interface WesternChartAiContext {
  kind: 'western-chart'; resultId: string; chartType: ChartType; subjects: ChartSubject[];
  successfulFilters: SubmittedChartSnapshot; result: NormalizedChartResult;
  focusedIdentity: ChartIdentity | null; draftIsStale: boolean;
  draftSummary: null | { label: 'uncalculated'; type: ChartType; houseSystem: string; zodiac: Zodiac; targetLocal?: string; returnYear?: number; relocationLabel?: string };
  selectedRows?: Array<{ id: string; values: Record<string, string | number | boolean | null> }>;
}
```

Export `buildWesternChartAiContext(state, { includeSelectedRows?, visibleRows? })`;
return null without last success/accepted snapshot. Build successful fields only
from accepted/result; draft fields only under explicitly labeled draftSummary.
When selected rows are requested, copy only each row's stable `id` and machine
`values`; do not put table functions, metadata components, or localized cells in
the preload context contract.

- [ ] **Step 4: Type and parse the existing AI context channel**

Declare `ai.setContext(context: WesternChartAiContext | null): Promise<IpcResult<unknown>>`.
Add `apiClient.setAiChartContext`, forwarding only parsed/constructed context and
requiring a successful envelope. In client tests assert exact forwarding and
malformed envelope rejection. No new IPC channel is added.

- [ ] **Step 5: Publish context from accepted state changes**

In `ChartWorkbenchPage`, subscribe to the minimal Zustand selector containing
accepted result, accepted snapshot, draft stale state, and focused identity.
Call `apiClient.setAiChartContext(buildWesternChartAiContext(routeState, { includeSelectedRows: false }))`; serialize
updates so later focus updates cannot overtake a newer successful result. Errors
surface in existing AI status diagnostics and do not affect chart state.

- [ ] **Step 6: Run context/client/integration tests and commit**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/context/chartAiContext.test.ts src/renderer-react/api/client.test.ts src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx
npm run typecheck
```

Expected: success-only/stale/focus context tests PASS.

```powershell
git add src/renderer-react/features/charts/context src/renderer-react/api/contracts.ts src/renderer-react/types/myst-api.d.ts src/renderer-react/api/client.ts src/renderer-react/api/client.test.ts src/renderer-react/features/charts/workbench/ChartWorkbenchPage.tsx
git commit -m "feat(charts): publish accepted AI chart context"
```

### Task 8: Finish Explorer Styling, Locale, and Accessibility

**Files:**
- Modify: `src/renderer-react/features/charts/workbench/charts.css`
- Modify: `locale/zh.json`
- Modify: `src/renderer-react/shell/locale.test.ts`
- Modify: `src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx`
- Modify: `src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx`

- [ ] **Step 1: Write failing visual-contract and locale tests**

Assert fixed density-driven header/row heights, sticky/pinned columns, visible
active-cell/focused-row/bulk-selection encodings beyond color, no nested cards,
horizontal overflow confined to grid, non-overlapping toolbar/tabs/grid, and
all labels for five tabs, filters, column menu, comparison modes, copy/CSV,
selection count, unavailable state, and metadata sections.

- [ ] **Step 2: Run tests and verify missing hooks/keys**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx src/renderer-react/shell/locale.test.ts
```

Expected: FAIL on missing CSS hooks and locale paths.

- [ ] **Step 3: Implement dense stable explorer styles**

Use full-width unframed tab/data bands, fixed toolbar and tab strip heights,
`--row-height`/`--control-height`, tabular numerals, stable grid column sizing,
sticky headers, pinned-column border/shadow only at the boundary, visible focus
outline, and virtual row absolute positioning without content-driven height.
At narrow vertical split widths, controls wrap but do not cover SVG or grid.

- [ ] **Step 4: Add exact locale keys and verify**

Add labels/errors/status text for every explorer command/state and all stable
metadata display labels. Keep exported headers nonlocalized IDs.

Run:

```powershell
npm run test:renderer
npm run typecheck
npm run build:renderer
```

Expected: complete renderer suite and build PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer-react/features/charts/workbench/charts.css locale/zh.json src/renderer-react/shell/locale.test.ts src/renderer-react/features/charts/explorer
git commit -m "style(charts): finish chart data explorer"
```

### Task 9: Exercise Genuine Electron IPC, Failure Retention, Intent, and Exports

**Files:**
- Create: `tests/ChartWorkbenchSmokeFixtures.js`
- Modify: `tests/SmokeReactRenderer.js`
- Modify: `tests/PreloadSubscriptions.test.js`
- Modify: `tests/IpcRouterSecurity.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing smoke fixture and channel-security tests**

Create `ChartWorkbenchSmokeFixtures.js` exporting deterministic persisted
profiles A/B, request builders for natal/synastry, and:

```js
class DelayedAstrologyService {
  constructor(realService) { this.real = realService; this.pending = []; this.failNext = null; }
  chartTypes() { return this.real.chartTypes(); }
  referenceData() { return this.real.referenceData(); }
  computeChart(request) { return new Promise((resolve, reject) => this.pending.push({ request, resolve, reject })); }
  resolve(index) { const item = this.pending[index]; item.resolve(this.real.computeChart(item.request)); }
  reject(index, message) { this.pending[index].reject(new Error(message)); }
}
```

Extend security/preload tests to assert chart calls still use only the three
narrow channels and foreign/subframe requests cannot trigger delayed service.

Add this script now so the first run exercises the unintegrated smoke path:

```json
"smoke:react:charts": "npm run build:renderer && electron tests/SmokeReactRenderer.js --charts"
```

In the `--charts` branch, require a successful personal result SVG, a successful
relationship result SVG, an explorer grid, and a `chartSmoke` report object.
These assertions precede the real handler wiring in Step 3.

- [ ] **Step 2: Run focused Node tests and verify smoke helpers are not integrated**

Run:

```powershell
npm run test:security
npm run test:preload
npm run smoke:react:charts
```

Expected: FAIL at `smoke:react:charts` because the smoke window does not yet
register real catalog/reference/chart handlers or produce the required
`chartSmoke` report; the preceding security and preload commands PASS.

- [ ] **Step 3: Replace browser chart mocks with real router/services**

In `SmokeReactRenderer.js`, configure real `SwissEphCore` at
`assets/ephemeris`, real `AstrologyService(new ChartStrategyFactory({backend:
'swisseph'}))`, temporary-directory real `ProfileRepository` seeded A/B, and real
`IpcRouter` attached to the BrowserWindow trusted main frame. Wrap only
`computeChart` with `DelayedAstrologyService`; do not register direct chart mock
envelopes. Keep real preload and `nodeIntegration:false`.

- [ ] **Step 4: Add exact single/dual workflow and output assertions**

Drive DOM commands to:

1. Select A, natal, sidereal, Calculate; resolve and assert accepted result.
2. Select synastry A/B, Calculate; resolve and assert two ring groups.
3. Click a ring-qualified SVG point, assert Planets tab row reveal; press Enter on a table row, assert SVG focus.
4. Exercise all three comparison modes, filters, sort, pin/hide, keyboard navigation, and bulk selection.
5. Intercept clipboard text and Blob/object URLs; invoke Copy, CSV, SVG and assert nonempty exact format markers.

For both SVGs assert nonzero bounding box and markup contains none of `NaN`,
`Infinity`, or `undefined` numeric values.

- [ ] **Step 5: Add overlap/cancellation/failure/parser/intent/security assertions**

Force request A then B, resolve B then A, assert B result ID remains. Force A
then B, cancel B, resolve A/B, assert neither commits. After a success reject a
recalculation and assert result/focus/transform/table selection/AI context remain.
Return a malformed successful envelope once and assert parser error is local.
Publish profile synastry intent before route entry and assert applied before
consumed without auto-calculate. In renderer evaluate
`typeof require`, `typeof process`, and `window.mystApi.ipcRenderer`; assert all
are `undefined`. Complete the existing dirty-close decision handshake after
workbench interaction.

- [ ] **Step 6: Run the trusted chart smoke script**

Run:

```powershell
npm run smoke:react:charts
```

Expected: exit 0 and report names real IPC, single/dual results, late-response
rejection, cancellation rejection, failure retention, typed parser rejection,
three exports, intent consumption, no Node access, and close handshake.

- [ ] **Step 7: Commit**

```powershell
git add tests/ChartWorkbenchSmokeFixtures.js tests/SmokeReactRenderer.js tests/PreloadSubscriptions.test.js tests/IpcRouterSecurity.test.js package.json
git commit -m "test(charts): add trusted Electron workbench smoke"
```

### Task 10: Add the 24-Image Responsive Visual and Geometry Matrix

**Files:**
- Modify: `tests/NativeImageMetrics.js`
- Create: `tests/ChartVisualMetrics.test.js`
- Modify: `tests/SmokeReactRenderer.js`
- Modify: `package.json`
- Create: `tests/screenshots/chart-personal-single-1440x920-light-compact.png`
- Create: `tests/screenshots/chart-personal-single-1440x920-light-comfortable.png`
- Create: `tests/screenshots/chart-personal-single-1440x920-dark-compact.png`
- Create: `tests/screenshots/chart-personal-single-1440x920-dark-comfortable.png`
- Create: `tests/screenshots/chart-personal-single-1280x800-light-compact.png`
- Create: `tests/screenshots/chart-personal-single-1280x800-light-comfortable.png`
- Create: `tests/screenshots/chart-personal-single-1280x800-dark-compact.png`
- Create: `tests/screenshots/chart-personal-single-1280x800-dark-comfortable.png`
- Create: `tests/screenshots/chart-personal-single-1100x720-light-compact.png`
- Create: `tests/screenshots/chart-personal-single-1100x720-light-comfortable.png`
- Create: `tests/screenshots/chart-personal-single-1100x720-dark-compact.png`
- Create: `tests/screenshots/chart-personal-single-1100x720-dark-comfortable.png`
- Create: `tests/screenshots/chart-relationship-dual-1440x920-light-compact.png`
- Create: `tests/screenshots/chart-relationship-dual-1440x920-light-comfortable.png`
- Create: `tests/screenshots/chart-relationship-dual-1440x920-dark-compact.png`
- Create: `tests/screenshots/chart-relationship-dual-1440x920-dark-comfortable.png`
- Create: `tests/screenshots/chart-relationship-dual-1280x800-light-compact.png`
- Create: `tests/screenshots/chart-relationship-dual-1280x800-light-comfortable.png`
- Create: `tests/screenshots/chart-relationship-dual-1280x800-dark-compact.png`
- Create: `tests/screenshots/chart-relationship-dual-1280x800-dark-comfortable.png`
- Create: `tests/screenshots/chart-relationship-dual-1100x720-light-compact.png`
- Create: `tests/screenshots/chart-relationship-dual-1100x720-light-comfortable.png`
- Create: `tests/screenshots/chart-relationship-dual-1100x720-dark-compact.png`
- Create: `tests/screenshots/chart-relationship-dual-1100x720-dark-comfortable.png`

- [ ] **Step 1: Write failing pixel/geometry helper tests**

Export and test helpers:

```js
centralDifferenceRatio(bitmap, width, height, surfaceRgb)
distinctRgbInRect(bitmap, width, rect)
pixelDifferenceCount(before, after, width, rect)
rectsIntersect(left, right)
```

Use synthetic bitmaps to assert exact ratios/counts and validate rect clipping.
Require central 50% difference `>=0.01`, at least 16 distinct SVG RGB values,
and layer toggle difference `>=100` pixels inside SVG bounds.

- [ ] **Step 2: Run helper tests and verify missing functions**

Run: `node --test tests/ChartVisualMetrics.test.js`

Expected: FAIL because visual metric helpers are absent.

- [ ] **Step 3: Implement scale-aware region metrics**

Extend `NativeImageMetrics.js` using the existing selected native scale factors;
convert logical rects to bitmap coordinates with `actualScaleX/Y`, validate
bounds, compare BGRA pixels, and return deterministic counts. Do not assume 1x DPI.

- [ ] **Step 4: Capture the exact required matrix**

In chart smoke loop over:

```js
const cases = ['personal-single', 'relationship-dual'];
const sizes = [[1440, 920], [1280, 800], [1100, 720]];
const appearances = [
  ['light', 'compact'], ['light', 'comfortable'],
  ['dark', 'compact'], ['dark', 'comfortable'],
];
```

Capture exactly `2 * 3 * 4 = 24` named PNGs under
`tests/screenshots/chart-<case>-<width>x<height>-<theme>-<density>.png`.
Before each capture wait for fonts, accepted chart, nonzero SVG, and two animation
frames.

- [ ] **Step 5: Assert geometry and pixel acceptance for every capture**

For each image assert filter band/Calculate are inside workspace and do not
intersect result header; measured result uses horizontal at `>=760` and vertical
below; horizontal panes each `>=360px`; SVG nonzero; central pixel difference
`>=1%`; at least 16 SVG colors; controls/table headers/focused rows/AI overlay do
not overlap SVG interaction region. Assert all three shell columns at 1440 and
existing collapsed-nav/AI-overlay at 1100. Toggle every populated ring and
major/minor layer and assert at least 100 changed SVG pixels.

- [ ] **Step 6: Run matrix and commit**

Add script:

```json
"smoke:react:charts:visual": "npm run build:renderer && cross-env CHILLAST_CHART_VISUAL=1 electron tests/SmokeReactRenderer.js --charts"
```

Run:

```powershell
node --test tests/ChartVisualMetrics.test.js
npm run smoke:react:charts:visual
```

Expected: helper tests pass; smoke reports exactly 24 unique screenshots and all
geometry/pixel/layer assertions pass. It makes no universal collision claim.

```powershell
git add tests/NativeImageMetrics.js tests/ChartVisualMetrics.test.js tests/SmokeReactRenderer.js tests/screenshots/chart-*.png package.json
git commit -m "test(charts): verify responsive chart visuals"
```

### Task 11: Verify Packaged React Charts and Swiss Resources

**Files:**
- Modify: `tests/VerifyPackage.js`
- Modify: `tests/SmokePackagedRenderer.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing package-content assertions**

In `VerifyPackage.js`, require packaged React JS/CSS, preload, all western core
strategy/ephemeris source files, `swisseph-v2` unpacked native module, and
`resources/assets/ephemeris`. Hash source-vs-archive chart/preload files and
verify ephemeris data files are nonempty. Assert no test can pass by selecting
`HoroscopeAdapter` when backend is Swiss.

In packaged smoke, for React target navigate to personal route, compute real
natal sidereal through packaged trusted IPC, assert Lahiri result within fixture
tolerance, finite nonblank SVG, explorer row, SVG/CSV Blob creation, no renderer
Node access, and dirty-close handshake.

- [ ] **Step 2: Run package test against current package and observe missing chart checks**

Run: `npm run verify:package`

Expected before implementation: FAIL on the newly added report fields/content
assertions (or package build succeeds but does not yet prove packaged chart flow).

- [ ] **Step 3: Extend package verification scripts**

Add source/resource assertions without broadening `build.files` beyond required
existing `src/**/*`, built React assets, `asarUnpack swisseph-v2`, and existing
`assets` extra resource. Add packaged smoke report fields:

```js
{
  chartType: 'natal', zodiac: 'sidereal', backend: 'swisseph',
  svgBytes: Number, explorerRows: Number, csvBytes: Number,
  finiteSvg: true, nodeAccess: false, closeHandshake: true
}
```

Use independently pinned fixture tolerance `0.01`; do not catch Swiss failure
and retry with horoscope backend.

- [ ] **Step 4: Add canonical chart verification scripts**

Add:

```json
"verify:charts": "node --test tests/AstrologyCatalog.test.js tests/SwissephSidereal.test.js tests/ChartVisualMetrics.test.js && npm run test:security && npm run test:preload && npm run test:renderer && npm run typecheck && npm run build:renderer && npm run smoke:react:charts",
"verify:charts:release": "npm run verify:charts && npm run smoke:react:charts:visual && npm run verify:package"
```

- [ ] **Step 5: Run package verification and commit**

Run:

```powershell
npm run verify:package
```

Expected: package source/resource hashes pass; packaged legacy and React smokes
exit 0; React report proves real sidereal chart/explorer/exports/no-Node/close.

```powershell
git add tests/VerifyPackage.js tests/SmokePackagedRenderer.js package.json
git commit -m "test(charts): verify packaged western workbench"
```

### Task 12: Final Full Verification and Review

**Files:**
- Test: `tests/AstrologyCatalog.test.js`
- Test: `tests/SwissephSidereal.test.js`
- Test: `tests/ChartVisualMetrics.test.js`
- Test: `tests/SmokeReactRenderer.js`
- Test: `tests/VerifyPackage.js`
- Test: `tests/SmokePackagedRenderer.js`
- Test: `src/renderer-react/features/charts/explorer/explorerRows.test.ts`
- Test: `src/renderer-react/features/charts/explorer/explorerColumns.test.tsx`
- Test: `src/renderer-react/features/charts/explorer/ChartDataGrid.test.tsx`
- Test: `src/renderer-react/features/charts/explorer/ChartDataExplorer.test.tsx`
- Test: `src/renderer-react/features/charts/explorer/tabularExport.test.ts`
- Test: `src/renderer-react/features/charts/context/chartAiContext.test.ts`

- [ ] **Step 1: Run consistency and renderer-boundary scans**

Run:

```powershell
rg "type ChartType|interface NormalizedChartResult|type ChartIdentity|function shortestSignedDelta|function buildWesternChartAiContext" src/renderer-react
rg "require\(|process\.|ipcRenderer" src/renderer-react/features/charts
```

Expected: shared types/functions each have one definition; renderer chart
feature has no Node/direct IPC access.

- [ ] **Step 2: Run canonical source verification**

Run:

```powershell
npm run verify:charts
npm run smoke
git diff --check
```

Expected: domain, sidereal, security, preload, all renderer tests, typecheck,
build, genuine chart smoke, legacy smoke, and diff check exit 0.

- [ ] **Step 3: Run release visual/package verification**

Run:

```powershell
npm run smoke:react:charts:visual
npm run verify:package
```

Expected: exactly 24 chart screenshots pass geometry/pixel assertions; packaged
source/resources and both renderer smokes pass.

- [ ] **Step 4: Request final code review**

Use `superpowers:requesting-code-review`. Give the reviewer the approved design
spec and all four plan paths. Require an acceptance-criteria audit covering all
20 mappings, sidereal fixtures/isolation, explicit stale lifecycle, sequence
eligibility, profile intent, measured split, stable identities/selection,
layers/transforms/export, every grid capability and 20 layouts, comparison
null/`-180`, metadata, clipboard/CSV bytes, AI context, genuine IPC/security,
visual matrix, package resources, and dirty close.

- [ ] **Step 5: Apply and verify review corrections**

For each valid finding, first add or tighten the focused failing test, run it to
observe the named failure, make the minimal correction, rerun focused tests,
then rerun Steps 2 and 3. Do not refactor unrelated legacy renderer or core code.

- [ ] **Step 6: Commit final review corrections**

When corrections exist:

```powershell
git add package.json package-lock.json src/renderer-react src/core/astrology src/main src/preload tests locale/zh.json
git commit -m "fix(charts): address workbench integration review"
```

Expected: stage only reviewed workbench files; no commit when review is clean;
the final worktree passes `git diff --check` and both verification tiers.
