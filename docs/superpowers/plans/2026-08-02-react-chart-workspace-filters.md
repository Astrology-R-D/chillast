# React Chart Workspace and Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the personal and relationship route stubs with a usable explicit-calculation workbench, complete filters, deterministic request lifecycle, retained result summary, and responsive persisted split foundation.

**Architecture:** A route-specialized `ChartWorkbenchPage` shares one kernel. Zustand owns draft/submitted/accepted snapshots, request sequencing, recents, split preferences, and retained interaction state; one TanStack Query mutation coordinator owns invocation and cancellation-by-ignoring. Pure builders validate and freeze requests from the exhaustive plan-1 catalog, while result status remains below an always-visible filter band.

**Tech Stack:** React 19, TypeScript, Zustand 5, TanStack Query 5, react-resizable-panels 2, Radix Dialog/Popover/Tooltip, Lucide React, Vitest, React Testing Library, CSS custom properties

---

## Dependencies and Handoff

This is plan 2 of 4 and requires plan 1 complete. Before starting, verify
`src/renderer-react/features/charts/contracts.ts`, `catalog.ts`,
`normalizeChartResult.ts`, and parsed `apiClient` chart methods exist and plan-1
verification passes.

This plan exports these stable names for plans 3 and 4:

- `WesternChartWorkspaceV1`, `ChartTableLayoutV1`, `ExplorerTab`, and `ComparisonMode` from `stores/chartWorkspacePersistence.ts`.
- `ChartDraft` and `SubmittedChartSnapshot` from `features/charts/workbench/chartDraft.ts`; `RequestStatus`, `ChartTransform`, and `LayerState` from `stores/chartWorkspace.ts`.
- `chartWorkspaceStore`, `createChartWorkspaceStore`, and `useChartWorkspace` from the same file.
- `ChartWorkbenchPage`, `ChartResultShell`, and `ChartResultSummary` from `features/charts/workbench`.
- CSS hooks `.chart-workbench`, `.chart-filter-band`, `.chart-result`, `.chart-result__chart-pane`, and `.chart-result__data-pane`.

Plan 3 replaces only the chart-pane interim summary. Plan 4 replaces only the
data-pane interim summary, adds table layout behavior, AI context, and full-system
verification. Neither later plan forks calculation ownership.

## File Map

- Modify `package.json` and `package-lock.json`: add the exact Radix primitives used by filter overlays/tooltips.
- Create `src/renderer-react/stores/chartWorkspacePersistence.ts`: V1 parser/defaults, bounded recents, split values, and 20 per-type table layout slots.
- Create `src/renderer-react/stores/chartWorkspacePersistence.test.ts`: schema recovery, recents, pruning, and isolation.
- Create `src/renderer-react/stores/chartWorkspace.ts`: route drafts, submitted snapshots, request sequencing, result retention, basic selection/layers/transform ownership.
- Create `src/renderer-react/stores/chartWorkspace.test.ts`: stale, sequencing, cancellation, failure retention, reset, and persistence semantics.
- Create `src/renderer-react/features/charts/workbench/chartDraft.ts`: defaults, structural equality, validation, and exact request mapping.
- Create `src/renderer-react/features/charts/workbench/chartDraft.test.ts`: all 20 mappings and every validation bound.
- Create `src/renderer-react/features/charts/workbench/chartCalculation.ts`: TanStack mutation coordinator.
- Create `src/renderer-react/features/charts/workbench/chartCalculation.test.tsx`: overlap, cancellation, late settlement, edits in flight, parser error, and retry.
- Create `src/renderer-react/features/charts/workbench/ChartFilterBand.tsx`: visible and dynamic controls plus advanced aspects.
- Create `src/renderer-react/features/charts/workbench/ChartFilterBand.test.tsx`: exhaustive rendered controls, reset, recents, and advanced behavior.
- Create `src/renderer-react/features/charts/workbench/RelocationPicker.tsx`: trusted resolved-place selection using the shared city client.
- Create `src/renderer-react/features/charts/workbench/ChartResultShell.tsx`: container-measured split and result-local states.
- Create `src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`: orientation, minima, persisted ratios, and retained summary states.
- Create `src/renderer-react/features/charts/workbench/ChartResultSummary.tsx`: usable calculated-result metadata summary.
- Create `src/renderer-react/features/charts/workbench/ChartWorkbenchPage.tsx`: route composition and profile intent handling.
- Create `src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx`: routes, intent, explicit calculate, stale/revert, and states.
- Create `src/renderer-react/features/charts/workbench/charts.css`: balanced dense filters and responsive split foundation.
- Modify `src/renderer-react/shell/AppShell.tsx`: render personal/relationship workbench pages.
- Modify `src/renderer-react/styles/global.css`: import chart styles.
- Modify `src/renderer-react/test/setup.ts`: controllable ResizeObserver.
- Modify `locale/zh.json` and `src/renderer-react/shell/locale.test.ts`: complete workbench labels/status/errors.

### Task 1: Install Accessible Filter Overlay Primitives

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer-react/build-configuration.test.ts`

- [ ] **Step 1: Add a failing dependency assertion**

In `src/renderer-react/build-configuration.test.ts`, add:

```ts
it('declares the accessible primitives used by chart filters', () => {
  expect(packageJson.dependencies).toMatchObject({
    '@radix-ui/react-dialog': expect.any(String),
    '@radix-ui/react-popover': expect.any(String),
    '@radix-ui/react-tooltip': expect.any(String),
  });
});
```

- [ ] **Step 2: Run the test and verify missing dependencies**

Run: `npm run test:renderer -- src/renderer-react/build-configuration.test.ts`

Expected: FAIL because all three dependency keys are absent.

- [ ] **Step 3: Install only the required primitives**

Run:

```powershell
npm install @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip
```

Expected: exit 0; package and lock files contain compatible direct versions.

- [ ] **Step 4: Run focused test and typecheck**

Run:

```powershell
npm run test:renderer -- src/renderer-react/build-configuration.test.ts
npm run typecheck
```

Expected: PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json src/renderer-react/build-configuration.test.ts
git commit -m "build(charts): add filter overlay primitives"
```

### Task 2: Parse and Persist the Versioned Western Workspace

**Files:**
- Create: `src/renderer-react/stores/chartWorkspacePersistence.ts`
- Create: `src/renderer-react/stores/chartWorkspacePersistence.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Create tests that assert this exact behavior:

```ts
expect(defaultWesternWorkspace().tableLayouts).toEqual(
  Object.fromEntries(CHART_TYPES.map((type) => [type, expect.objectContaining({ version: 1, activeTab: 'planets' })])),
);
expect(pushRecent(['b', 'a'], 'a')).toEqual(['a', 'b']);
expect(pushRecent(Array.from({ length: 8 }, (_, i) => `p${i}`), 'new')).toHaveLength(8);
expect(relocationRecentId({ latitude: 39.9042004, longitude: 116.4073996 })).toBe('39.904200:116.407400');
```

Parse a valid V1 payload and assert deleted profile/place IDs are pruned by
`reconcileWorkspace(workspace, profiles, places)`. Parse a future top-level
version and assert only `westernChart` resets while `{ primaryProfileId,
recentUses }` in the containing profile workspace remains byte-equivalent.
Corrupt one chart type layout and assert only that token returns defaults.

- [ ] **Step 2: Run the test and verify missing module failure**

Run: `npm run test:renderer -- src/renderer-react/stores/chartWorkspacePersistence.test.ts`

Expected: FAIL with unresolved `chartWorkspacePersistence`.

- [ ] **Step 3: Define the V1 schema and defaults**

Create the file with these exact public types:

```ts
export type ExplorerTab = 'planets' | 'houses' | 'aspects' | 'distributions' | 'comparison';
export type ComparisonMode = 'merged' | 'sideBySide' | 'difference';
export interface TabLayoutV1 {
  sorting: Array<{ id: string; desc: boolean }>;
  filters: Array<{ id: string; value: unknown }>;
  columnOrder: string[]; columnVisibility: Record<string, boolean>;
  columnPinning: { left: string[]; right: string[] }; columnSizing: Record<string, number>;
}
export interface ChartTableLayoutV1 { version: 1; activeTab: ExplorerTab; comparisonMode: ComparisonMode; tabs: Record<ExplorerTab, TabLayoutV1> }
export interface WesternChartWorkspaceV1 {
  schema: 'western-chart-workspace'; version: 1;
  recents: { primaryProfileIds: string[]; secondaryProfileIds: string[]; chartTypes: ChartType[]; houseSystems: string[]; zodiacs: Zodiac[]; relocationPlaces: Array<{ id: string; label: string; latitude: number; longitude: number }> };
  split: { personal: { horizontal: [number, number]; vertical: [number, number] }; relationship: { horizontal: [number, number]; vertical: [number, number] } };
  tableLayouts: Record<ChartType, ChartTableLayoutV1>;
}
export const WESTERN_WORKSPACE_KEY = 'chillast.westernChartWorkspace';
export function defaultTableLayout(): ChartTableLayoutV1;
export function defaultWesternWorkspace(): WesternChartWorkspaceV1;
export function parseWesternWorkspace(value: unknown): WesternChartWorkspaceV1;
export function pushRecent<T>(values: readonly T[], value: T, identity?: (value: T) => string): T[];
export function relocationRecentId(place: Pick<GeoLocation, 'latitude' | 'longitude'>): string;
```

Use Zod to parse top-level schema/version, finite split tuples, recents, and each
layout. `pushRecent` moves the stable ID to front, deduplicates, and slices to
8. Layout parsing accepts only column IDs passed by plan 4; until then defaults
contain empty arrays/maps. Unsupported schema/version returns all V1 defaults.

- [ ] **Step 4: Implement storage read/write without touching profile workspace data**

Export:

```ts
export function readWesternWorkspace(storage: Storage): WesternChartWorkspaceV1;
export function writeWesternWorkspace(storage: Storage, value: WesternChartWorkspaceV1): void;
```

Both catch storage/JSON errors; reads return defaults and writes leave memory
state usable. Use only `WESTERN_WORKSPACE_KEY`, never `PROFILE_WORKSPACE_KEY`.

- [ ] **Step 5: Run persistence tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/stores/chartWorkspacePersistence.test.ts
npm run typecheck
```

Expected: schema, recents, pruning, isolated recovery, and typecheck PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/stores/chartWorkspacePersistence.ts src/renderer-react/stores/chartWorkspacePersistence.test.ts
git commit -m "feat(charts): persist western workspace settings"
```

### Task 3: Build Draft Defaults, Validation, and All 20 Request Mappings

**Files:**
- Create: `src/renderer-react/features/charts/workbench/chartDraft.ts`
- Create: `src/renderer-react/features/charts/workbench/chartDraft.test.ts`

- [ ] **Step 1: Write failing table-driven draft tests**

Use the same exact 20-token option matrix from plan 1. For each descriptor,
assert `controlsFor(type)` equals its visible controls and
`buildSubmittedSnapshot` emits:

```ts
{
  route, type, primaryProfileId: 'p1', secondaryProfileId: relationship ? 'p2' : null,
  request: {
    type, primary, ...(relationship ? { secondary } : {}),
    settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: ['conjunction', 'opposition', 'trine', 'square', 'sextile', 'quincunx', 'sesquiquadrate', 'semisquare', 'semisextile', 'quintile'], orbOverrides: {} } },
    options: expectedOptions,
  },
}
```

Assert target local `2026-08-02T12:34` serializes to an ISO instant using an
injected `toInstant` function, year accepts `1` and `3000` but rejects `0` and
`3001`, coordinates accept boundaries, unresolved relocation rejects, same
relationship ID rejects, unknown house/zodiac/aspect rejects, and orb bounds
are inclusive `0.1..15`. Assert reset uses injected local minute/year and the
primary birth location, and never calls compute.

- [ ] **Step 2: Run tests and verify missing module failure**

Run: `npm run test:renderer -- src/renderer-react/features/charts/workbench/chartDraft.test.ts`

Expected: FAIL because `chartDraft.ts` is absent.

- [ ] **Step 3: Define draft and validation types**

Create `chartDraft.ts`:

```ts
export interface ChartDraft {
  route: ChartRoute; type: ChartType; primaryProfileId: string | null; secondaryProfileId: string | null;
  targetLocal: string; returnYear: number; relocationPlace: CitySearchResult | null;
  houseSystem: string; zodiac: Zodiac; enabledAspects: string[]; orbOverrides: Record<string, number>;
}
export interface SubmittedChartSnapshot { route: ChartRoute; type: ChartType; primaryProfileId: string; secondaryProfileId: string | null; request: ChartRequest }
export interface DraftValidation { valid: boolean; fieldErrors: Partial<Record<keyof ChartDraft | 'advancedAspects', string>> }
export interface DraftEnvironment { now: Date; profiles: readonly Profile[]; reference: ChartReferenceData; persistedPrimaryId: string | null; recentSecondaryIds: readonly string[]; toInstant(local: string): string }
export function createDefaultDraft(route: ChartRoute, environment: DraftEnvironment): ChartDraft;
export function validateChartDraft(draft: ChartDraft, environment: DraftEnvironment): DraftValidation;
export function buildSubmittedSnapshot(draft: ChartDraft, environment: DraftEnvironment): SubmittedChartSnapshot;
export function structurallyEqual(left: unknown, right: unknown): boolean;
```

`structurallyEqual` recursively compares sorted object keys, ordered arrays, and
primitive values; submitted snapshots are `structuredClone`d and recursively
`Object.freeze`d before return.

- [ ] **Step 4: Implement exact dynamic mapping and fallbacks**

Use `CHART_DESCRIPTORS[type].controls`. Personal defaults to `natal`,
relationship to `synastry`. Primary fallback order is persisted existing ID,
profile workspace primary existing ID, then first profile. Secondary is the
first recent existing ID distinct from primary, then first distinct profile.
Relocation defaults to a resolved `CitySearchResult` constructed from primary
birth location with `source: 'western'` and a six-decimal identity.

Only emit `targetDate`, `year`, or the relocation coordinate tuple when the
descriptor declares the corresponding service option. Do not expose internally
accepted return/transit locations.

- [ ] **Step 5: Run focused and full pure tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/workbench/chartDraft.test.ts src/renderer-react/features/charts/catalog.test.ts
npm run typecheck
```

Expected: all 20 mappings and bounds PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/workbench/chartDraft.ts src/renderer-react/features/charts/workbench/chartDraft.test.ts
git commit -m "feat(charts): validate chart filter drafts"
```

### Task 4: Implement Zustand Request, Retention, and Recency Semantics

**Files:**
- Create: `src/renderer-react/stores/chartWorkspace.ts`
- Create: `src/renderer-react/stores/chartWorkspace.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Use an injectable memory storage and assert:

```ts
const a = store.getState().submit(validSnapshotA);
expect(a).toBe(1);
store.getState().editDraft({ zodiac: 'sidereal' });
expect(store.getState().isStale).toBe(false); // no success exists yet
store.getState().acceptSuccess(a, resultA, validSnapshotA);
expect(store.getState()).toMatchObject({ isStale: true, lastSuccessfulResult: resultA });
store.getState().editDraft(draftA);
expect(store.getState().isStale).toBe(false);
```

Submit A then B, resolve A after B, and assert A cannot commit. Cancel B then
resolve A and B and assert neither commits. After an existing success, assert
failure/cancellation preserves result, `focusedIdentity`, `bulkSelection`,
`transform`, active tab, and AI-context source. Assert equal unresolved snapshot
cannot resubmit, but settled success/failure/cancellation can retry. Assert only
successful selector values update recents, each capped at 8; clear recents does
not change draft.

- [ ] **Step 2: Run test and verify missing store**

Run: `npm run test:renderer -- src/renderer-react/stores/chartWorkspace.test.ts`

Expected: FAIL with unresolved `chartWorkspace`.

- [ ] **Step 3: Define the complete shared state surface**

Create the store with these stable types:

```ts
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';
export type RequestFailureKind = 'parser' | 'ipc' | 'domain';
export interface ChartTransform { scale: number; x: number; y: number }
export interface LayerState { majorAspects: boolean; minorAspects: boolean; houses: boolean; labels: boolean; rings: Record<string, boolean> }
export interface ChartRouteState {
  draft: ChartDraft; submitted: SubmittedChartSnapshot | null; accepted: SubmittedChartSnapshot | null;
  lastSuccessfulResult: NormalizedChartResult | null; latestIssuedSequence: number;
  activeSequence: number | null; requestStatus: RequestStatus; requestFailureKind: RequestFailureKind | null;
  requestMessage: string | null; isStale: boolean;
}
```

The state also owns `focusedIdentity: ChartIdentity | null`, `hoverIdentity`,
`layers`, `transform`, `activeTab`, `comparisonMode`, and `bulkSelection`.
Export actions `initializeRoute`, `editDraft`, `resetDraft`, `submit`,
`acceptSuccess`, `acceptFailure`, `cancel`, `setFocus`, `setHover`, `setLayers`,
`setTransform`, `setActiveTab`, `setComparisonMode`, and `clearRecents`.

- [ ] **Step 4: Implement sequence eligibility and retention**

Use this one eligibility predicate in every settlement action:

```ts
const maySettle = (state: ChartRouteState, sequence: number) =>
  sequence === state.latestIssuedSequence
  && sequence === state.activeSequence
  && state.requestStatus === 'loading';
```

`submit` increments monotonically and stores the frozen snapshot. `cancel`
clears `activeSequence` and sets `cancelled`; it never decrements sequence.
`acceptSuccess` atomically writes result/accepted/status and retains focus only
when `result.identities.includes(focusedIdentity)`. Failure/cancellation never
clear successful data or interaction state. Recompute `isStale` after every
draft edit and accepted success using `structurallyEqual`.

- [ ] **Step 5: Run store and persistence suites**

Run:

```powershell
npm run test:renderer -- src/renderer-react/stores/chartWorkspace.test.ts src/renderer-react/stores/chartWorkspacePersistence.test.ts
npm run typecheck
```

Expected: all sequencing/retention/persistence assertions PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/stores/chartWorkspace.ts src/renderer-react/stores/chartWorkspace.test.ts
git commit -m "feat(charts): coordinate chart workspace state"
```

### Task 5: Coordinate TanStack Calculation and Cancellation-by-Ignoring

**Files:**
- Create: `src/renderer-react/features/charts/workbench/chartCalculation.ts`
- Create: `src/renderer-react/features/charts/workbench/chartCalculation.test.tsx`

- [ ] **Step 1: Write failing overlap and cancellation integration tests**

Render a probe under a fresh `QueryClientProvider`, inject deferred
`apiClient.computeChart`, and test exact timelines:

1. Submit A, edit draft, submit B, resolve B then A: only B commits.
2. Submit A, submit B, cancel B, resolve A then B: neither commits and status is cancelled.
3. Keep result C, submit D, reject D: C/focus/transform remain and Retry submits a new sequence.
4. Edit during A then resolve A: A commits against its immutable snapshot and is immediately stale.
5. Reject parser output: status is error and malformed data never reaches result.

Assert each Calculate calls compute exactly once and field edits call it zero times.

- [ ] **Step 2: Run tests and verify missing coordinator**

Run: `npm run test:renderer -- src/renderer-react/features/charts/workbench/chartCalculation.test.tsx`

Expected: FAIL because `chartCalculation.ts` does not exist.

- [ ] **Step 3: Implement the mutation hook**

Export:

```ts
export interface ChartCalculationController { calculate(): void; retry(): void; cancel(): void; isEquivalentInFlight: boolean }
export function useChartCalculation(route: ChartRoute, environment: DraftEnvironment): ChartCalculationController;
```

Use one `useMutation({ mutationFn: ({ snapshot }) => apiClient.computeChart(snapshot.request) })`.
`calculate` validates/builds once, obtains `sequence = store.submit(snapshot)`,
calls `mutation.mutate({ sequence, snapshot })`, and records successful recents
only inside eligible `acceptSuccess`. Before a newer mutate, call
`mutation.reset()` and mark the previous sequence ignored through the store;
do not claim backend cancellation. `cancel` stops awaiting by invalidating the
active sequence and resets visible mutation state.

In `onError`, map `ChartBoundaryError.kind` directly to
`requestFailureKind`; map an unexpected thrown value to `ipc` with a stable
`星盘请求失败` message. Call `acceptFailure(sequence, kind, message)` only for the
latest eligible sequence. Validation never enters the mutation and remains an
inline field error.

- [ ] **Step 4: Run focused and full renderer tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/workbench/chartCalculation.test.tsx src/renderer-react/stores/chartWorkspace.test.ts
npm run test:renderer
```

Expected: all lifecycle tests PASS without act warnings or unhandled rejections.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer-react/features/charts/workbench/chartCalculation.ts src/renderer-react/features/charts/workbench/chartCalculation.test.tsx
git commit -m "feat(charts): sequence explicit calculations"
```

### Task 6: Render the Always-Visible Filter Band and Advanced Aspects

**Files:**
- Create: `src/renderer-react/features/charts/workbench/RelocationPicker.tsx`
- Create: `src/renderer-react/features/charts/workbench/ChartFilterBand.tsx`
- Create: `src/renderer-react/features/charts/workbench/ChartFilterBand.test.tsx`
- Modify: `locale/zh.json`
- Modify: `src/renderer-react/shell/locale.test.ts`

- [ ] **Step 1: Write failing exhaustive UI tests**

Use `it.each(CHART_TYPES)` and assert each selected type renders exactly the
descriptor controls: relationship always has `第二档案`; progressed relationship
types also have `目标日期时间`; solar return has `返照年份`; relocation has
`迁移地点`; types with no extra input render none. Assert control order is
primary, type, dynamic group, house, zodiac, Advanced, Calculate.

Assert fewer than two profiles disables relationship Calculate with an inline
distinct-profile message. Assert field validation messages remain beside the
field. Assert Reset restores defaults without compute; selector Clear resolves
fallback/invalid state; Clear recents leaves current value unchanged. In
Advanced, assert ten reference aspects, Reset enables all/removes overrides,
disabled aspects disappear from submitted settings, and invalid orb blocks
Calculate.

- [ ] **Step 2: Run test and verify missing component**

Run: `npm run test:renderer -- src/renderer-react/features/charts/workbench/ChartFilterBand.test.tsx`

Expected: FAIL with unresolved `ChartFilterBand`.

- [ ] **Step 3: Implement trusted relocation selection**

`RelocationPicker` props are:

```ts
{ value: CitySearchResult | null; error?: string; recents: readonly CitySearchResult[];
  onChange(value: CitySearchResult): void; onClearRecents(): void }
```

Reuse `apiClient.searchCities`; a typed query alone is not selectable. Render
combobox/listbox semantics, coordinates for each result, resolved recents, a
query-only Clear command, and selector-recents Clear. Selection always supplies
finite trusted coordinates and label.

- [ ] **Step 4: Implement the visible band and advanced dialog**

`ChartFilterBand` props are:

```ts
{ route: ChartRoute; draft: ChartDraft; profiles: readonly Profile[]; reference: ChartReferenceData;
  validation: DraftValidation; status: RequestStatus; equivalentInFlight: boolean;
  onPatch(patch: Partial<ChartDraft>): void; onCalculate(): void; onReset(): void; onCancel(): void }
```

Use Radix Dialog for Advanced, Popover for recents, Tooltip for icon-only clear
commands, and Lucide `RotateCcw`, `Trash2`, and `X`. Calculate is disabled only
for spec validation reasons or equivalent unresolved snapshot. Keep controls
enabled while loading and expose Cancel in the result header task, not by
hiding Calculate. Every state change only calls `onPatch`.

- [ ] **Step 5: Add complete locale keys and run tests**

Add explicit keys under `chart.workbench` for every control, all field errors,
advanced aspect actions, empty/loading/stale/error/cancelled/parser/IPC/domain
states, retry, split labels, and metadata labels. Add every key to
`shell/locale.test.ts` expected paths.

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/workbench/ChartFilterBand.test.tsx src/renderer-react/shell/locale.test.ts
npm run typecheck
```

Expected: exhaustive mapping, accessibility, locale, and type tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/workbench/RelocationPicker.tsx src/renderer-react/features/charts/workbench/ChartFilterBand.tsx src/renderer-react/features/charts/workbench/ChartFilterBand.test.tsx locale/zh.json src/renderer-react/shell/locale.test.ts
git commit -m "feat(charts): render complete chart filters"
```

### Task 7: Build the Responsive Result Split and Usable Interim Summary

**Files:**
- Create: `src/renderer-react/features/charts/workbench/ChartResultSummary.tsx`
- Create: `src/renderer-react/features/charts/workbench/ChartResultShell.tsx`
- Create: `src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`
- Modify: `src/renderer-react/test/setup.ts`
- Create: `src/renderer-react/features/charts/workbench/charts.css`
- Modify: `src/renderer-react/styles/global.css`

- [ ] **Step 1: Add a controllable ResizeObserver and failing geometry tests**

Extend setup with `setObservedSize(element, { width, height })`, retaining the
latest callback per observed element. Test width `760` selects horizontal,
`759` vertical; horizontal panels expose `minSize` equivalent to 360px each and
an `<=8px` separator; vertical defaults 55/45 with chart minimum 360px. Resize
back and forth and assert current route/orientation ratios persist separately.

Test empty, profile-required, loading, parser error, IPC error, domain error,
cancelled, stale-success, and loading-with-retained-success states. Assert
filters are outside `.chart-result`, retained summary
remains present on failure/cancellation, status uses `role=status` and polite
live region, and Retry is present only when current draft is valid.

- [ ] **Step 2: Run test and verify missing shell**

Run: `npm run test:renderer -- src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`

Expected: FAIL with unresolved `ChartResultShell`.

- [ ] **Step 3: Implement container measurement and split clamping**

Export `useResultOrientation(ref): 'horizontal' | 'vertical'`; observe the result
container and compare `contentRect.width >= 760`. Render `PanelGroup` with
direction matching orientation, persisted `[number, number]`, and labeled
keyboard-operable handle. Convert 360px minima to percentages from measured
width/height and clamp stored ratios before applying them. Vertical result owns
scroll when combined minima exceed available height.

- [ ] **Step 4: Implement the calculated result summary**

`ChartResultSummary({ result, submitted })` renders type/title/subtitle,
subjects, house/zodiac, ring labels/count, point/aspect counts, accepted target/
year/location, return instant, and stable `meta.firdaria`/`meta.profection`
headline fields. Render remaining metadata as a key/value inspection list using
safe JSON formatting; do not discard unknown metadata. The chart pane says
`交互式星盘将在下一增量显示` and the data pane says
`数据浏览器将在后续增量显示`, but both expose the successful calculation facts.

- [ ] **Step 5: Add stable balanced CSS**

Define `.chart-workbench` as `grid-template-rows: auto minmax(0,1fr)`, keep the
filter band wrapping with fixed control minima, make result header stable, use
no nested cards, enforce pane `min-width:0`, and size the split handle to at most
8px. Add theme-visible stale/error/selection encodings using icon/text/border in
addition to color. Import `charts.css` from `global.css`.

- [ ] **Step 6: Run geometry, CSS, and build tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx
npm run test:renderer
npm run typecheck
npm run build:renderer
```

Expected: orientation/minimum/state tests PASS and renderer builds.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer-react/features/charts/workbench/ChartResultSummary.tsx src/renderer-react/features/charts/workbench/ChartResultShell.tsx src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx src/renderer-react/features/charts/workbench/charts.css src/renderer-react/test/setup.ts src/renderer-react/styles/global.css
git commit -m "feat(charts): add responsive result workspace"
```

### Task 8: Integrate Both Routes and Apply Profile Intent Safely

**Files:**
- Create: `src/renderer-react/features/charts/workbench/ChartWorkbenchPage.tsx`
- Create: `src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx`
- Modify: `src/renderer-react/shell/AppShell.tsx`
- Modify: `src/renderer-react/shell/AppShell.test.tsx`

- [ ] **Step 1: Write failing route and intent tests**

Render personal and relationship pages with real QueryClient/store and mocked
parsed API. Assert defaults `natal` and `synastry`; editing never computes;
Calculate computes once and renders the successful summary; edit marks
stale, revert clears stale; failed retry retains result; no profiles shows the
profile-required result state while filters remain visible.

Publish `{ route:'relationship', chartType:'synastry', primaryProfileId:'p1' }`,
enter personal and assert intent remains. Enter relationship before profiles
load and assert it remains. Resolve profiles, assert one atomic draft transition
applies type/profile, read the store back, then consumes intent. Make draft
application throw and assert intent remains. Assert intent application computes
zero times.

- [ ] **Step 2: Run test and verify missing page**

Run: `npm run test:renderer -- src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx`

Expected: FAIL with unresolved `ChartWorkbenchPage`.

- [ ] **Step 3: Compose the shared route kernel**

Implement this exported component signature:

```tsx
export function ChartWorkbenchPage({ route }: { route: ChartRoute }): JSX.Element;
```

Fetch catalog/reference through TanStack Query keys `['western-chart-catalog']`
and `['western-chart-reference']`. A catalog/parser startup failure renders in
the result body, not a full-app crash. Intent flow must be `peek -> validate ->
single initialize/edit action -> read-back equality -> consumeChartIntent()`.
Do not consume invalid/unavailable intents.

- [ ] **Step 4: Replace only personal and relationship route stubs**

In `AppShell.tsx`, render:

```tsx
{activeRoute === 'profiles' ? <ProfilePage onNavigate={navigate} />
  : activeRoute === 'personal' || activeRoute === 'relationship'
    ? <ChartWorkbenchPage route={activeRoute} />
    : <section className="workspace__placeholder" aria-labelledby="workspace-title">
        <PageIcon aria-hidden="true" size={34} strokeWidth={1.5} />
        <p>{t('shell.placeholder', { title })}</p>
      </section>}
```

Keep shell navigation, AI panel, appearance controls, and dirty-navigation
behavior unchanged. Keep the existing route-stub markup in the final branch for
Chinese, solar-term, and settings routes without duplicating it.

- [ ] **Step 5: Run integration tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx src/renderer-react/shell/AppShell.test.tsx
npm run test:renderer
npm run typecheck
```

Expected: both real routes, intent semantics, complete renderer suite, and
typecheck PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/workbench/ChartWorkbenchPage.tsx src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx src/renderer-react/shell/AppShell.tsx src/renderer-react/shell/AppShell.test.tsx
git commit -m "feat(charts): integrate western chart routes"
```

### Task 9: Final Workspace Verification and Review

**Files:**
- Test: `src/renderer-react/features/charts/workbench/chartDraft.test.ts`
- Test: `src/renderer-react/features/charts/workbench/chartCalculation.test.tsx`
- Test: `src/renderer-react/features/charts/workbench/ChartFilterBand.test.tsx`
- Test: `src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`
- Test: `src/renderer-react/features/charts/workbench/ChartWorkbenchPage.test.tsx`
- Test: `src/renderer-react/stores/chartWorkspace.test.ts`
- Test: `src/renderer-react/stores/chartWorkspacePersistence.test.ts`
- Test: `src/renderer-react/shell/AppShell.test.tsx`

- [ ] **Step 1: Verify scope and invariant scans**

Run:

```powershell
rg "computeChart" src/renderer-react/features/charts src/renderer-react/stores
rg "window\.innerWidth|matchMedia" src/renderer-react/features/charts/workbench
rg "ChartWheel|<svg|TanStack Table|useReactTable" src/renderer-react/features/charts/workbench
```

Expected: compute appears only in the calculation/API path and tests; no
viewport-driven result orientation; no SVG implementation or rich table exists
in this increment.

- [ ] **Step 2: Run complete working-increment verification**

Run:

```powershell
npm test
npm run test:security
npm run test:preload
npm run test:renderer
npm run typecheck
npm run build:renderer
git diff --check
```

Expected: all commands exit 0; personal and relationship routes build with a
usable successful summary and retained failure states.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review`. Require review of all 20 visible
mappings, no auto-calculate path, immutable submission, latest-sequence-only
commit, cancellation non-revival, failure retention, recents/reset/clear,
intent apply-before-consume, measured 760px split, and no plan-3/4 scope leakage.

- [ ] **Step 4: Commit review corrections**

When corrections are needed:

```powershell
git add package.json package-lock.json src/renderer-react locale/zh.json
git commit -m "fix(charts): address workspace review"
```

Expected: no commit when no corrections are required; otherwise rerun Step 2
after the commit.
