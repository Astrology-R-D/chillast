# Skill: config-driven-gui

Use when modifying or adding any GUI parameter — colors, dimensions, fonts, chart sizes, layout values, window settings, or UI text — in the CHILLAST project.

## The Rule

**Every visual parameter lives in `config.json`. Every text string lives in `locale/zh.json`. No exceptions.**

## Architecture

```
config.json (primitives + colors + radii + shadows + chart + window)
    |
TokenEngine.resolve() → derived spacing/type scales
    |
Main.js loads config + locale/zh.json
    | IPC: config:get → resolved tokens
    | IPC: locale:get → locale strings
    |
App.start()
    |-- applyConfig() → CSS :root vars (--sp-*, --fs-*, --fw-*, --color-*, --radius-*, --shadow-*)
    |-- loadLocale() → t() function ready
    |-- ctx.config.chart → ChartWheel/ChartResult
    |
Components use:
    |-- Utility classes from Tokens.css (.fs-sm, .gap-2, .p-4, .text-muted)
    |-- var(--token) in CSS files
    |-- t('key') for all text strings
    |-- this.PC / this.ATC / this.EC for chart colors
```

## Adding a New GUI Parameter

### Color or visual CSS value
1. Add to `config.json` → `colors` section (camelCase key)
2. CSS: use `var(--kebab-case-name, fallback)`
3. ConfigApplier auto-converts camelCase → `--kebab-case` CSS var

### Spacing or dimension
1. Use the 4px-based token scale: `--sp-1` (4px) through `--sp-16` (64px)
2. In JS: use utility class (`.p-4`, `.gap-2`, `.mt-3`)
3. In CSS: use `var(--sp-N)`

### Font size
1. Use the type scale: `--fs-xs` (9px) through `--fs-display` (32px)
2. In JS: use `.fs-sm`, `.fs-md`, `.fs-lg` utility classes
3. In CSS: use `var(--fs-name)`

### Chart parameter (SVG sizes, planet colors)
1. Add to `config.json` → `chart` section
2. ChartWheel reads via constructor: `this.X = cc.yourKey || DEFAULT`

### Text string
1. Add to `locale/zh.json` with dot-path key (e.g. `chart.newLabel`)
2. In JS: `t('chart.newLabel')` or `t('chart.newLabel', { var: value })`
3. Interpolation: `{{varName}}` pattern in JSON, `{ varName: value }` in t() call

### Window parameter
1. Add to `config.json` → `window` section
2. Main.js reads `this.config.window.yourKey`

## Key Files

| File | Role |
|------|------|
| `config.json` | Visual token defaults |
| `locale/zh.json` | All UI text strings (Chinese) |
| `src/core/config/TokenEngine.js` | Derives spacing/type scales from primitives |
| `src/core/config/ConfigManager.js` | Load + deep-merge + resolve |
| `src/renderer/app/I18n.js` | `t(key, vars)` i18n function |
| `src/renderer/app/ConfigApplier.js` | Injects tokens as CSS `:root` variables |
| `src/renderer/styles/Tokens.css` | Utility classes (.fs-sm, .gap-2, .p-4, .text-muted) |

## Checklist Before Committing GUI Changes

- [ ] No hardcoded color literals in CSS or JS → use `var(--name)` or config
- [ ] No hardcoded dimensions → use `var(--sp-*)` or utility classes
- [ ] No hardcoded font sizes → use `var(--fs-*)` or utility classes
- [ ] No hardcoded Chinese text in JS → use `t('key')`
- [ ] New text added to `locale/zh.json`
- [ ] New visual param added to `config.json` if needed
- [ ] No inline `style: { ... }` with magic numbers → use utility classes
- [ ] `npm test` passes
