# React Chart SVG Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chart-pane interim summary with the existing 740-unit wheel geometry rendered through React, with stable identities, accessible hover/focus, layers, bounded pan/zoom, fit/reset, linkage hooks, and standalone SVG export.

**Architecture:** The legacy `ChartWheel` remains the sole geometry generator; small additive groups/data attributes make its existing paths addressable without changing angle math, radii, label spreading, house placement, or aspect endpoints. A typed adapter parses that finite inline SVG into React-owned markup, while Zustand remains the single interaction state owner and a controller applies transforms/layers without recalculating astronomy.

**Tech Stack:** React 19, TypeScript, Zustand 5, inline SVG/DOMParser/XMLSerializer, legacy ES module ChartWheel, Lucide React, Vitest, React Testing Library, jsdom geometry stubs

---

## Dependencies and Handoff

This is plan 3 of 4. It requires plans 1 and 2 complete and consumes
`NormalizedChartResult`, ring-qualified IDs, `chartWorkspaceStore`,
`LayerState`, `ChartTransform`, and `ChartResultShell`. Do not change the ID
formats defined in plan 1 or calculation lifecycle defined in plan 2.

This plan exports for plan 4:

- `ChartSelectionTarget = { identity: ChartIdentity; tab: 'planets' | 'houses' | 'aspects' }`.
- `selectionTargetForIdentity(result, identity)` from `chartSelection.ts`.
- `InteractiveChart`, accepting `onRevealSelection(target)` for chart-to-table linkage.
- `focusChartIdentity(identity)` through the existing Zustand store for table-to-chart linkage.
- `serializeChartSvg(svg, options)` and `downloadSvg(svg, filename, options)` from `svgExport.ts`.

Plan 4 connects `onRevealSelection` to virtual table row reveal and invokes
`setFocus` from active table rows. It must not add a second chart selection store.

## File Map

- Modify `src/renderer/app/components/ChartWheel.js`: additive semantic groups/data attributes and exported pure geometry helpers only.
- Create `src/renderer-react/types/legacy-chart-wheel.d.ts`: exact module declaration for the existing ES module.
- Create `src/renderer-react/features/charts/svg/legacyGeometry.ts`: typed invocation and finite-SVG validation.
- Create `src/renderer-react/features/charts/svg/legacyGeometry.test.ts`: unchanged geometry snapshots, spread/collision accessibility, and finite attributes.
- Create `src/renderer-react/features/charts/svg/chartSelection.ts`: identity-to-tab mapping and existence checks.
- Create `src/renderer-react/features/charts/svg/chartSelection.test.ts`: point/house/aspect target mapping.
- Create `src/renderer-react/features/charts/svg/InteractiveChart.tsx`: React SVG host, delegated pointer/keyboard interaction, and accessible object facts.
- Create `src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`: hover, locked focus, toggle, Escape, recalculation retention, and accessibility.
- Create `src/renderer-react/features/charts/svg/chartLayers.ts`: default/reset/coupling visibility predicates.
- Create `src/renderer-react/features/charts/svg/chartLayers.test.ts`: major/minor/house/label/ring coupling.
- Create `src/renderer-react/features/charts/svg/ChartLayerMenu.tsx`: accessible layer switches and reset.
- Create `src/renderer-react/features/charts/svg/chartTransform.ts`: zoom/pan/reset/fit math.
- Create `src/renderer-react/features/charts/svg/chartTransform.test.ts`: bounds, bbox union, fallback, and resize retention.
- Create `src/renderer-react/features/charts/svg/useChartTransform.ts`: wheel/pinch/pointer/keyboard controller.
- Create `src/renderer-react/features/charts/svg/ChartToolbar.tsx`: zoom/reset/fit/layers/export commands.
- Create `src/renderer-react/features/charts/svg/svgExport.ts`: clean standalone UTF-8 SVG serialization.
- Create `src/renderer-react/features/charts/svg/svgExport.test.ts`: exact exclusions/styles/current transform.
- Modify `src/renderer-react/features/charts/workbench/ChartResultShell.tsx`: render `InteractiveChart` in chart pane.
- Modify `src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`: successful chart integration and failed-result retention.
- Modify `src/renderer-react/features/charts/workbench/charts.css`: full-pane wheel, toolbar, focus/layer encodings.
- Modify `locale/zh.json` and `src/renderer-react/shell/locale.test.ts`: chart command and accessibility labels.

### Task 1: Add Stable Semantic Groups Without Changing Legacy Geometry

**Files:**
- Modify: `src/renderer/app/components/ChartWheel.js`
- Create: `src/renderer-react/types/legacy-chart-wheel.d.ts`
- Create: `src/renderer-react/features/charts/svg/legacyGeometry.ts`
- Create: `src/renderer-react/features/charts/svg/legacyGeometry.test.ts`

- [ ] **Step 1: Capture failing geometry and identity tests**

Create a deterministic one-ring and two-ring normalized fixture. Snapshot the
legacy SVG's `viewBox`, every `path[d]`, line endpoint tuple, point dot tuple,
and text `(x,y,textContent)` before semantic decoration. Assert the adapted SVG
has these exact IDs:

```ts
expect(identities(svg)).toEqual(expect.arrayContaining([
  'ring:natal', 'natal:sun', 'house:1',
  'aspect:natal:moon:trine:natal:sun',
  'ring:transit', 'transit:saturn',
]));
```

Assert every numeric `x`, `y`, `x1`, `y1`, `x2`, `y2`, `cx`, `cy`, `r`,
`width`, `height`, `viewBox`, and parsed path number is finite and serialized
SVG lacks `NaN`, `Infinity`, and `undefined`. For clustered longitudes
`[359, 0, 1, 2]`, assert `spreadAngles([359, 0, 1, 2], 11)` returns four finite positions,
keeps source ordering by index, and each identity remains separately targetable;
do not assert universal glyph collision absence.

- [ ] **Step 2: Run the test and verify missing adapter/identity failure**

Run: `npm run test:renderer -- src/renderer-react/features/charts/svg/legacyGeometry.test.ts`

Expected: FAIL because `legacyGeometry.ts` is missing and current SVG has no
house/aspect/ring-qualified identity groups.

- [ ] **Step 3: Export pure helpers and add semantic wrappers to ChartWheel**

Export existing `spreadAngles` and `midLongitude` without changing their bodies.
Change `_planetRings` to pass each actual `ring.id` into `_planets`; wrap each
ring in:

```js
const ringMarkup = this._planets(ring.points, radius, ctx, ring.id);
out += `<g data-chart-kind="ring" data-chart-identity="ring:${escapeAttribute(ring.id)}" data-ring-id="${escapeAttribute(ring.id)}">${ringMarkup}</g>`;
```

Change point groups to `data-chart-kind="point"` and
`data-chart-identity="${ring.id}:${p.key}"`. Wrap each house's existing cusp line
and number text in a `data-chart-kind="house" data-chart-identity="house:${cusp.index}"`
group. Wrap each aspect's existing line in `data-chart-kind="aspect"` and the
already-normalized `asp.id`. Add `escapeAttribute` that escapes `&`, `"`, `<`,
and `>`; parser validation already constrains identity source types.

Do not alter `_polar`, `_sector`, radii, spread separation, styles, endpoints,
label text, ordering, or the 740-unit default.

- [ ] **Step 4: Declare and implement the typed adapter**

Declare the legacy module exports:

```ts
declare module '../../../../renderer/app/components/ChartWheel.js' {
  export class ChartWheel {
    constructor(reference: ChartReferenceData & { _wheelLocale?: Record<string, string> }, chartConfig?: AppChartConfig);
    toSvg(chart: NormalizedChartResult): string;
  }
  export function spreadAngles(longitudes: number[], minSep: number): number[];
  export function midLongitude(left: number, right: number): number;
}
```

Create `legacyGeometry.ts`:

```ts
export interface LegacySvgDocument { markup: string; document: XMLDocument }
export function createLegacySvg(result: NormalizedChartResult, reference: ChartReferenceData, config?: AppChartConfig): LegacySvgDocument;
export function assertFiniteSvg(svg: SVGSVGElement | XMLDocument): void;
```

Instantiate `ChartWheel`, parse with `new DOMParser().parseFromString(markup, 'image/svg+xml')`, reject a
`parsererror`, call `assertFiniteSvg`, verify root `viewBox="0 0 740 740"` when
config has no size override, and return serialized markup/document.

- [ ] **Step 5: Run geometry and legacy smoke tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/legacyGeometry.test.ts
npm run smoke
```

Expected: geometry coordinates match snapshots, identities exist, all numbers
are finite, and legacy chart smoke still passes.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/app/components/ChartWheel.js src/renderer-react/types/legacy-chart-wheel.d.ts src/renderer-react/features/charts/svg/legacyGeometry.ts src/renderer-react/features/charts/svg/legacyGeometry.test.ts
git commit -m "feat(charts): adapt legacy wheel geometry"
```

### Task 2: Map Identities to One Shared Selection Interface

**Files:**
- Create: `src/renderer-react/features/charts/svg/chartSelection.ts`
- Create: `src/renderer-react/features/charts/svg/chartSelection.test.ts`
- Modify: `src/renderer-react/stores/chartWorkspace.test.ts`

- [ ] **Step 1: Write failing target and store-selection tests**

Assert:

```ts
expect(selectionTargetForIdentity(result, 'natal:sun')).toEqual({ identity: 'natal:sun', tab: 'planets' });
expect(selectionTargetForIdentity(result, 'house:10')).toEqual({ identity: 'house:10', tab: 'houses' });
expect(selectionTargetForIdentity(result, result.aspects[0].id)).toEqual({ identity: result.aspects[0].id, tab: 'aspects' });
expect(selectionTargetForIdentity(result, 'ring:natal')).toBeNull();
expect(selectionTargetForIdentity(result, 'natal:missing')).toBeNull();
```

In store tests, assert `setFocus(id)` replaces prior focus, activating the same
ID clears it, `clearFocus()` clears it, hover never changes focus/tab, and a
successful result retains focus only if `result.identities` still contains it.

- [ ] **Step 2: Run tests and verify missing mapping**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/chartSelection.test.ts src/renderer-react/stores/chartWorkspace.test.ts
```

Expected: FAIL because selection mapper and toggle semantics are absent.

- [ ] **Step 3: Implement exact mapping**

Create:

```ts
export type ChartSelectionTarget = { identity: ChartIdentity; tab: 'planets' | 'houses' | 'aspects' };
export function selectionTargetForIdentity(result: NormalizedChartResult, identity: ChartIdentity): ChartSelectionTarget | null;
```

Check identity membership first. Match `house:` and `aspect:` prefixes before
point IDs; ring IDs return null. Do not parse point IDs by splitting on all
colons; match the complete `point.id` from normalized rings.

- [ ] **Step 4: Add store toggle/clear behavior**

Make `setFocus(identity)` toggle equal identity and replace different identity.
Add `clearFocus()`. Neither action clears active tab. Hover remains a separate
nullable identity. Preserve plan-2 success/failure retention rules.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/chartSelection.test.ts src/renderer-react/stores/chartWorkspace.test.ts
npm run typecheck
```

Expected: PASS.

```powershell
git add src/renderer-react/features/charts/svg/chartSelection.ts src/renderer-react/features/charts/svg/chartSelection.test.ts src/renderer-react/stores/chartWorkspace.ts src/renderer-react/stores/chartWorkspace.test.ts
git commit -m "feat(charts): unify chart selection identity"
```

### Task 3: Render Accessible Hover and Locked Selection in React

**Files:**
- Create: `src/renderer-react/features/charts/svg/InteractiveChart.tsx`
- Create: `src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`
- Modify: `src/renderer-react/features/charts/workbench/ChartResultShell.tsx`
- Modify: `src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`

- [ ] **Step 1: Write failing pointer, keyboard, and accessibility tests**

Render a two-ring result and assert all point/house/aspect groups have
`tabIndex=0`, `role=button`, and an accessible name containing ring/point or
house/aspect facts. Pointer enter shows a concise tooltip and writes hover only;
pointer leave clears hover. Click and Enter lock one ID and call
`onRevealSelection({ identity, tab })`; clicking the focused ID unlocks it.
Escape from any chart descendant clears focus. A user tab switch does not clear
chart emphasis. Re-render after failed/cancelled request retains focus; accepted
result missing the ID clears via store logic.

Assert hover facts are not inside the polite live status region and focused vs
hovered states have separate data attributes.

- [ ] **Step 2: Run test and verify missing component**

Run: `npm run test:renderer -- src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`

Expected: FAIL with unresolved `InteractiveChart`.

- [ ] **Step 3: Implement React ownership around legacy markup**

Use this interface:

```ts
export interface InteractiveChartProps {
  result: NormalizedChartResult; reference: ChartReferenceData; config?: AppChartConfig;
  onRevealSelection?(target: ChartSelectionTarget): void;
  onSvgReady?(svg: SVGSVGElement | null): void;
}
```

Generate markup with `createLegacySvg`, render it into a chart-only host, then in
`useLayoutEffect` decorate `[data-chart-identity]` nodes with role, tabindex,
`aria-label`, and current `data-focused`/`data-hovered`. Use event delegation on
the host and `closest('[data-chart-identity]')`; validate the identity against
`result.identities` before store actions. Build labels from normalized objects,
not from parsing SVG text. Remove listeners in cleanup.

- [ ] **Step 4: Integrate only the chart pane**

Replace the plan-2 chart interim summary in `ChartResultShell` with
`InteractiveChart` when a retained successful result exists. Keep empty/loading/
failure status behavior and `ChartResultSummary`; do not alter the data-pane
interim data summary. Pass `onRevealSelection` through `ChartResultShell` as an optional
prop for plan 4.

- [ ] **Step 5: Run interaction and shell tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/InteractiveChart.test.tsx src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx
npm run typecheck
```

Expected: pointer/keyboard/retention/accessibility tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/svg/InteractiveChart.tsx src/renderer-react/features/charts/svg/InteractiveChart.test.tsx src/renderer-react/features/charts/workbench/ChartResultShell.tsx src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx
git commit -m "feat(charts): add accessible wheel selection"
```

### Task 4: Implement Layer Defaults, Coupling, Menu, and Reset

**Files:**
- Modify: `src/renderer/app/components/ChartWheel.js`
- Create: `src/renderer-react/features/charts/svg/chartLayers.ts`
- Create: `src/renderer-react/features/charts/svg/chartLayers.test.ts`
- Create: `src/renderer-react/features/charts/svg/ChartLayerMenu.tsx`
- Modify: `src/renderer-react/features/charts/svg/InteractiveChart.tsx`
- Modify: `src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`
- Modify: `src/renderer-react/stores/chartWorkspace.ts`

- [ ] **Step 1: Write failing layer and coupling tests**

Assert defaults are major true, minor false, houses true, labels true, every
current result ring true. Assert hiding ring `transit` hides its point group and
every aspect where `ringA` or `ringB` is transit, while explorer identity/focus
remain. Hiding labels hides degree/sign/retrograde text and leaders but not point
glyph/dot target. Houses toggle cusp lines, numbers, all angle axes/labels.
Major/minor use `reference.aspects[key].level`, not a hardcoded aspect list.
Layer Reset restores defaults but leaves transform, focus, filters, Advanced
settings, and table layout byte-equivalent.

- [ ] **Step 2: Run tests and verify missing predicates**

Run: `npm run test:renderer -- src/renderer-react/features/charts/svg/chartLayers.test.ts`

Expected: FAIL with unresolved `chartLayers`.

- [ ] **Step 3: Implement pure layer state and visibility**

Export:

```ts
export function defaultLayers(result: NormalizedChartResult): LayerState;
export function isIdentityVisible(identity: ChartIdentity, result: NormalizedChartResult, reference: ChartReferenceData, layers: LayerState): boolean;
export function applyLayers(svg: SVGSVGElement, result: NormalizedChartResult, reference: ChartReferenceData, layers: LayerState): void;
```

Set `hidden` and `aria-hidden` on semantic groups. Add additive legacy data hooks
`data-chart-part="label|leader|glyph|dot|cusp|house-number|angle"` in Task 1
locations without changing geometry; `applyLayers` uses these hooks. Hidden
focused identities remain in store and do not become keyboard targets until
visible again.

- [ ] **Step 4: Implement accessible layer controls**

`ChartLayerMenu` renders checkboxes/switches for major, minor, houses, labels,
and each `ring.id` with ring label and non-color line-style sample. Use a Layers
Lucide icon, tooltip, named popover/menu, and Reset Layers text command. Invoke
only `setLayers` or `resetLayers(result)`.

- [ ] **Step 5: Apply layers after markup and state changes**

In `InteractiveChart` call `applyLayers` after SVG creation and whenever layer
state/reference/result changes. Reapply focus attributes without un-hiding
groups. Add tests that toggling hidden layers does not remove rows/identities or
clear focus.

- [ ] **Step 6: Run layer and interaction tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/chartLayers.test.ts src/renderer-react/features/charts/svg/InteractiveChart.test.tsx
npm run typecheck
```

Expected: defaults/coupling/reset/accessibility PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/app/components/ChartWheel.js src/renderer-react/features/charts/svg/chartLayers.ts src/renderer-react/features/charts/svg/chartLayers.test.ts src/renderer-react/features/charts/svg/ChartLayerMenu.tsx src/renderer-react/features/charts/svg/InteractiveChart.tsx src/renderer-react/features/charts/svg/InteractiveChart.test.tsx src/renderer-react/stores/chartWorkspace.ts
git commit -m "feat(charts): add wheel layer controls"
```

### Task 5: Add Bounded Zoom, Pan, Reset View, and Fit Visible

**Files:**
- Create: `src/renderer-react/features/charts/svg/chartTransform.ts`
- Create: `src/renderer-react/features/charts/svg/chartTransform.test.ts`
- Create: `src/renderer-react/features/charts/svg/useChartTransform.ts`
- Create: `src/renderer-react/features/charts/svg/ChartToolbar.tsx`
- Modify: `src/renderer-react/features/charts/svg/InteractiveChart.tsx`

- [ ] **Step 1: Write failing transform math and controller tests**

Assert `zoomAt({scale:1,x:0,y:0}, 2, {x:370,y:370})` preserves the cursor's
logical point; scales clamp to `0.5` and `8`; pointer/keyboard pan update x/y;
Reset returns `{ scale:1,x:0,y:0 }`; resize does not change logical transform.

Mock visible `getBBox()` values `{x:10,y:20,width:100,height:80}` and
`{x:200,y:100,width:50,height:50}`; assert union plus 24 units is
`{x:-14,y:-4,width:288,height:178}` and fitted transform centers it. Hidden or
zero-size groups are excluded. No nonzero bounds returns reset. Assert Fit does
not mutate layers/focus and Reset does not mutate either.

- [ ] **Step 2: Run tests and verify missing transform module**

Run: `npm run test:renderer -- src/renderer-react/features/charts/svg/chartTransform.test.ts`

Expected: FAIL with unresolved `chartTransform`.

- [ ] **Step 3: Implement pure transform math**

Export:

```ts
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;
export const RESET_TRANSFORM: ChartTransform = { scale: 1, x: 0, y: 0 };
export interface SvgBounds { x: number; y: number; width: number; height: number }
export function zoomAt(transform: ChartTransform, factor: number, anchor: { x: number; y: number }): ChartTransform;
export function panBy(transform: ChartTransform, dx: number, dy: number): ChartTransform;
export function visibleBounds(svg: SVGSVGElement): SvgBounds | null;
export function fitBounds(bounds: SvgBounds | null, viewport: { width: number; height: number }, padding?: number): ChartTransform;
```

Use padding default 24 SVG units. Validate all outputs finite; on invalid/empty
bounds return reset.

- [ ] **Step 4: Implement one pointer/wheel/pinch/keyboard controller**

`useChartTransform({ svgRef, transform, onChange })` handles wheel with
`preventDefault`, two-pointer pinch, one-pointer pan with capture, and arrow-key
pan in 16 SVG-unit steps (`Shift` uses 48). Convert client coordinates through
`getScreenCTM().inverse()` when available and a finite viewBox/clientRect
fallback in tests. Cleanup pointer maps/listeners on unmount.

- [ ] **Step 5: Render toolbar and transform wrapper**

Use Lucide `ZoomIn`, `ZoomOut`, `Move`, `Maximize`, `RotateCcw`, `Layers`, and
`Download`. Apply transform only to an inner `data-chart-transform` group
wrapping chart geometry, never the root SVG/toolbar. Reset View writes reset;
Fit Visible reads current visible geometry. Keep transform on ResizeObserver
changes and failed/cancelled requests.

- [ ] **Step 6: Run transform, interaction, and full renderer tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/chartTransform.test.ts src/renderer-react/features/charts/svg/InteractiveChart.test.tsx
npm run test:renderer
npm run typecheck
```

Expected: bounds/controllers/retention PASS without layout shifts.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer-react/features/charts/svg/chartTransform.ts src/renderer-react/features/charts/svg/chartTransform.test.ts src/renderer-react/features/charts/svg/useChartTransform.ts src/renderer-react/features/charts/svg/ChartToolbar.tsx src/renderer-react/features/charts/svg/InteractiveChart.tsx src/renderer-react/features/charts/svg/InteractiveChart.test.tsx
git commit -m "feat(charts): add wheel pan zoom and fit"
```

### Task 6: Export a Clean Standalone SVG

**Files:**
- Create: `src/renderer-react/features/charts/svg/svgExport.ts`
- Create: `src/renderer-react/features/charts/svg/svgExport.test.ts`
- Modify: `src/renderer-react/features/charts/svg/ChartToolbar.tsx`

- [ ] **Step 1: Write failing exact export tests**

Build a live SVG with hidden minor/ring groups, current transform, focused and
hovered attributes, tooltip/selection/focus decorations, and external class
styles. Assert serialized output begins `<svg xmlns="http://www.w3.org/2000/svg"`,
contains current visible geometry and transform, omits hidden groups and all
`data-focused`, `data-hovered`, tooltip, focus outline, resize handle, and
control nodes, includes inline font fallback/style, has finite attributes, and
does not mutate the original SVG/layers/transform.

- [ ] **Step 2: Run test and verify missing exporter**

Run: `npm run test:renderer -- src/renderer-react/features/charts/svg/svgExport.test.ts`

Expected: FAIL with unresolved `svgExport`.

- [ ] **Step 3: Implement clone-clean-serialize**

Export:

```ts
export interface SvgExportOptions { title: string; description: string }
export function serializeChartSvg(svg: SVGSVGElement, options: SvgExportOptions): string;
export function downloadSvg(svg: SVGSVGElement, filename: string, options: SvgExportOptions): void;
```

Deep-clone the SVG; remove `[hidden]`, `[aria-hidden=true]`, and
`[data-export-exclude]`; strip interaction-only attributes/classes; prepend
`title`, `desc`, and a `defs > style` with Maple/Segoe UI/Symbol fallbacks and
the resolved chart colors needed by visible nodes. Set XML namespace, preserve
current viewBox/transform, call `assertFiniteSvg`, serialize with
`XMLSerializer`, and return UTF-8 text. `downloadSvg` uses Blob type
`image/svg+xml;charset=utf-8`, object URL, hidden anchor, and always revokes URL.

- [ ] **Step 4: Connect toolbar export**

Use filename `${result.meta.type}-${result.meta.generatedAt.replace(/[:.]/g, '-')}.svg`.
The Download icon has tooltip and accessible name `导出 SVG`. Export does not
write store state.

- [ ] **Step 5: Run export and interaction tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/svgExport.test.ts src/renderer-react/features/charts/svg/InteractiveChart.test.tsx
npm run typecheck
```

Expected: exact clean serialization and toolbar tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/svg/svgExport.ts src/renderer-react/features/charts/svg/svgExport.test.ts src/renderer-react/features/charts/svg/ChartToolbar.tsx
git commit -m "feat(charts): export standalone wheel SVG"
```

### Task 7: Finish Styling, Locale, and Chart-Pane Accessibility

**Files:**
- Modify: `src/renderer-react/features/charts/workbench/charts.css`
- Modify: `locale/zh.json`
- Modify: `src/renderer-react/shell/locale.test.ts`
- Modify: `src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`

- [ ] **Step 1: Write failing CSS and locale assertions**

Add tests that require fixed toolbar button dimensions, SVG `width/height:100%`,
`aspect-ratio:1`, visible focus in both themes, distinct hover/focus encodings,
non-color ring line-style hooks, no overflow over result header/data pane, and
all command labels/tooltips. Assert chart host remains nonzero at a 360px pane.

- [ ] **Step 2: Run tests and observe missing hooks/keys**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/svg/InteractiveChart.test.tsx src/renderer-react/shell/locale.test.ts
```

Expected: FAIL on missing style hooks and locale keys.

- [ ] **Step 3: Add stable chart-pane styling**

Use an unframed full-pane chart surface, absolute compact toolbar that reserves
its own top strip, square SVG constrained by `min(100%, available height)`,
fixed 32/36px density controls, visible focus stroke plus halo, hover opacity
plus line-weight, selected unrelated-mark de-emphasis that remains readable,
and patterned/dashed ring/aspect encoding in addition to color. No card wraps
the SVG and no controls overlap its interaction region.

- [ ] **Step 4: Add exact locale labels**

Add labels for zoom in/out, pan hint, Reset View, Fit Visible, Layers, Layer
Reset, each layer, ring visibility, SVG export, chart object labels, locked/
hover facts, and selection cleared. Add all paths to locale test.

- [ ] **Step 5: Run renderer verification and commit**

Run:

```powershell
npm run test:renderer
npm run typecheck
npm run build:renderer
```

Expected: all pass.

```powershell
git add src/renderer-react/features/charts/workbench/charts.css locale/zh.json src/renderer-react/shell/locale.test.ts src/renderer-react/features/charts/svg/InteractiveChart.test.tsx
git commit -m "style(charts): finish interactive wheel surface"
```

### Task 8: Final SVG Verification and Review

**Files:**
- Test: `src/renderer-react/features/charts/svg/legacyGeometry.test.ts`
- Test: `src/renderer-react/features/charts/svg/chartSelection.test.ts`
- Test: `src/renderer-react/features/charts/svg/chartLayers.test.ts`
- Test: `src/renderer-react/features/charts/svg/chartTransform.test.ts`
- Test: `src/renderer-react/features/charts/svg/svgExport.test.ts`
- Test: `src/renderer-react/features/charts/svg/InteractiveChart.test.tsx`
- Test: `src/renderer-react/features/charts/workbench/ChartResultShell.test.tsx`
- Test: `tests/SmokeRenderer.js`

- [ ] **Step 1: Scan geometry and identity invariants**

Run:

```powershell
rg "_polar|_sector|spreadAngles|midLongitude" src/renderer/app/components/ChartWheel.js src/renderer-react/features/charts/svg
rg "data-chart-identity|pointIdentity|houseIdentity|aspectIdentity" src/renderer/app/components/ChartWheel.js src/renderer-react/features/charts
rg "NaN|Infinity|undefined" src/renderer-react/features/charts/svg
```

Expected: geometry formulas remain only in legacy ChartWheel; IDs originate in
plan-1 normalization and are consumed, not reconstructed inconsistently; the
third command finds only explicit rejection tests/messages.

- [ ] **Step 2: Run complete working-increment verification**

Run:

```powershell
npm test
npm run test:renderer
npm run typecheck
npm run build:renderer
npm run smoke
git diff --check
```

Expected: all commands exit 0; both legacy and React unit paths render finite
wheel geometry and no plan-4 explorer exists yet.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review`. Require review of unchanged geometry,
ring-qualified IDs, duplicate-safe endpoint resolution, hover vs one locked
focus, keyboard behavior, layer coupling/reset isolation, transform bounds,
24-unit Fit Visible, resize retention, clean current-state SVG export, and chart
selection handoff for plan 4.

- [ ] **Step 4: Commit review corrections**

When review requires corrections:

```powershell
git add src/renderer/app/components/ChartWheel.js src/renderer-react/features/charts/svg src/renderer-react/features/charts/workbench src/renderer-react/stores/chartWorkspace.ts locale/zh.json
git commit -m "fix(charts): address SVG interaction review"
```

Expected: no commit when review is clean; otherwise rerun Step 2 after commit.
