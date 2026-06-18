# Config-Driven GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all tuneable GUI parameters from hardcoded CSS/JS into a single `config.json`, load it at startup via IPC, and apply it as CSS variables + JS config objects so the entire visual appearance is data-driven.

**Architecture:** A `config.json` at project root holds defaults. `ConfigManager` (pure Node, no Electron) loads, validates, and deep-merges user overrides. Main process reads config once, serves it to renderer via a `config:get` IPC channel. Renderer applies theme/layout values by setting CSS custom properties on `:root`, and passes chart-specific constants to `ChartWheel` / `ChartResult` through the shared `reference` context. CSS files keep their current values as fallback defaults.

**Tech Stack:** CommonJS (main/core), ES modules (renderer), Electron IPC, CSS custom properties

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `config.json` | Single source of truth for all GUI parameters |
| `src/core/config/ConfigManager.js` | Load, validate, deep-merge config (pure Node) |
| `src/renderer/app/ConfigApplier.js` | Apply theme/layout config as CSS `:root` variables |

### Files to modify

| File | Changes |
|------|---------|
| `src/main/Main.js` | Load config, use window section, pass to IpcRouter |
| `src/main/IpcRouter.js` | Register `config:get` channel |
| `src/preload/Preload.js` | Expose `getConfig()` |
| `src/renderer/app/ApiClient.js` | Add `getConfig()` |
| `src/renderer/app/App.js` | Fetch config, apply CSS, pass chart config in context |
| `src/renderer/app/components/ChartWheel.js` | Read radii/colors from config instead of module constants |
| `src/renderer/app/components/ChartResult.js` | Read `svgSize` from config |
| `tests/RunAll.js` | Add ConfigManager tests |

### Skill file

| File | Responsibility |
|------|----------------|
| `.opencode/skills/config-driven-gui/SKILL.md` | Agentic skill ensuring future GUI changes stay config-driven |

---

## Phase 1 — Config Infrastructure

### Task 1: Create `config.json` with all extracted defaults

**Files:**
- Create: `config.json`

- [ ] **Step 1: Create `config.json` at project root**

```json
{
  "window": {
    "width": 1440,
    "height": 920,
    "minWidth": 1100,
    "minHeight": 720,
    "backgroundColor": "#1e1e1e"
  },

  "theme": {
    "bgBase":           "#1e1e1e",
    "bgDeep":           "#141414",
    "bgPanel":          "rgba(37, 37, 38, 0.97)",
    "bgPanelSolid":     "#252526",
    "bgElevated":       "rgba(45, 45, 45, 0.92)",
    "bgInput":          "rgba(28, 28, 28, 0.88)",

    "borderSoft":       "rgba(70, 70, 70, 0.55)",
    "borderStrong":     "rgba(110, 110, 110, 0.65)",

    "textPrimary":      "#d4d4d4",
    "textSecondary":    "#9d9d9d",
    "textMuted":        "#6d6d6d",

    "accent":           "#4fc1ff",
    "accentStrong":     "#7fdcff",
    "accentViolet":     "#569cd6",
    "accentVioletSoft": "rgba(86, 156, 214, 0.15)",
    "danger":           "#f44747",
    "success":          "#4ec9b0",

    "elementFire":      "#ce9178",
    "elementEarth":     "#6a9955",
    "elementAir":       "#9cdcfe",
    "elementWater":     "#4ec9b0",

    "aspectMajorHarmonic": "#4ec9b0",
    "aspectMajorTension":  "#f44747",
    "aspectConjunction":   "#dcdcaa",
    "aspectMinor":         "#6e6e6e",

    "radiusSm":         "5px",
    "radiusMd":         "8px",
    "radiusLg":         "12px",
    "shadowSoft":       "0 4px 18px rgba(0, 0, 0, 0.6)",
    "shadowGlow":       "0 0 16px rgba(79, 193, 255, 0.22)",
    "transition":       "140ms cubic-bezier(0.4, 0, 0.2, 1)"
  },

  "layout": {
    "sidebarWidth":          228,
    "chartCanvasMaxWidth":   480,
    "workbenchGridColumns":  "1fr 1fr",
    "responsiveBreakpoint":  1200
  },

  "chart": {
    "svgSize": 740,
    "radii": {
      "outerRim":     364,
      "zodiacOuter":  356,
      "zodiacInner":  305,
      "houseOuter":   305,
      "houseNumber":  130
    },
    "planetRadius": {
      "single": 256,
      "inner":  216,
      "outer":  272
    },
    "leaderLength": 32,
    "planetColors": {
      "sun":       "#dcdcaa",
      "moon":      "#9cdcfe",
      "mercury":   "#4ec9b0",
      "venus":     "#ce9178",
      "mars":      "#f44747",
      "jupiter":   "#c586c0",
      "saturn":    "#6a9955",
      "uranus":    "#569cd6",
      "neptune":   "#4fc1ff",
      "pluto":     "#d16969",
      "chiron":    "#b5cea8",
      "northnode": "#9cdcfe",
      "southnode": "#808080",
      "lilith":    "#c586c0"
    },
    "aspectColors": {
      "conjunction":    "#dcdcaa",
      "opposition":     "#f44747",
      "trine":          "#4ec9b0",
      "square":         "#d97340",
      "sextile":        "#56b6c2",
      "quincunx":       "#c586c0",
      "sesquiquadrate": "#d19a66",
      "semisquare":     "#e06c75",
      "semisextile":    "#98c379",
      "quintile":       "#7c7ce0"
    },
    "elementColors": {
      "fire":  "#ce9178",
      "earth": "#6a9955",
      "air":   "#9cdcfe",
      "water": "#4ec9b0"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add config.json
git commit -m "feat: add config.json with all GUI parameter defaults"
```

---

### Task 2: Create ConfigManager

**Files:**
- Create: `src/core/config/ConfigManager.js`
- Test: `tests/RunAll.js`

- [ ] **Step 1: Add failing tests in `tests/RunAll.js`**

Add after the `FirdariaCalc` require at the top:

```js
const ConfigManager = require('../src/core/config/ConfigManager');
```

Add a test section before the `Chart strategies` section:

```js
console.log('\nConfigManager');
test('loads default config from project root', () => {
  const cfg = ConfigManager.load();
  assert.ok(cfg.window, 'has window section');
  assert.ok(cfg.theme, 'has theme section');
  assert.ok(cfg.layout, 'has layout section');
  assert.ok(cfg.chart, 'has chart section');
  assert.strictEqual(cfg.window.width, 1440);
  assert.strictEqual(cfg.chart.svgSize, 740);
});
test('deep-merges partial overrides', () => {
  const cfg = ConfigManager.load({ theme: { accent: '#ff0000' }, chart: { svgSize: 800 } });
  assert.strictEqual(cfg.theme.accent, '#ff0000');
  assert.strictEqual(cfg.chart.svgSize, 800);
  assert.strictEqual(cfg.theme.bgBase, '#1e1e1e');
  assert.strictEqual(cfg.chart.radii.outerRim, 364);
});
test('camelToKebab converts correctly', () => {
  assert.strictEqual(ConfigManager.camelToKebab('bgPanelSolid'), 'bg-panel-solid');
  assert.strictEqual(ConfigManager.camelToKebab('accent'), 'accent');
  assert.strictEqual(ConfigManager.camelToKebab('accentVioletSoft'), 'accent-violet-soft');
});
test('themeAsCssVars returns --prefixed map', () => {
  const cfg = ConfigManager.load();
  const vars = ConfigManager.themeAsCssVars(cfg.theme);
  assert.strictEqual(vars['--bg-base'], '#1e1e1e');
  assert.strictEqual(vars['--accent'], '#4fc1ff');
  assert.strictEqual(vars['--radius-lg'], '12px');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/config/ConfigManager'`

- [ ] **Step 3: Create `src/core/config/ConfigManager.js`**

```js
'use strict';

const path = require('path');
const fs = require('fs');

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function themeAsCssVars(theme) {
  const vars = {};
  for (const [key, value] of Object.entries(theme)) {
    vars[`--${camelToKebab(key)}`] = String(value);
  }
  return vars;
}

function loadDefaults() {
  const configPath = path.resolve(__dirname, '..', '..', '..', 'config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

const ConfigManager = {
  load(overrides) {
    const defaults = loadDefaults();
    if (!overrides) return defaults;
    return deepMerge(defaults, overrides);
  },

  camelToKebab,
  themeAsCssVars,
  deepMerge,
};

module.exports = ConfigManager;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All new ConfigManager tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/config/ConfigManager.js tests/RunAll.js
git commit -m "feat: add ConfigManager with deep-merge and CSS var conversion"
```

---

## Phase 2 — Config Delivery via IPC

### Task 3: Expose config through IPC pipeline

**Files:**
- Modify: `src/main/Main.js`
- Modify: `src/main/IpcRouter.js`
- Modify: `src/preload/Preload.js`
- Modify: `src/renderer/app/ApiClient.js`

- [ ] **Step 1: Load config in Main.js**

In `src/main/Main.js`, add require at the top:

```js
const ConfigManager = require('../core/config/ConfigManager');
```

In the `bootstrapServices()` method, add before the IpcRouter creation:

```js
    this.config = ConfigManager.load();
```

Pass config to IpcRouter (modify the `new IpcRouter({...})` call):

```js
    new IpcRouter({
      ipcMain,
      profileRepository: this.profileRepository,
      astrologyService: this.astrologyService,
      config: this.config,
    }).register();
```

In `createWindow()`, use config for window dimensions. Replace the hardcoded values:

```js
    const win = this.config.window || {};
    this.mainWindow = new BrowserWindow({
      width: win.width || 1440,
      height: win.height || 920,
      minWidth: win.minWidth || 1100,
      minHeight: win.minHeight || 720,
      backgroundColor: win.backgroundColor || '#1e1e1e',
      title: 'CHILLAST',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'Preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
```

- [ ] **Step 2: Add config channel in IpcRouter.js**

In `src/main/IpcRouter.js`, update the constructor to accept `config`:

```js
  constructor({ ipcMain, profileRepository, astrologyService, config }) {
    this.ipcMain = ipcMain;
    this.profiles = profileRepository;
    this.astrology = astrologyService;
    this.config = config || {};
  }
```

In `register()`, add a new channel at the top:

```js
    this._handle('config:get', () => this.config);
```

- [ ] **Step 3: Expose in Preload.js**

In `src/preload/Preload.js`, add inside the `contextBridge.exposeInMainWorld('mystApi', {` block, after `getReferenceData`:

```js
  getConfig: () => invoke('config:get'),
```

- [ ] **Step 4: Add to ApiClient.js**

Read `src/renderer/app/ApiClient.js` and add `getConfig`:

```js
  getConfig: () => unwrap(window.mystApi.getConfig()),
```

Add this line right after the `getReferenceData` line in the `ApiClient` object.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All 42+ tests pass (existing + 4 new ConfigManager tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/Main.js src/main/IpcRouter.js src/preload/Preload.js src/renderer/app/ApiClient.js
git commit -m "feat: expose config via IPC pipeline"
```

---

## Phase 3 — Apply Config in Renderer

### Task 4: Create ConfigApplier and wire App.js

**Files:**
- Create: `src/renderer/app/ConfigApplier.js`
- Modify: `src/renderer/app/App.js`

- [ ] **Step 1: Create `src/renderer/app/ConfigApplier.js`**

```js
export function applyConfig(config) {
  if (!config) return;

  if (config.theme) {
    applyTheme(config.theme);
  }

  if (config.layout) {
    applyLayout(config.layout);
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const CAMEL_TO_CSS = (key) => `--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(CAMEL_TO_CSS(key), String(value));
  }
}

function applyLayout(layout) {
  const root = document.documentElement;
  if (layout.sidebarWidth != null) {
    root.style.setProperty('--sidebar-width', `${layout.sidebarWidth}px`);
  }
  if (layout.chartCanvasMaxWidth != null) {
    root.style.setProperty('--chart-max-width', `${layout.chartCanvasMaxWidth}px`);
  }
  if (layout.workbenchGridColumns != null) {
    root.style.setProperty('--workbench-grid', layout.workbenchGridColumns);
  }
}
```

- [ ] **Step 2: Update CSS to use new layout variables**

In `src/renderer/styles/Layout.css`, change the hardcoded sidebar width:

Replace line 6:
```css
  grid-template-columns: 228px 1fr;
```
with:
```css
  grid-template-columns: var(--sidebar-width, 228px) 1fr;
```

Replace `.workbench-main` `grid-template-columns: 1fr 1fr;` with:
```css
  grid-template-columns: var(--workbench-grid, 1fr 1fr);
```

In `src/renderer/styles/Components.css`, replace `.chart-canvas-wrap` `max-width: 480px;` with:
```css
  max-width: var(--chart-max-width, 480px);
```

- [ ] **Step 3: Wire config into App.js startup**

In `src/renderer/app/App.js`, add import:

```js
import { applyConfig } from './ConfigApplier.js';
```

In the `start()` method, fetch and apply config BEFORE fetching reference data:

```js
  async start() {
    const config = await ApiClient.getConfig();
    applyConfig(config);
    this.config = config;

    const reference = await ApiClient.getReferenceData();
```

Pass `config` into the context object:

```js
    const ctx = {
      store: this.store,
      reference: this.reference,
      config: this.config,
      refreshProfiles: () => this.refreshProfiles(),
      navigate: (route) => this.navigate(route),
    };
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/ConfigApplier.js src/renderer/app/App.js src/renderer/styles/Layout.css src/renderer/styles/Components.css
git commit -m "feat: apply config as CSS variables on startup"
```

---

### Task 5: Wire ChartWheel to use chart config

**Files:**
- Modify: `src/renderer/app/components/ChartWheel.js`

The module-level constants (`SIZE`, `R`, `PLANET_RADIUS`, `LEADER_LEN`, `PLANET_COLOR`, `ASPECT_TYPE_COLOR`, `ELEMENT_COLOR`) become defaults that are overridden by config.

- [ ] **Step 1: Refactor ChartWheel constructor to accept config**

In `src/renderer/app/components/ChartWheel.js`, rename the existing module constants to `DEFAULT_*` prefix so they serve as fallbacks:

At the top of the file, replace:
```js
const SIZE = 740;
```
with:
```js
const DEFAULT_SIZE = 740;
```

Replace:
```js
const R = {
```
with:
```js
const DEFAULT_R = {
```

Replace:
```js
const PLANET_RADIUS = {
```
with:
```js
const DEFAULT_PLANET_RADIUS = {
```

Replace:
```js
const LEADER_LEN = 32;
```
with:
```js
const DEFAULT_LEADER_LEN = 32;
```

Replace:
```js
const PLANET_COLOR = {
```
with:
```js
const DEFAULT_PLANET_COLOR = {
```

Replace:
```js
const ASPECT_TYPE_COLOR = {
```
with:
```js
const DEFAULT_ASPECT_TYPE_COLOR = {
```

Replace:
```js
const ELEMENT_COLOR = {
```
with:
```js
const DEFAULT_ELEMENT_COLOR = {
```

Remove the lines:
```js
const CX = SIZE / 2;
const CY = SIZE / 2;
```

Update the export statement:
```js
export { PLANET_COLOR, ASPECT_TYPE_COLOR };
```
to:
```js
export { DEFAULT_PLANET_COLOR as PLANET_COLOR, DEFAULT_ASPECT_TYPE_COLOR as ASPECT_TYPE_COLOR };
```

- [ ] **Step 2: Update the constructor to merge config**

Replace the constructor:
```js
  constructor(reference) {
    this.signs = reference.signs;
  }
```
with:
```js
  constructor(reference, chartConfig) {
    this.signs = reference.signs;
    const cc = chartConfig || {};
    this.SIZE = cc.svgSize || DEFAULT_SIZE;
    this.CX = this.SIZE / 2;
    this.CY = this.SIZE / 2;
    this.R = { ...DEFAULT_R, ...(cc.radii || {}) };
    this.PLANET_RADIUS = { ...DEFAULT_PLANET_RADIUS, ...(cc.planetRadius || {}) };
    this.LEADER_LEN = cc.leaderLength || DEFAULT_LEADER_LEN;
    this.PLANET_COLOR = { ...DEFAULT_PLANET_COLOR, ...(cc.planetColors || {}) };
    this.ASPECT_TYPE_COLOR = { ...DEFAULT_ASPECT_TYPE_COLOR, ...(cc.aspectColors || {}) };
    this.ELEMENT_COLOR = { ...DEFAULT_ELEMENT_COLOR, ...(cc.elementColors || {}) };
  }
```

- [ ] **Step 3: Replace all bare constant references with `this.*`**

Throughout the file, replace every reference to the old constants:
- `SIZE` → `this.SIZE`
- `CX` → `this.CX`
- `CY` → `this.CY`
- `R.` → `this.R.`
- `PLANET_RADIUS.` → `this.PLANET_RADIUS.`
- `LEADER_LEN` → `this.LEADER_LEN`
- `PLANET_COLOR[` → `this.PLANET_COLOR[`
- `ASPECT_TYPE_COLOR[` → `this.ASPECT_TYPE_COLOR[`
- `ELEMENT_COLOR[` → `this.ELEMENT_COLOR[`

**Important:** Only replace references inside the class methods (inside `class ChartWheel { ... }`). The module-level default constants at the top stay as `DEFAULT_*`. The exported `PLANET_COLOR` and `ASPECT_TYPE_COLOR` still use the defaults (they're used by `ChartResult.js` for legend colors).

Also update `toSvg` to use `this.SIZE`:

```js
  toSvg(chart) {
    // ... existing code ...
    return `<svg viewBox="0 0 ${this.SIZE} ${this.SIZE}" xmlns="http://www.w3.org/2000/svg" role="img">${svgFont}${layers.join('')}</svg>`;
  }
```

And the helper functions `_polar`, `_sector`, etc. that reference `CX`, `CY` — these are class methods so they already have access to `this`.

**Note:** The standalone helper functions at the bottom of the file (`spreadAngles`, `midLongitude`, `f`, `circle`, `line`, `text`, `escapeXml`) do NOT reference the constants — they use parameters passed to them. No changes needed for these.

- [ ] **Step 4: Update ChartResult.js to use config for SVG_SIZE**

In `src/renderer/app/components/ChartResult.js`, the `SVG_SIZE` constant is used for zoom/pan bounds. Change the module constant to a default:

Replace:
```js
const SVG_SIZE = 740;
```
with:
```js
let SVG_SIZE = 740;
```

Update `renderChartResult` signature to accept config:

Replace:
```js
export function renderChartResult(chartContainer, dataContainer, chart, reference) {
  const wheel = new ChartWheel(reference);
```
with:
```js
export function renderChartResult(chartContainer, dataContainer, chart, reference, chartConfig) {
  const svgSize = (chartConfig && chartConfig.svgSize) || SVG_SIZE;
  const wheel = new ChartWheel(reference, chartConfig);
```

Then replace all `SVG_SIZE` references inside the function with `svgSize` (the local variable). There are ~10 occurrences in the zoom/pan/reset/export code.

- [ ] **Step 5: Update ChartWorkbenchView.js to pass config**

In `src/renderer/app/views/ChartWorkbenchView.js`, update the `renderChartResult` call in `_compute()`:

Replace:
```js
      renderChartResult(this.chartCol, this.dataCol, chart, this.ctx.reference);
```
with:
```js
      const chartCfg = this.ctx.config ? this.ctx.config.chart : undefined;
      renderChartResult(this.chartCol, this.dataCol, chart, this.ctx.reference, chartCfg);
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All tests pass. (ChartWheel is renderer-only and not directly tested by RunAll.js, but engine tests must still pass.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/app/components/ChartWheel.js src/renderer/app/components/ChartResult.js src/renderer/app/views/ChartWorkbenchView.js
git commit -m "feat: wire ChartWheel and ChartResult to read from chart config"
```

---

## Phase 4 — Agentic Skill

### Task 6: Create the config-driven-gui skill

**Files:**
- Create: `.opencode/skills/config-driven-gui/SKILL.md`

- [ ] **Step 1: Create `.opencode/skills/config-driven-gui/SKILL.md`**

```markdown
# Skill: config-driven-gui

Use when modifying or adding any GUI parameter — colors, dimensions, fonts, chart sizes, layout values, or window settings — in the CHILLAST project.

## The Rule

**Every visual/layout parameter MUST live in `config.json` and be applied through the config pipeline.** Never hardcode new GUI values directly in CSS or JS. If you find yourself writing a magic number or color literal for a visual property, it belongs in config.

## Architecture

```
config.json (source of truth)
    ↓
ConfigManager.load() (main process, pure Node)
    ↓ IPC: config:get
Preload → ApiClient.getConfig()
    ↓
App.start() → applyConfig()
    ├── theme section → CSS custom properties on :root
    ├── layout section → CSS custom properties (--sidebar-width, --chart-max-width, etc.)
    └── chart section → ChartWheel constructor + ChartResult svgSize
```

## How to Add a New GUI Parameter

### If it's a CSS value (color, size, spacing, font):

1. Add the parameter to the appropriate section in `config.json` (theme, layout)
2. Use camelCase key name — `ConfigApplier` auto-converts to `--kebab-case` CSS variable
3. In the CSS file, use `var(--your-key, fallback)` syntax
4. Example:
   - config.json: `"theme": { "chartBackground": "#111" }`
   - CSS: `background: var(--chart-background, #111);`

### If it's a JS constant (chart radii, SVG sizes, planet colors):

1. Add to the `chart` section in `config.json`
2. In `ChartWheel.js`, the constructor reads `chartConfig.yourKey || DEFAULT_VALUE`
3. Use `this.yourKey` throughout the class methods

### If it's a window/Electron parameter:

1. Add to the `window` section in `config.json`
2. `Main.js` reads `this.config.window.yourKey` in `createWindow()`

## Config Sections

| Section | Applied by | Used for |
|---------|-----------|----------|
| `window` | `Main.js` directly | BrowserWindow dimensions, background |
| `theme` | `ConfigApplier.applyConfig()` → CSS `:root` | All CSS custom properties (colors, radii, shadows, fonts) |
| `layout` | `ConfigApplier.applyConfig()` → CSS `:root` | Structural dimensions (sidebar width, grid columns, breakpoints) |
| `chart` | `ChartWheel` constructor + `ChartResult` | SVG size, radii, planet/aspect/element colors |

## Key Files

| File | Role |
|------|------|
| `config.json` | Default values — the single source of truth |
| `src/core/config/ConfigManager.js` | Load, validate, deep-merge (pure Node, testable) |
| `src/renderer/app/ConfigApplier.js` | Apply theme/layout as CSS variables |
| `src/renderer/app/components/ChartWheel.js` | Reads chart config in constructor |
| `src/renderer/app/components/ChartResult.js` | Reads svgSize from chart config |

## Checklist Before Committing GUI Changes

- [ ] No new hardcoded color literals in CSS or JS (use config + CSS var)
- [ ] No new hardcoded dimension literals for layout (use config + CSS var)
- [ ] No new hardcoded chart constants in ChartWheel/ChartResult (use config)
- [ ] New parameter added to `config.json` with sensible default
- [ ] CSS uses `var(--name, fallback)` pattern for new variables
- [ ] `npm test` passes (ConfigManager tests verify config.json loads)

## Anti-Patterns

| Don't | Do |
|-------|-----|
| `background: #1e1e1e;` | `background: var(--bg-base, #1e1e1e);` |
| `const SIZE = 740;` | `this.SIZE = cc.svgSize \|\| DEFAULT_SIZE;` |
| `max-width: 480px;` | `max-width: var(--chart-max-width, 480px);` |
| Add color to CSS `:root` block | Add to `config.json` theme section |
```

- [ ] **Step 2: Commit**

```bash
git add .opencode/skills/config-driven-gui/SKILL.md
git commit -m "feat: add config-driven-gui agentic skill"
```

---

## Phase 5 — Verification

### Task 7: End-to-end verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (38 engine + 4 ConfigManager = 42).

- [ ] **Step 2: Verify config override works**

Temporarily edit `config.json`, change `"accent": "#4fc1ff"` to `"accent": "#ff0000"`. Run `npm start`. The accent color throughout the UI should turn red. Revert the change.

- [ ] **Step 3: Verify chart config works**

Temporarily edit `config.json`, change `"svgSize": 740` to `"svgSize": 600`. Run `npm start`, generate a chart. The wheel should render smaller. Revert.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: config-driven GUI verification complete"
```
