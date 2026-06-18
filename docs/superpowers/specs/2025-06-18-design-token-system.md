# Design Token System — Design Spec

## Goal

Replace all hardcoded GUI parameters (colors, spacing, font sizes, dimensions, Chinese text labels) with a design-token system that derives values from primitives, applies them as CSS custom properties, provides utility classes, and externalizes i18n strings into locale files.

## Architecture

```
config.json (primitives + colors + chart + window)
    |
TokenEngine.resolve(config) → complete resolved tokens
    |
Main.js loads config + TokenEngine resolves
    | IPC: config:get → resolved tokens
    | IPC: locale:get → locale strings
    |
App.start()
    |-- applyTokens() → CSS :root variables (--sp-*, --fs-*, --fw-*, --color-*, --radius-*, --shadow-*)
    |-- loadLocale() → t() function ready
    |-- pass tokens to ChartWheel/ChartResult via context
    |
Components use:
    |-- CSS utility classes (.fs-sm, .gap-2, .p-4, .text-muted)
    |-- var(--token) in CSS files
    |-- t('key') for all text strings
    |-- this.PC / this.ATC / this.EC for chart colors (from config.chart)
```

## 1. `config.json` Structure

```json
{
  "primitives": {
    "unit": 4,
    "typeBase": 13,
    "typeScale": 1.2
  },

  "colors": {
    "bgBase":       "#1e1e1e",
    "bgDeep":       "#141414",
    "bgPanel":      "rgba(37, 37, 38, 0.97)",
    "bgPanelSolid": "#252526",
    "bgElevated":   "rgba(45, 45, 45, 0.92)",
    "bgInput":      "rgba(28, 28, 28, 0.88)",
    "borderSoft":   "rgba(70, 70, 70, 0.55)",
    "borderStrong": "rgba(110, 110, 110, 0.65)",
    "textPrimary":  "#d4d4d4",
    "textSecondary":"#9d9d9d",
    "textMuted":    "#6d6d6d",
    "accent":       "#4fc1ff",
    "accentStrong": "#7fdcff",
    "accentViolet": "#569cd6",
    "accentVioletSoft": "rgba(86, 156, 214, 0.15)",
    "danger":       "#f44747",
    "success":      "#4ec9b0",
    "elementFire":  "#ce9178",
    "elementEarth": "#6a9955",
    "elementAir":   "#9cdcfe",
    "elementWater": "#4ec9b0",
    "aspectMajorHarmonic": "#4ec9b0",
    "aspectMajorTension":  "#f44747",
    "aspectConjunction":   "#dcdcaa",
    "aspectMinor":         "#6e6e6e"
  },

  "radii": {
    "sm": "5px",
    "md": "8px",
    "lg": "12px",
    "full": "999px"
  },

  "shadows": {
    "soft": "0 4px 18px rgba(0,0,0,0.6)",
    "glow": "0 0 16px rgba(79,193,255,0.22)"
  },

  "layout": {
    "sidebarWidth": 228,
    "chartCanvasMaxWidth": 480,
    "workbenchGridColumns": "1fr 1fr",
    "responsiveBreakpoint": 1200
  },

  "chart": {
    "svgSize": 740,
    "radii": {
      "outerRim": 364, "zodiacOuter": 356, "zodiacInner": 305,
      "houseOuter": 305, "houseNumber": 130
    },
    "planetRadius": { "single": 256, "inner": 216, "outer": 272 },
    "leaderLength": 32,
    "planetColors": {
      "sun": "#dcdcaa", "moon": "#9cdcfe", "mercury": "#4ec9b0",
      "venus": "#ce9178", "mars": "#f44747", "jupiter": "#c586c0",
      "saturn": "#6a9955", "uranus": "#569cd6", "neptune": "#4fc1ff",
      "pluto": "#d16969", "chiron": "#b5cea8", "northnode": "#9cdcfe",
      "southnode": "#808080", "lilith": "#c586c0"
    },
    "aspectColors": {
      "conjunction": "#dcdcaa", "opposition": "#f44747", "trine": "#4ec9b0",
      "square": "#d97340", "sextile": "#56b6c2", "quincunx": "#c586c0",
      "sesquiquadrate": "#d19a66", "semisquare": "#e06c75",
      "semisextile": "#98c379", "quintile": "#7c7ce0"
    },
    "elementColors": {
      "fire": "#ce9178", "earth": "#6a9955", "air": "#9cdcfe", "water": "#4ec9b0"
    }
  },

  "window": {
    "width": 1440, "height": 920,
    "minWidth": 1100, "minHeight": 720,
    "backgroundColor": "#1e1e1e"
  },

  "locale": "zh"
}
```

## 2. TokenEngine

**File:** `src/core/config/TokenEngine.js` (pure Node, testable)

**Input:** Raw config.json object.

**Output:** Resolved tokens object with derived scales.

**Derivation rules:**
- **Spacing scale:** `unit * multiplier` for multipliers `[0, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16]`
  - Names: `sp-0` (0px), `sp-px` (1px), `sp-0.5` (2px), `sp-1` (4px), `sp-2` (8px), `sp-3` (12px), `sp-4` (16px), `sp-5` (20px), `sp-6` (24px), `sp-8` (32px), `sp-10` (40px), `sp-12` (48px), `sp-16` (64px)
- **Type scale:** `round(typeBase * typeScale^n)` for n = -3..5
  - Names: `fs-2xs` (n=-3), `fs-xs` (n=-2), `fs-sm` (n=-1), `fs-md` (n=0, base), `fs-lg` (n=1), `fs-xl` (n=2), `fs-2xl` (n=3), `fs-3xl` (n=4), `fs-display` (n=5)
- **Font weights:** fixed: `fw-normal` (400), `fw-medium` (500), `fw-semibold` (600), `fw-bold` (700)
- **Colors, radii, shadows, chart, window, layout:** passed through as-is.

If config.json has an explicit `"spacing"` or `"type"` object, those values override the derived ones.

**Method signature:**
```js
TokenEngine.resolve(rawConfig) → {
  spacing: { '0': '0px', '0.5': '2px', '1': '4px', '2': '8px', ... },
  type:    { '2xs': '8px', xs: '9px', sm: '11px', md: '13px', lg: '16px', ... },
  weight:  { normal: 400, medium: 500, semibold: 600, bold: 700 },
  colors:  { bgBase: '#1e1e1e', ... },
  radii:   { sm: '5px', ... },
  shadows: { soft: '...', glow: '...' },
  layout:  { sidebarWidth: 228, ... },
  chart:   { svgSize: 740, ... },
  window:  { width: 1440, ... },
  locale:  'zh'
}
```

## 3. CSS Variable Injection

**File:** `src/renderer/app/ConfigApplier.js` (enhanced)

Receives resolved tokens, sets on `document.documentElement.style`:

| Token group | CSS variable pattern | Example |
|-------------|---------------------|---------|
| spacing | `--sp-{name}` | `--sp-2: 8px` |
| type | `--fs-{name}` | `--fs-sm: 11px` |
| weight | `--fw-{name}` | `--fw-semibold: 600` |
| colors | `--{kebab-name}` | `--bg-base: #1e1e1e` |
| radii | `--radius-{name}` | `--radius-lg: 12px` |
| shadows | `--shadow-{name}` | `--shadow-soft: ...` |
| layout | `--sidebar-width`, `--chart-max-width`, `--workbench-grid` | `--sidebar-width: 228px` |

## 4. Utility CSS

**File:** `src/renderer/styles/Tokens.css`

Generated utility classes referencing CSS variables. Included in `Index.html` after Theme.css.

### Spacing utilities

For each scale stop `{n}` in `[0, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16]`:
- `.p-{n}` — padding all
- `.px-{n}` — padding left + right
- `.py-{n}` — padding top + bottom
- `.pt-{n}`, `.pb-{n}`, `.pl-{n}`, `.pr-{n}` — single side
- `.m-{n}` — margin all
- `.mx-{n}`, `.my-{n}`, `.mt-{n}`, `.mb-{n}`, `.ml-{n}`, `.mr-{n}` — margin variants
- `.gap-{n}` — flex/grid gap

Class name uses the numeric name. For `0.5`, use `.p-half` in utility classes. `--sp-px` provides 1px for borders.

### Typography utilities

- `.fs-2xs` through `.fs-display`
- `.fw-normal`, `.fw-medium`, `.fw-semibold`, `.fw-bold`
- `.ls-tight` (0.01em), `.ls-normal` (0.04em), `.ls-wide` (0.08em), `.ls-wider` (0.18em)

### Color utilities

- `.text-primary`, `.text-secondary`, `.text-muted`, `.text-accent`, `.text-danger`, `.text-success`
- `.bg-base`, `.bg-panel`, `.bg-elevated`, `.bg-input`

### Layout utilities

- `.flex`, `.flex-col`, `.flex-wrap`, `.items-center`, `.justify-between`, `.justify-center`
- `.grid`, `.grid-2` (2-col)
- `.w-full`, `.min-h-0`, `.overflow-auto`, `.overflow-hidden`
- `.cursor-pointer`, `.cursor-grab`
- `.select-none`, `.truncate`

## 5. i18n System

### Locale files

- `locale/zh.json` — all Chinese strings (~100+ keys)
- `locale/en.json` — future English translation (not created now, just the architecture supports it)

**Key structure:** dot-path namespaced by component domain:
- `app.*` — brand, version, splash
- `nav.*` — navigation labels
- `profiles.*` — profile management
- `form.*` — form labels and buttons
- `chart.*` — chart workbench labels
- `wheel.*` — planet/angle labels for SVG
- `tables.*` — data table headers and labels
- `legend.*` — aspect legend labels

**Interpolation:** `{{variable}}` pattern. Example: `"generated": "{{type}} 已生成"`.

### `src/renderer/app/I18n.js`

```js
let _strings = {};
export function loadLocale(strings) { _strings = strings; }
export function t(key, vars) {
  const val = key.split('.').reduce((o, k) => (o?.[k] ?? null), _strings);
  if (val == null) return key;
  if (!vars) return val;
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
```

### IPC delivery

- Main process reads `locale/{config.locale}.json`
- Serves via `locale:get` IPC channel
- Preload exposes `getLocale()`
- `App.start()` calls `loadLocale()` before building UI

## 6. Color Deduplication

`ChartTables.js` currently defines its own `ELEMENT_COLOR` and `ASPECT_COLOR` maps that duplicate `ChartWheel.js` defaults. After this change:

- `ChartTables.js` imports `PLANET_COLOR` and `ASPECT_TYPE_COLOR` from `ChartWheel.js` (already exported)
- OR reads colors from the resolved chart config passed through context
- The single source of truth is `config.json` → `chart.elementColors` / `chart.aspectColors`

## 7. CSS Migration Rules

All CSS files (Theme.css, Layout.css, Components.css) migrate hardcoded values:

| Pattern | Replace with |
|---------|-------------|
| `#252526` (sidebar bg) | `var(--bg-panel-solid)` |
| `#111` (chart bg) | `var(--bg-deep)` |
| `#fff` (brand mark text) | `var(--text-primary)` or a new token |
| `rgba(79, 193, 255, 0.08)` | `color-mix()` from `var(--accent)` or a semantic token |
| `font-size: 13px` | `font-size: var(--fs-md)` |
| `padding: 16px 20px` | `padding: var(--sp-4) var(--sp-5)` |
| `gap: 10px` | `gap: var(--sp-2\.5)` or nearest token |
| `border-radius: var(--radius-lg)` | already tokenized |

Values that don't map cleanly to a scale stop (e.g., `14px` padding) snap to the nearest token (14 → `--sp-3` = 12px or `--sp-4` = 16px).

## 8. File Map

### New files

| File | Responsibility |
|------|----------------|
| `config.json` | Replaces current config.json with primitives-based structure |
| `src/core/config/TokenEngine.js` | Derives spacing + type scales from primitives |
| `src/renderer/app/I18n.js` | `loadLocale()` + `t(key, vars)` |
| `src/renderer/styles/Tokens.css` | Utility classes referencing CSS variables |
| `locale/zh.json` | All Chinese text strings |

### Files to modify

| File | Changes |
|------|---------|
| `src/core/config/ConfigManager.js` | Use TokenEngine to resolve before returning |
| `src/renderer/app/ConfigApplier.js` | Set spacing/type/weight/color/radius/shadow vars |
| `src/main/Main.js` | Serve resolved tokens, load locale file |
| `src/main/IpcRouter.js` | Add `locale:get` channel |
| `src/preload/Preload.js` | Expose `getLocale()` |
| `src/renderer/app/ApiClient.js` | Add `getLocale()` |
| `src/renderer/app/App.js` | Fetch locale, call `loadLocale()` |
| `src/renderer/Index.html` | Add `Tokens.css` link, use `t()` for splash text |
| `src/renderer/styles/Theme.css` | Replace hardcoded values with `var()` tokens |
| `src/renderer/styles/Layout.css` | Replace hardcoded values with `var()` tokens |
| `src/renderer/styles/Components.css` | Replace hardcoded values with `var()` tokens |
| `src/renderer/app/views/ProfilesView.js` | Replace inline styles with utility classes, text with `t()` |
| `src/renderer/app/views/ChartWorkbenchView.js` | Replace inline styles + text with tokens + `t()` |
| `src/renderer/app/components/ChartWheel.js` | Read planet/angle labels from locale |
| `src/renderer/app/components/ChartResult.js` | Replace inline styles + text with tokens + `t()` |
| `src/renderer/app/components/ChartTables.js` | Dedupe colors from config, text with `t()` |
| `src/renderer/app/components/ProfileForm.js` | Text with `t()`, inline styles with utility classes |
| `src/renderer/app/components/CityPicker.js` | Text with `t()` |
| `src/renderer/app/components/Toast.js` | Timing values from config (optional) |
| `src/renderer/app/Boot.js` | Text with `t()` |
| `tests/RunAll.js` | Add TokenEngine tests |

### Skill update

| File | Changes |
|------|---------|
| `.opencode/skills/config-driven-gui/SKILL.md` | Update to reflect token system + i18n + utility classes |

## 9. Invariants

- `config.json` is the single source of truth for all visual tokens.
- No hardcoded color literals in CSS or JS. All use `var(--*)` or config.
- No hardcoded Chinese text in JS. All use `t('key')`.
- No inline `style: { ... }` with hardcoded dimensions in JS. All use utility classes.
- CSS uses `var(--token, fallback)` pattern; fallbacks match config defaults.
- Spacing values snap to the 4px-based scale.
- Font sizes use the type scale names (`fs-xs` through `fs-display`).
