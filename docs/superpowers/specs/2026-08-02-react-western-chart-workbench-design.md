# React Western Chart Workbench Design

**Date:** 2026-08-02
**Status:** Approved
**Parent specification:** `docs/superpowers/specs/2026-08-01-react-workbench-redesign-design.md`

## 1. Purpose

This specification defines the first React release of the personal and
relationship western chart workbenches. It specializes the parent redesign
without replacing its shell, profile, theme, density, or AI decisions.

The release provides all 20 chart types already registered by
`AstrologyService`, preserves the working calculation/IPC/SVG path, fixes the
Swiss Ephemeris sidereal-zodiac defect, and replaces the React route
placeholders with one production workbench architecture.

The target user is a professional astrologer who repeatedly changes inputs,
compares exact values, and moves between the wheel, tables, exports, and AI
without losing a successful result.

## 2. Scope

### 2.1 In scope

- Personal and relationship workbench routes with all 20 existing western
  chart types.
- Swiss Ephemeris tropical and sidereal zodiac calculations, including
  known-value tests for sidereal behavior.
- An always-visible filter band, explicit calculation, stale-result handling,
  and result-local loading/error/empty states.
- A draggable chart/data result split with container-driven horizontal or
  vertical arrangement.
- Existing SVG geometry behind a stable React adapter, with interaction,
  layers, pan/zoom, fit/reset, and SVG export.
- Planets, houses, aspects, distributions, and comparison explorers with
  professional table behavior.
- Typed and runtime-validated `window.mystApi` chart contracts.
- Stable last-successful chart context for the AI workspace.
- Persisted recent selector values and versioned table layouts.
- Domain, React, Electron, visual, package, and shutdown verification.

### 2.2 Out of scope

- Calculation-rule redesign beyond the Swiss Ephemeris sidereal defect.
- Chinese astrology.
- AI chat implementation beyond producing accurate workbench context for the
  existing/shared AI feature.
- Print, PDF, and PNG export unless separately and explicitly approved.
- Rewriting the SVG wheel geometry or substituting a new chart renderer.
- Claims of collision-free labels. The release verifies clipping, overlap that
  blocks interaction, and access to exact values; it does not claim to measure
  every possible glyph collision.

## 3. Architecture

### 3.1 Shared kernel and route specialization

Personal and relationship routes use one workbench kernel. The kernel owns:

- draft/submitted/result state coordination;
- filter validation and calculation sequencing;
- chart normalization, identity, selection, and layer state;
- split layout and responsive stacking;
- explorer tables, comparison, copy, and export;
- last-successful AI context production.

Each route supplies only a catalog specialization: allowed chart definitions,
default chart type, dynamic-control descriptors, and route labels. Personal
defaults to `natal`; relationship defaults to `synastry`. No route forks the
calculation lifecycle, SVG adapter, explorer, or persistence logic.

The renderer treats `AstrologyService.chartTypes()` as the authoritative
runtime catalog and checks it against a compile-time exhaustive map of the 20
known tokens. Startup fails visibly in the result area if a catalog token has
no React descriptor or a descriptor names options not declared by the service.
This prevents silently dropping a newly exposed or mistyped type.

### 3.2 Process boundary

The renderer remains sandboxed and has no Node.js access. It calls only the
typed `window.mystApi` exposed by preload. Chart requests and response envelopes
are TypeScript types and are parsed at runtime, using the repository's Zod
boundary pattern, before feature code receives them.

Validation covers the request token, profiles, settings, options, IPC envelope,
chart metadata, subjects, houses, angles, rings, points, aspects,
distributions, and optional strategy metadata. Parser failure is a calculation
error; malformed data never reaches the SVG or tables.

Existing IPC channel names remain unchanged. Preload exposes narrow functions,
not `ipcRenderer`, Node globals, filesystem access, or generic channel invoke.

### 3.3 Calculation ownership

Zustand owns synchronous workbench state:

- current route catalog and draft parameters;
- the immutable submitted parameter snapshot;
- last successful result and the parameters that produced it;
- request sequence and visible request status;
- one focused chart identity and transient hover identity;
- visual layer state and chart transform;
- active explorer tab, comparison mode, and transient table row selection;
- per-exact-chart-type persisted table layouts.

TanStack Query owns calculation execution and async lifecycle. A calculation
query/mutation accepts an immutable submitted snapshot; draft objects are never
used as a mutable query input after dispatch. Query cache data does not by
itself replace Zustand's accepted last-successful result.

Parameter controls update only the draft. The Calculate command validates and
copies the draft to `submitted`, then dispatches exactly one request. There is
no calculation on field change, blur, route render, or selector recency update.

## 4. Filter Band

### 4.1 Visible controls

The filter band is always visible above the result area. In order, it contains:

1. Primary profile.
2. Chart type.
3. A chart-specific dynamic control group.
4. House system.
5. Zodiac (`tropical` or `sidereal`).
6. Advanced aspects trigger.
7. Calculate.

The dynamic group may contain zero, one, or two controls. Relationship charts
always include a second profile. The six progressed relationship charts also
include target datetime because both values are required by their service
contract. Controls wrap within the filter band at narrow widths; they never move
into a modal or disappear behind the result state.

### 4.2 Exact 20-type mapping

| Service token | Route | Visible dynamic input(s) | Request mapping |
| --- | --- | --- | --- |
| `natal` | Personal | None | No type-specific option |
| `transit` | Personal | Target datetime | `options.targetDate` ISO instant |
| `tertiaryProgressed` | Personal | Target datetime | `options.targetDate` ISO instant |
| `progressed` | Personal | Target datetime | `options.targetDate` ISO instant |
| `lunarReturn` | Personal | Target datetime | `options.targetDate` ISO instant |
| `solarReturn` | Personal | Return year | `options.year` integer |
| `solarArc` | Personal | Target datetime | `options.targetDate` ISO instant |
| `firdaria` | Personal | Target datetime | `options.targetDate` ISO instant |
| `profection` | Personal | Target datetime | `options.targetDate` ISO instant |
| `relocation` | Personal | Relocation place | `options.latitude`, `options.longitude`, `options.locationLabel` |
| `synastry` | Relationship | Second profile | `secondary` profile |
| `composite` | Relationship | Second profile | `secondary` profile |
| `marx` | Relationship | Second profile | `secondary` profile |
| `davison` | Relationship | Second profile | `secondary` profile |
| `compositeSecondary` | Relationship | Second profile and target datetime | `secondary`; `options.targetDate` ISO instant |
| `compositeTertiary` | Relationship | Second profile and target datetime | `secondary`; `options.targetDate` ISO instant |
| `marxSecondary` | Relationship | Second profile and target datetime | `secondary`; `options.targetDate` ISO instant |
| `marxTertiary` | Relationship | Second profile and target datetime | `secondary`; `options.targetDate` ISO instant |
| `davisonSecondary` | Relationship | Second profile and target datetime | `secondary`; `options.targetDate` ISO instant |
| `davisonTertiary` | Relationship | Second profile and target datetime | `secondary`; `options.targetDate` ISO instant |

The first release does not expose optional return/transit locations that are
accepted internally but absent from `AstrologyService.CHART_TYPES.options`.
Relocation place uses the shared trusted location resolver and submits finite
latitude/longitude values; free text alone is not a valid location.

### 4.3 Defaults, reset, clear, and recents

- Primary profile defaults to the persisted workspace primary when it exists,
  otherwise the profile-store fallback, otherwise the first profile.
- A second profile defaults to the most recently used profile distinct from the
  primary, otherwise the first distinct profile. With fewer than two profiles,
  relationship Calculate remains disabled and identifies the missing distinct
  profile beside the control.
- Target datetime defaults to the current local minute when the route draft is
  first created or reset, then serializes to an ISO instant.
- Return year defaults to the current local calendar year.
- Relocation defaults to the primary profile's resolved birth place.
- House system defaults to `placidus`; zodiac defaults to `tropical`.
- Reset restores these application defaults and current primary-profile
  fallback. It does not calculate.

Profile, chart type, house system, zodiac, and resolved relocation selectors
keep at most eight most-recently-used values per selector in workspace settings.
Insertion moves a value to the front; deduplication occurs by stable value ID;
deleted profile/place references are pruned. Target datetimes and return years
are not retained as recents. A relocation recent ID is the normalized
six-decimal latitude/longitude pair; its persisted label is display data and
does not affect identity.

"Clear recents" removes a selector's recent-history list without changing its
current value. "Clear" on an optional search query clears only the query. Every
submitted filter field is required, so clearing a selected value immediately
resolves to its documented fallback or leaves the field invalid with an inline
message; a required field never remains silently empty. Reset is broader and
restores all draft defaults. None of these actions submits a calculation.

### 4.4 Advanced aspects

Advanced contains only aspect enablement and per-aspect orb overrides. The ten
aspect keys and default orbs come from reference data. Reset Advanced enables
all catalog aspects and removes overrides so the engine defaults apply.

Overrides must be finite degrees in the inclusive range `0.1` through `15`.
Disabled aspects are excluded from calculation and therefore absent from tables
and SVG. Visual major/minor layer switches only hide or reveal calculated
aspects; they cannot restore an aspect disabled in Advanced.

## 5. Validation and Calculation Lifecycle

### 5.1 Validation

Calculate is disabled only when no profiles exist, a required value is absent
or invalid, a relationship uses the same profile twice, or an unresolved
request already has a snapshot structurally equal to the current valid draft.
A settled success, failure, or cancellation does not by itself disable a valid
retry/recalculation. Inline errors identify the field. Relationship charts
require two distinct persisted profile IDs; equal IDs are rejected in the
renderer and remain rejected by the domain.

Dates must parse to valid instants. Return year follows the current service
range of `1..3000`. Coordinates require latitude `-90..90` and longitude
`-180..180`. House, zodiac, chart, aspect, and profile IDs must be catalog
members at submission time.

### 5.2 Stale state

A successful result stores its exact accepted parameter snapshot. `stale` is
true whenever the current draft differs structurally from that snapshot. Edits
retain the result, focused selection, table state, and AI context while showing
a persistent stale indicator in the result header. Returning every draft field
to the accepted snapshot removes the stale indicator without recalculation.

Before the first success, the result area shows an empty prompt. Loading,
calculation errors, cancellation, and parser errors are confined to the result
area; filter controls remain enabled except for the equivalent-snapshot rule.

### 5.3 Sequencing, overlap, cancellation, and in-flight edits

Each Calculate increments a monotonically increasing request sequence and
captures the draft as an immutable submitted snapshot. A sequence may commit
success or visible failure only when it equals the latest issued sequence and
has not been cancelled. Late resolution from every older sequence is ignored
even if the latest request failed or was cancelled; cancellation never makes an
older sequence eligible again.

Starting a new calculation requests cancellation of the prior renderer/query
operation. Because the current Electron invoke contract cannot guarantee that
main-process work stops, cancellation means "stop awaiting and ignore its
settlement" unless a future trusted IPC cancellation contract is added. This
specification does not represent backend work as cancelled when it may still be
running.

Editing the draft during a request does not cancel or mutate that request. If it
succeeds, it becomes the last successful result for its captured snapshot and
is immediately marked stale when the current draft differs. Pressing Calculate
after the edit issues a newer sequence and makes the older response ineligible
to commit.

A failed or cancelled recalculation preserves the last successful result,
focused selection, bulk row selection where the rows still exist, chart
transform, and AI context. The result area shows the failure/cancellation status
without replacing the retained wheel and data. Retry captures the current
draft as a new sequence.

### 5.4 Profile chart intent

The profile feature may publish `natal`, `transit`, or `synastry` navigation
intent with a primary profile ID. On route entry, the workbench peeks at the
intent and validates that the route, chart type, and persisted profile exist.
It applies all valid fields to the draft in one state transition, then consumes
the intent only after reading back the draft confirms the values were applied.

An intent is not consumed when its profile is unavailable, its type is not in
the route catalog, or draft application throws. It remains available for a
profile-query retry or a later valid route. Applying an intent never calculates.

## 6. Result Layout

The filter band does not participate in the result split. Beneath it, a
`react-resizable-panels` group gives chart and data equal `50/50` space by
default and persists the user's ratio for each route orientation.

Responsiveness is based on the result container measured by `ResizeObserver`,
not the window viewport:

- At container widths of `760px` or greater, chart and data are horizontal.
- Below `760px`, they are vertically stacked, chart first.
- In horizontal mode each pane has a `360px` minimum and the divider occupies
  no more than `8px`; persisted ratios are clamped to those minima.
- In vertical mode the chart has a `360px` minimum height and receives 55% by
  default; the result area scrolls when the available shell height cannot meet
  both pane minima.

The `760px` trigger permits the existing `1440x920` shell's navigation and AI
columns to remain visible while retaining a usable chart, and lets the existing
shell continue collapsing navigation and moving AI to an overlay near
`1100x720`. The workbench does not duplicate or override shell breakpoints.

Empty, loading, stale, failure, and cancellation indicators are rendered inside
the result header/body. They do not resize, cover, disable, or replace the
filter band.

## 7. SVG Chart Adapter

### 7.1 Stable boundary

The existing `ChartWheel` geometry, 740-unit coordinate system, angle math,
label spreading, rings, houses, and aspect paths remain authoritative behind a
React adapter. The adapter may add stable groups/data attributes, event
delegation, visibility, focus decoration, and transform wrappers; it must not
recalculate astronomical positions or replace geometry formulas.

The adapter accepts normalized chart data, reference data, layer state,
transform, focused identity, hover identity, and callbacks. It returns an
inline SVG suitable for interaction and serialization. Generated numeric SVG
attributes must all be finite; `NaN`, `Infinity`, and `undefined` are release
failures.

### 7.2 Stable identities

Identities are deterministic within a normalized successful result:

- Ring: `ring:<ring.id>`, using the service ring ID after parser validation for
  uniqueness.
- Planet/point: `<ring.id>:<point.key>`, for example `transit:saturn`.
- House: `house:<index>`, where index is `1..12` in the result's authoritative
  house frame.
- Aspect: `aspect:<ringA>:<point1>:<aspectKey>:<ringB>:<point2>`.

For single-ring/intra-ring aspects, both ring IDs are the same and endpoints are
lexically ordered before constructing the ID. For two-ring cross aspects,
`ringA` is the first service ring and `ringB` the second, matching the strategy
contract; endpoint order is retained. Parser normalization rejects duplicate
ring IDs, duplicate point keys within a ring, duplicate house indexes, and
duplicate derived aspect IDs.

House identities deliberately do not claim a planet ring because the current
DTO has one authoritative house frame. Aspect normalization qualifies the
service's currently unqualified `point1`/`point2` keys before interaction state
sees them.

### 7.3 Hover and focused selection

Hover is temporary and never changes tabs or the locked detail. Click or
keyboard activation locks exactly one planet/point, house, or aspect in Zustand.
Activating the already focused identity unlocks it; `Escape` also clears focus.
A new focus replaces the prior one.

The SVG interaction surface has exactly two sequential chart-domain tab stops:
the root canvas/viewport and one visible semantic object in a roving-tabindex
composite. The root uses `role="application"`, `tabindex="0"`, and an accessible
name that explains both modes. Plain Arrow keys pan the canvas by 16 SVG units;
`Shift+Arrow` pans by 48. Canvas focus, `Enter`, and `Space` never lock or clear
an object. Within the object composite, exactly one visible object has
`tabindex="0"` and all other visible objects have `tabindex="-1"`; Arrow keys
move focus in non-wrapping DOM order, `Home`/`End` move to the first/last visible
object, and object key handling stops propagation so it cannot pan the canvas.
Only object `Enter`/`Space` activates selection. `Tab` and `Shift+Tab` move
deterministically between the canvas and current object, and `Escape` from
either clears the locked selection.

Chart focus switches the explorer to Planets, Houses, or Aspects and scrolls
the corresponding row into view. Focusing a table row updates the same chart
identity and chart emphasis. A user-initiated tab switch does not clear focus;
the chart remains emphasized, and returning to the corresponding tab restores
the focused row. A successful recalculation retains focus only if the exact
identity exists in the accepted result; otherwise it clears focus. Failed and
cancelled requests never clear it.

Table checkbox/range selection is a separate transient set used for copy and
CSV. It may contain multiple visible rows and does not alter the one focused
chart identity except that keyboard row focus updates the focused identity.

### 7.4 Layers and coupling

Default visual layers are:

- major aspects visible;
- minor aspects hidden;
- houses visible;
- labels visible;
- every result ring visible.

Major means the reference-data `level` is `major`; minor means `minor`.
`houses` controls cusp lines, house numbers, and angle axes/labels as one house
frame. `labels` controls auxiliary planet degree/sign/retrograde text and leader
lines, but leaves planet glyphs/dots available for recognition and selection.
Each ring switch controls its points, glyphs, labels, and leaders. Hiding a ring
also hides every aspect incident to that ring. Hiding an aspect class or ring
does not remove its rows from the explorer and does not clear focus.

Layer Reset restores these defaults for the current result without changing the
chart transform, filters, Advanced aspect calculation settings, or table
layout.

### 7.5 Pan, zoom, reset, and fit

The default transform fits the original full 740-unit wheel viewBox in the
available chart pane with centered aspect-ratio preservation. Wheel/pinch zoom
is bounded to `0.5x..8x`; pointer pan and root-canvas keyboard pan update one
transform. Arrow keys focused on semantic objects perform roving navigation and
never update that transform.

Reset View restores the default full-wheel transform only. It does not reset
layers or selection. Fit Visible computes the union of `getBBox()` bounds for
currently rendered visible-layer geometry, excludes hidden groups, adds 24 SVG
units of padding on every side, and centers the bounded result. When no visible
geometry has a nonzero bound, Fit Visible falls back to Reset View. Resize keeps
the current logical transform; it does not silently reset user pan/zoom.

## 8. Data Explorer

### 8.1 Tabs and tables

The explorer tabs are Planets, Houses, Aspects, Distributions, and Comparison.
Comparison is enabled only when the result has two rings. A two-subject result
with one composite ring has no per-subject position sets and cannot produce the
first/second-ring values defined below; it therefore presents the same clear
unavailable empty state without removing the tab.

TanStack Table and TanStack Virtual provide sorting, multiple simultaneous
column filters, pinned columns, column visibility, virtual rows, keyboard
navigation, and multi-row checkbox/range selection. Header and row heights use
density tokens. Virtualization must preserve the active row and permit
programmatic scroll to any focused chart identity.

Keyboard behavior follows grid conventions: arrow keys move the active cell,
`Home`/`End` move within a row, `Ctrl+Home`/`Ctrl+End` move to the first/last
cell, `Space` toggles row selection, `Enter` focuses the row's chart object, and
`Shift+Arrow` extends row selection. Focus remains visible after virtual scroll,
sort, filter, tab change, and layout restoration whenever its row still exists.
Sorting preserves bulk row selection. Filtering immediately prunes selected
rows that are no longer in the filtered visible row model, so "selection
exists" always means at least one visible selected row.

### 8.2 Comparison semantics

Comparison supports `merged`, `sideBySide`, and `difference` modes.

- `merged` emits one row per ring-qualified point and includes a stable `ring`
  column.
- `sideBySide` emits one row per point key, with first- and second-ring values in
  separate column groups.
- `difference` emits one row per point key with first value, second value, and
  second-minus-first delta.

Circular longitude delta is the shortest signed value in `[-180, 180)`, computed
as `((second - first + 540) % 360) - 180`. A result exactly opposite is therefore
`-180`, consistently. Non-circular numeric differences use ordinary
second-minus-first subtraction. If either side is absent, both the normalized
delta and display value are explicitly `null`/blank; zero is never used as a
missing sentinel. Missing rows sort after present numeric values in ascending
and descending order.

Firdaria metadata (`meta.firdaria`), profection metadata
(`meta.profection`), return instants, solar-arc/progression subtitles, and other
strategy-specific metadata are not discarded by the parser. Stable headline
fields appear in the result summary; structured period/profection values also
appear in the relevant Planets or Distributions explorer section. Unknown
parser-approved metadata is retained for summary inspection rather than
silently removed.

### 8.3 Persisted layout schema

Workspace settings persist this versioned structure:

```ts
type ExplorerTab =
  | 'planets'
  | 'houses'
  | 'aspects'
  | 'distributions'
  | 'comparison';

type WesternChartWorkspaceV1 = {
  schema: 'western-chart-workspace';
  version: 1;
  recents: {
    primaryProfileIds: string[];
    secondaryProfileIds: string[];
    chartTypes: ChartType[];
    houseSystems: string[];
    zodiacs: Array<'tropical' | 'sidereal'>;
    relocationPlaces: Array<{
      id: string;
      label: string;
      latitude: number;
      longitude: number;
    }>;
  };
  split: {
    personal: { horizontal: [number, number]; vertical: [number, number] };
    relationship: { horizontal: [number, number]; vertical: [number, number] };
  };
  tableLayouts: Record<ChartType, ChartTableLayoutV1>;
};

type ChartTableLayoutV1 = {
  version: 1;
  activeTab: ExplorerTab;
  comparisonMode: 'merged' | 'sideBySide' | 'difference';
  tabs: Record<ExplorerTab, {
    sorting: Array<{ id: string; desc: boolean }>;
    filters: Array<{ id: string; value: unknown }>;
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
    columnPinning: { left: string[]; right: string[] };
    columnSizing: Record<string, number>;
  }>;
};
```

`tableLayouts` is initialized with an entry for every exact one of the 20 chart
tokens; related types do not share layout by category or strategy class.
Transient hover, focused identity, bulk selection, in-flight requests, results,
and transforms are not persisted. Parsing drops unknown columns and invalid
values, fills missing chart/tab defaults, and resets only the invalid layout.
An unsupported top-level schema or future version resets this workbench payload
to V1 defaults and leaves unrelated workspace settings untouched.

## 9. Copy and Export

### 9.1 Clipboard

Copy emits tab-delimited text with stable, nonlocalized column IDs as headers.
It includes visible columns only and visible selected rows only. If no visible
rows are selected, it includes all currently filtered visible rows. Values use
stable machine-readable forms: normalized lowercase tokens, decimal degrees,
ISO timestamps, `true`/`false`, and blank for `null`. Line endings are Windows
compatible `CRLF`.

### 9.2 CSV

CSV uses the same row and column inclusion rules and stable values as clipboard:
visible selected rows when a selection exists, otherwise all filtered visible
rows. It serializes RFC 4180 quoting, comma delimiters, `CRLF`, and a UTF-8 BOM
so non-ASCII profile/place labels open correctly in Windows Excel. Hidden
columns and rows excluded by active filters are not exported.

### 9.3 SVG

SVG export serializes the current wheel with current visible layers, chart data,
and current pan/zoom viewBox/transform. Hover and focus emphasis, tooltips,
selection outlines, resize handles, and non-chart controls are excluded. The
file is standalone UTF-8 SVG with XML namespace, viewBox, required inline font
fallbacks/styles, and no external renderer dependencies. Export does not alter
the live transform or layer state.

## 10. AI Context

The AI chart context always points to the last successful accepted result. A
successful newest request atomically replaces chart data, accepted parameters,
and result identity in context. Failure, cancellation, parser rejection, draft
editing, and an ignored late response never replace it.

Context includes:

- last successful chart type, subjects, submitted filters, result, and focused
  chart/table identity;
- `draftIsStale`, computed against the current draft;
- when stale, a compact draft-filter summary explicitly labeled as uncalculated;
- when not stale, confirmation that draft and successful filters match.

The AI must not describe stale draft values as part of the successful chart.
Changing focus may update the selection portion of context because it refers to
the retained successful result. Bulk table selection is included only when the
AI context contract explicitly requests selected rows; it never replaces chart
identity.

## 11. Swiss Ephemeris Sidereal Correction

`SwissephAdapter` currently stores the zodiac setting but calculates tropical
positions unconditionally. The fix remains inside the Swiss Ephemeris adapter
and core wrapper:

- tropical continues using the existing Swiss Ephemeris flags and house path;
- sidereal explicitly configures Lahiri (`SE_SIDM_LAHIRI`) mode and applies the
  sidereal calculation flag to bodies, cusps, and angles through one auditable
  adapter path;
- derived points, sign indexes, degrees-in-sign, house assignment, return
  searches, progression frames, and rendered labels derive from the corrected
  normalized longitudes;
- changing zodiac never mutates process-global mode in a way that contaminates
  a later tropical request; tests alternate tropical and sidereal calls;
- Swiss Ephemeris remains the production backend. The legacy horoscope adapter
  is not used to mask a Swiss sidereal failure.

The adapter documents Lahiri mode rather than relying on native-library implicit
defaults. Known-value fixtures record the UTC instant, coordinates, ephemeris
data version, expected Sun/Moon/Ascendant longitude, and a maximum `0.01deg`
absolute angular error against independently generated Swiss Ephemeris values.
Tests also assert the independently recorded tropical-to-sidereal angular
offset within `0.01deg` and a sign-boundary fixture, so a result that merely
relabels tropical longitude cannot pass.

## 12. Error and Accessibility Behavior

- Initial empty, profile-required, validation, loading, stale, cancellation,
  parser, IPC, and domain failure states have distinct result-area treatments.
- An error includes Retry when the current draft is valid. It never clears
  controls or the retained successful result.
- Calculate, layer, fit/reset, export, tab, and split controls have accessible
  names. Icon-only commands use Lucide icons and tooltips.
- The split handle, layer menu, chart canvas, roving chart identities, and
  tables are keyboard operable. The chart contributes two efficient
  chart-domain stops rather than one stop per SVG object. Focus rings are
  visible in both themes and densities.
- Status changes use `role="status"` with `aria-live="polite"`; repeated hover
  facts are excluded from that live region.
- Color is not the only encoding for rings, aspect class, stale state,
  selection, error, or disabled layers.

## 13. Testing and Verification

### 13.1 Domain tests

- Compute every catalog token using deterministic profiles and explicit dynamic
  options; assert the declared ring count/roles, finite geometry data, metadata
  type, and relationship profile distinction.
- Assert the catalog contains exactly the 20 mapped tokens and that each option
  set matches Section 4.2.
- Add Swiss Ephemeris known-value tropical/sidereal fixtures for planets and
  angles, alternating-call isolation, sign-boundary behavior, and return/
  progression use of sidereal values.
- Retain all existing calculation, IPC, and SVG tests.

### 13.2 React tests

- Exhaustively render and validate all 20 dynamic-control mappings.
- Cover required fields, distinct relationship profiles, coordinate/year/date
  bounds, Advanced reset, recents bound/pruning/clear, and profile-intent
  apply-before-consume behavior.
- Cover explicit Calculate, structural stale detection, edit/revert, draft edits
  in flight, overlapping A/B responses, cancellation, ignored late responses,
  parser failure, retry, and preservation after failure/cancellation.
- Cover ring-qualified identities, duplicate rejection, chart-to-table and
  table-to-chart focus, click toggle, Escape, tab switching, row reveal, and
  successful-result identity retention/clearing.
- Cover layer defaults/coupling, transform bounds, Reset View, Fit Visible
  bounds/fallback, and resize without transform loss.
- Cover table sort, multifilter, pin/hide/order/size, virtualization, full grid
  keyboard navigation, range selection, per-token V1 persistence, invalid
  schema recovery, and all comparison modes including `-180` and `null` deltas.
- Assert clipboard and CSV exact bytes/headers/row inclusion, CRLF, quoting, and
  UTF-8 BOM; assert SVG export excludes interaction chrome and hidden layers.
- Assert AI context changes only on success and accurately labels stale draft
  filters.

### 13.3 Genuine Electron smoke tests

Run against the real preload bridge and trusted IPC handlers, not a browser-only
mock. Exercise at least one single-ring chart and one dual-ring chart through
profile selection, calculation, interactive SVG, explorer linkage, and all
three exports. Assert nonempty SVG and no `NaN`, `Infinity`, or `undefined`
numeric attributes.

The smoke harness uses delayed trusted `chart:compute` handlers to force request
A to resolve after request B and to resolve A after B is cancelled. It verifies
that neither late A response commits. The suite also verifies failure retention,
a profile `synastry` intent applied before consumption, typed envelope
rejection, absence of renderer Node access, and the dirty-window close decision
handshake after workbench interaction.

### 13.4 Visual and geometry tests

Capture `1440x920`, `1280x800`, and `1100x720` in light and dark themes and in
compact and comfortable densities. The matrix covers personal single-ring and
relationship dual-ring results, for 24 required screenshots.

Geometry assertions accompany screenshots:

- filter band and Calculate remain within the workspace and do not intersect
  the result header;
- the measured result container selects horizontal mode at `>=760px` and
  vertical mode below it;
- horizontal chart/data panes are each at least `360px` wide;
- the SVG has a nonzero rendered bounding box; at least 1% of pixels in its
  central 50% differ from the chart surface, and sampled SVG pixels contain at
  least 16 distinct RGB values;
- controls, table headers, focused rows, and AI overlay do not overlap the SVG
  interaction region;
- the shell shows navigation/workspace/AI at `1440x920` and retains its existing
  navigation-collapse/AI-overlay behavior at `1100x720`.

Pixel checks verify that screenshots are nonblank and that toggling each
populated ring/aspect layer changes at least 100 pixels inside the SVG bounds.
They do not assert universal label-collision absence.

### 13.5 Release verification

Before release, run source/package checks that include domain tests, React tests,
typecheck, renderer build, trusted Electron smoke, packaged-source verification,
packaged renderer smoke, and the close handshake. Verify the packaged app
contains the React assets, preload, Swiss Ephemeris native module/data, and no
legacy fallback used to satisfy a sidereal test.

## 14. Acceptance Criteria

1. The personal and relationship React routes calculate all exact 20 service
   chart types with the dynamic controls and request fields in Section 4.2.
2. Tropical and sidereal Swiss Ephemeris known-value tests pass, including
   alternating-call isolation and a sign-boundary case; sidereal values are not
   tropical values with changed labels.
3. Parameter edits never auto-calculate. They retain the last success and set or
   clear stale status solely by structural comparison with accepted parameters.
4. In overlapping requests, only a non-cancelled sequence equal to the latest
   issued sequence can commit; cancelling it never revives an older response.
   Failure/cancellation preserves result, focus, transform, tables, and AI
   context.
5. Profile intent is consumed only after its valid route/type/profile values are
   confirmed in the draft, and intent application does not calculate.
6. At a measured result width `>=760px`, chart/data panes are horizontal and at
   least `360px` each; below `760px` they stack vertically. Existing shell and AI
   responsive behavior is unchanged.
7. Planet/point, house, and aspect identities follow Section 7.2. Hover is
   temporary; one focused identity synchronizes chart and explorer in both
   directions without being cleared by a tab switch or failed request.
8. Layer defaults and coupling match Section 7.4. Reset View restores only the
   default transform; Fit Visible uses current visible geometry plus 24 units of
   padding; Layer Reset does not change transform or calculation settings.
9. Every explorer tab supports its specified table behavior, and all 20 exact
   chart types restore independent valid V1 layouts. Invalid layout data recovers
   without damaging unrelated workspace settings.
10. Difference mode uses shortest signed circular longitude in `[-180,180)` and
    renders a missing side as `null`/blank. Firdaria, profection, and other
    strategy metadata remains visible and queryable.
11. Clipboard is tab-delimited and CSV is RFC 4180 UTF-8 with BOM; both use
    stable headers, visible columns, filtered rows, and selected rows when a
    visible selection exists. SVG export contains the current visible layers and
    transform without interaction chrome.
12. AI context always names the last successful chart and explicitly reports
    whether draft filters are stale. Only an accepted successful newest request
    replaces chart context.
13. Renderer code has no Node access; malformed preload responses are rejected
    before SVG/table use. Genuine Electron single/dual chart smoke and package
    verification pass with nonblank, finite SVG output.
14. The 24-screenshot visual matrix and geometry/pixel assertions pass, and the
    app completes the trusted dirty-close handshake after workbench use.
