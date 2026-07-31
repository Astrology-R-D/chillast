# CHILLAST React Workbench Redesign

**Date:** 2026-08-01
**Status:** Approved

## 1. Purpose

Redesign CHILLAST as a Windows-first professional astrology workstation with a
restrained Raycast-like desktop feel. Replace the current renderer with React
and TypeScript while preserving the Electron process boundaries, preload API,
astrology engines, profile storage, AI services, and existing user-facing
capabilities.

The redesign must improve four connected areas:

1. A coherent light/dark visual system.
2. A professional chart workbench with interactive data exploration.
3. Faster and safer profile management.
4. A context-aware AI workspace for chat, reports, and research.

## 2. Design Principles

- Optimize for professional astrologers and repeated daily use.
- Keep information dense without making controls visually noisy.
- Use neutral surfaces; reserve color for meaning rather than decoration.
- Keep the chart, data, and AI visible together at normal desktop widths.
- Make keyboard and pointer workflows equally complete.
- Preserve domain behavior during the renderer migration.
- Prefer proven interaction libraries over custom implementations of tables,
  editors, split panes, and accessibility primitives.

## 3. Scope

### In scope

- One-time migration of the renderer to React and TypeScript.
- Light, dark, and system-following themes with a manual override.
- Compact and comfortable density modes.
- A resizable three-column application shell.
- Redesigned chart, profile, Chinese astrology, solar-term, settings, and AI
  experiences.
- Interactive and comparative chart data tables.
- AI chat, report, and research modes.
- Renderer unit, integration, Electron smoke, and visual regression tests.

### Out of scope

- Changes to astrology calculation rules or algorithms.
- Replacement of the current LangChain-based AI backend.
- Cloud profile synchronization or multi-user accounts.
- A user-configurable arbitrary docking system in the first release.
- Profile folder hierarchies or bulk profile editing in the first release.
- A macOS-first title bar or macOS-only window materials.

## 4. Technical Architecture

### 4.1 Process boundaries

The Electron main process, preload bridge, `src/core` domain layer, IPC
contracts, profile repository, and AI service remain authoritative. The new
renderer consumes the existing `window.mystApi` boundary and must not gain Node
access.

Vite builds the React/TypeScript renderer into static assets loaded by
Electron. Development uses Vite's local server; packaged builds load the output
from disk under the existing content security constraints.

### 4.2 Renderer structure

The renderer is organized by ownership rather than by generic file type:

```text
renderer/
  app/          application root, providers, routing, startup
  shell/        navigation, headers, split panels, command palette
  features/     profiles, charts, chinese, solar-terms, ai, settings
  components/   shared UI primitives and domain-neutral composites
  stores/       synchronous UI and workspace state
  api/          typed adapters around window.mystApi
  styles/       tokens, themes, density, global styles
```

Feature modules expose narrow page-level interfaces. They do not import each
other's internal components. Shared profile selection and chart context live in
explicit shared modules rather than being copied between pages.

### 4.3 Libraries

- React and TypeScript for the renderer.
- Vite for renderer development and production builds.
- Radix Primitives for accessible dialogs, popovers, menus, tooltips, tabs,
  toggles, and selection controls.
- Zustand for synchronous workspace and transient interaction state.
- TanStack Query for typed IPC requests, async lifecycle, caching, and cache
  invalidation.
- TanStack Table and TanStack Virtual for professional data grids.
- `react-resizable-panels` for the application and workbench split panes.
- Lucide React for interface icons; astrology glyphs continue to use the
  bundled glyph-capable font.
- `react-markdown` and `remark-gfm` for AI message rendering.
- TipTap for editable generated reports.

No pre-themed component suite such as Ant Design or Mantine is used. CHILLAST
owns its visual language through tokens and locally styled primitives.

## 5. Visual System

### 5.1 Themes

The theme preference has three values: `system`, `light`, and `dark`. `system`
is the default and reacts immediately to Windows color-scheme changes. A manual
selection persists locally and overrides the operating system until changed.

The light theme uses cool white and neutral gray surfaces. The dark theme uses
near-black neutral grays rather than blue-black surfaces. Neither theme has a
permanent brand accent. Color is reserved for focus/selection, errors, success,
astrological elements, aspects, and other domain semantics. Every semantic
color has a contrast-adjusted light and dark value.

The central work surface is opaque for legibility. Navigation, AI sidebars,
menus, dialogs, and transient overlays may use restrained translucency and
blur. The UI must remain usable when blur is unavailable or reduced-motion and
contrast preferences are active.

### 5.2 Typography and geometry

Maple Mono NF CN is the global UI family using the bundled regular, medium,
semibold, and bold weights. Glyph-heavy chart labels use an explicit fallback
stack. Tabular numerals are enabled in numeric columns.

Corners use a 4-8 px radius. Sections are primarily separated by surface
lightness and one-pixel borders, not nested cards. Shadows are limited to
floating surfaces. Motion lasts 120-180 ms and is limited to focus, selection,
panel, and context transitions.

### 5.3 Density

Users can choose `compact` or `comfortable`; `compact` is the default. Density
tokens control control height, table row height, spacing, and panel padding as
one coherent scale. Compact controls target approximately 32 px and
comfortable controls approximately 36 px. Fixed-size controls do not shift when
labels or status content change.

## 6. Application Shell

The default desktop layout contains three simultaneously visible columns:

1. A compact, collapsible navigation sidebar.
2. The central page workspace.
3. A resizable, collapsible AI sidebar.

All dividers are keyboard accessible and draggable. Panel widths persist. The
shell enforces minimum usable widths so the chart and AI input cannot collapse
into unusable states. At narrow widths, the navigation collapses first; the AI
sidebar remains available as a controlled overlay only when three usable
columns cannot fit.

Navigation retains the existing brand, feature groups, and routes. It adds
stable locations for the active profile, background computation status, and AI
status. A command palette provides keyboard access to navigation, profiles,
chart types, theme, density, and common actions.

Settings owns theme, density, default chart settings, AI configuration, and
knowledge-base status.

## 7. Chart Workbench

### 7.1 Filters

The workbench begins with a professional filter bar. Primary profile, chart
type, target time, house system, and zodiac system remain directly visible.
Low-frequency parameters live in an expandable advanced panel. Searchable
selectors support keyboard operation, recent values, reset, and clear states.

Changing a parameter marks the result as stale and enables an explicit
recalculate action. Expensive calculations do not run on every field change.
The previous result remains visible with a clear stale indicator until the new
result succeeds.

### 7.2 Chart canvas

The SVG chart remains the authoritative rendering format. React owns selection,
hover, layer visibility, zoom, and pan state, while existing chart geometry is
preserved or incrementally improved behind a stable chart component interface.

The canvas provides zoom, pan, reset, fit-to-view, and export controls. Planets,
houses, and aspects are hoverable and selectable. Hover shows concise facts;
selection locks detail and synchronizes the data explorer. Unrelated marks are
de-emphasized without becoming unreadable.

A layer menu controls aspects, minor aspects, houses, planet labels, and dual
chart rings. Dual-chart encoding uses ring position, line style, and labels in
addition to color. Labels must avoid collisions at supported sizes, and dense
charts must retain access to the underlying exact values through selection.

### 7.3 Data explorer

The data explorer uses tabs for planets, houses, aspects, distributions, and
comparison. Tables support sorting, multi-filtering, pinned columns, column
visibility, virtual scrolling, row selection, keyboard navigation, and saved
layouts per chart type.

Selecting a row highlights and focuses the corresponding chart object.
Selecting an object in the chart switches to and reveals the corresponding
table row. Filters cover planet, sign, house, retrograde state, aspect type, and
orb. Dual charts support merged, side-by-side, and difference views.

Users can copy selected rows and export visible data to CSV. Loading, stale,
empty, and calculation-error states occupy the result area and preserve the
filter controls.

The chart and data explorer are separated by a draggable divider. They default
to side-by-side and switch to a vertical arrangement when the central workspace
cannot maintain a legible chart width.

## 8. Profile Management

The profile page uses a searchable directory and a detail editor. The directory
supports name, location, tag, and recent-use search, plus sorting and compact
filtering. Each row shows name, birth time, location, and explicit primary
status.

The detail pane separates reading and editing modes. New and edit actions share
one validated form. Date and time fields support segmented keyboard entry and
step controls. Location search continues to resolve coordinates and historical
time zone data, and displays the resolved result before save.

Dirty forms prompt for save, discard, or cancel before profile changes,
navigation, or window closure. Errors appear beside affected fields. Storage
errors remain in the editor with retry support. Duplicate, set-primary, and
delete actions are explicit; delete requires confirmation.

Profile rows expose direct actions for natal, transit, and relationship charts.
Tags and searchable notes are included, but folders are not. The profile
selector and primary-profile state are shared with every chart filter.

## 9. AI Workspace

The AI sidebar contains three top-level modes that share session and context
infrastructure without mixing their primary workflows.

### 9.1 Chat

Chat follows the current profile and chart. A removable context strip shows the
profile, chart type, target time, active filters, and selected chart/table
objects sent to the model. Users can stop, retry, regenerate, edit-and-resend,
quote, and branch messages. Streaming does not force scroll when the user is
reading earlier content; a return-to-latest control appears instead.

The composer grows to a bounded height, supports `Enter` to send and
`Shift+Enter` for a newline, and exposes model/tool status without crowding the
input. Text-file attachment is supported within existing backend constraints.

### 9.2 Reports

Reports are generated from configurable structured templates and edited in
TipTap. A user can regenerate an individual section, lock manually edited
sections, compare versions, and export Markdown or PDF. Regeneration cannot
silently overwrite locked content.

### 9.3 Research

Research presents knowledge-base and web sources with title, excerpt,
relevance, and citation location. Citations in answers navigate to their source.
Tool calls appear as compact status rows and may be expanded for parameters,
progress, and results; raw tool traffic does not interrupt answer prose.

Sessions can be searched, renamed, pinned, and resumed. Profile- or
chart-changing tool actions require explicit confirmation. Network, model
configuration, tool, cancellation, and content errors have distinct messages
and retry paths.

## 10. Other Feature Views

Chinese astrology and solar-term views use the same visual tokens, filter
primitives, tables, status patterns, and keyboard rules. They retain layouts
appropriate to their domains rather than imitating the western chart canvas.
BaZi pillars remain a primary visualization and gain selection linkage to their
related tables. Settings is reorganized into clear categories but preserves all
existing configurable values.

## 11. State and Data Flow

State has explicit ownership:

- Zustand stores route state, theme, density, active profile, panel sizes,
  chart selection, and other synchronous workspace state.
- TanStack Query adapters call `window.mystApi` for profiles, settings, chart
  results, AI sessions, and initialization status. Mutations invalidate only
  affected queries.
- A chart context store derives the exact context exposed to AI from active
  profile, successful chart result, filters, and selected chart/table objects.

Uncommitted form state remains local to its feature. A failed recalculation does
not replace the last successful chart context. The AI never reads draft profile
changes unless the user explicitly includes them.

## 12. Error and Progress Handling

Feedback appears at the closest actionable location:

- Field validation beside the field.
- Calculation and empty states inside the result workspace.
- AI errors on the relevant message or operation.
- Persistent initialization and long-running progress in a stable status area.
- Toasts only for brief confirmations such as a successful save or export.

Long-running operations expose progress when available and a cancellation path
when supported. Error messages retain the user's inputs and offer retry without
re-entering parameters.

## 13. Migration Strategy

The renderer migration is delivered as one product cutover, not a permanently
mixed UI. Internally, work proceeds in this order:

1. Add the Vite/React/TypeScript build and typed preload declarations.
2. Build tokens, themes, density, primitives, and the application shell.
3. Migrate profiles and shared profile selection.
4. Migrate chart workbenches and chart/data synchronization.
5. Migrate Chinese astrology and solar terms.
6. Migrate AI chat, then reports and research.
7. Migrate settings and startup/status surfaces.
8. Complete parity, accessibility, smoke, and visual checks.
9. Switch Electron to the new renderer and remove obsolete renderer code.

A feature parity checklist maps every existing route, setting, command, and IPC
operation to its React replacement. Old renderer removal occurs only after the
new renderer passes parity verification.

## 14. Testing

- Vitest tests pure formatting, filter, theme, density, and state logic.
- React Testing Library tests controls, forms, tables, dialogs, AI streaming
  states, and keyboard behavior.
- Existing Node suites continue to verify domain and astrology behavior.
- Electron smoke tests verify preload/IPC integration, profile persistence,
  chart generation, valid SVG output, and AI streaming.
- Playwright visual tests cover light/dark themes, both density modes, and
  representative desktop widths.
- Focused interaction tests cover chart/table linkage, comparison modes, split
  panel resizing, system-theme changes, dirty profile navigation, AI stop/retry,
  and report section locking.

## 15. Acceptance Criteria

- All existing user-facing features are available through the React renderer.
- Theme defaults to system and manual light/dark overrides persist.
- Compact and comfortable density settings consistently affect shared UI.
- Navigation, chart/data workspace, and AI are simultaneously usable at the
  supported default desktop window size.
- Chart and table selections synchronize in both directions.
- Data tables provide sorting, filtering, pinned columns, comparison, copy, and
  CSV export.
- Profile edits protect unsaved work and expose direct chart actions.
- AI chat, reports, and research are distinct, functional modes with visible
  context and source handling.
- No renderer has direct Node access, and all backend access uses the preload
  contract.
- Domain tests, React tests, Electron smoke tests, and required visual snapshots
  pass before the cutover is considered complete.
