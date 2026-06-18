# Skill: config-driven-gui

Use when modifying or adding any GUI parameter — colors, dimensions, fonts, chart sizes, layout values, or window settings — in the CHILLAST project.

## The Rule

**Every visual/layout parameter MUST live in `config.json` and be applied through the config pipeline.** Never hardcode new GUI values directly in CSS or JS. If you find yourself writing a magic number or color literal for a visual property, it belongs in config.

## Architecture

```
config.json (source of truth)
    |
ConfigManager.load() (main process, pure Node)
    | IPC: config:get
Preload -> ApiClient.getConfig()
    |
App.start() -> applyConfig()
    |-- theme section -> CSS custom properties on :root
    |-- layout section -> CSS custom properties (--sidebar-width, --chart-max-width, etc.)
    +-- chart section -> ChartWheel constructor + ChartResult svgSize
```

## How to Add a New GUI Parameter

### If it's a CSS value (color, size, spacing, font):

1. Add the parameter to the appropriate section in `config.json` (theme or layout)
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
| `theme` | `ConfigApplier.applyConfig()` -> CSS `:root` | All CSS custom properties (colors, radii, shadows, fonts) |
| `layout` | `ConfigApplier.applyConfig()` -> CSS `:root` | Structural dimensions (sidebar width, grid columns, breakpoints) |
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
