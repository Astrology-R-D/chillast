# Design Token System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded GUI parameters with a primitives-based design token system, utility CSS classes, and i18n locale files.

**Architecture:** `config.json` holds primitives (unit=4, typeBase=13, typeScale=1.2) + colors + chart + window. `TokenEngine` derives spacing/type scales. `ConfigApplier` injects all tokens as CSS `:root` variables. `Tokens.css` provides utility classes. `locale/zh.json` + `I18n.t()` replaces all hardcoded Chinese strings. Components use utility classes instead of inline styles.

**Tech Stack:** CommonJS (main/core), ES modules (renderer), CSS custom properties, Electron IPC

**Spec:** `docs/superpowers/specs/2025-06-18-design-token-system.md`

---

## Phase 1 — Token Infrastructure

### Task 1: New config.json + TokenEngine + tests

**Files:**
- Replace: `config.json`
- Create: `src/core/config/TokenEngine.js`
- Modify: `src/core/config/ConfigManager.js`
- Modify: `tests/RunAll.js`

- [ ] **Step 1: Replace `config.json` with primitives-based structure**

Replace the entire file with the structure from the spec (Section 1). The key addition is the `"primitives"` section at the top and reorganized sections (`colors`, `radii`, `shadows` as separate top-level keys instead of nested under `theme`).

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

- [ ] **Step 2: Create `src/core/config/TokenEngine.js`**

```js
'use strict';

const SPACING_MULTIPLIERS = [0, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const SPACING_NAMES = ['0', 'half', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'];

const TYPE_NAMES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'display'];
const TYPE_EXPONENTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5];

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

const TokenEngine = {
  resolve(raw) {
    const p = raw.primitives || {};
    const unit = p.unit || 4;
    const typeBase = p.typeBase || 13;
    const typeScale = p.typeScale || 1.2;

    const spacing = {};
    SPACING_MULTIPLIERS.forEach((mult, i) => {
      spacing[SPACING_NAMES[i]] = mult === 0 ? '0px' : `${Math.round(unit * mult)}px`;
    });
    spacing.px = '1px';
    if (raw.spacing) Object.assign(spacing, raw.spacing);

    const type = {};
    TYPE_EXPONENTS.forEach((exp, i) => {
      type[TYPE_NAMES[i]] = `${Math.round(typeBase * Math.pow(typeScale, exp))}px`;
    });
    if (raw.type) Object.assign(type, raw.type);

    const weight = { normal: 400, medium: 500, semibold: 600, bold: 700 };

    return {
      spacing,
      type,
      weight,
      colors: raw.colors || {},
      radii: raw.radii || {},
      shadows: raw.shadows || {},
      layout: raw.layout || {},
      chart: raw.chart || {},
      window: raw.window || {},
      locale: raw.locale || 'zh',
    };
  },

  camelToKebab,
};

module.exports = TokenEngine;
```

- [ ] **Step 3: Update `ConfigManager.js` to use TokenEngine**

Replace the entire `src/core/config/ConfigManager.js`:

```js
'use strict';

const path = require('path');
const fs = require('fs');
const TokenEngine = require('./TokenEngine');

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

function loadDefaults() {
  const configPath = path.resolve(__dirname, '..', '..', '..', 'config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

const ConfigManager = {
  load(overrides) {
    const defaults = loadDefaults();
    const merged = overrides ? deepMerge(defaults, overrides) : defaults;
    return TokenEngine.resolve(merged);
  },

  loadRaw(overrides) {
    const defaults = loadDefaults();
    return overrides ? deepMerge(defaults, overrides) : defaults;
  },

  camelToKebab: TokenEngine.camelToKebab,

  themeAsCssVars(colors) {
    const vars = {};
    for (const [key, value] of Object.entries(colors)) {
      vars[`--${TokenEngine.camelToKebab(key)}`] = String(value);
    }
    return vars;
  },

  deepMerge,
};

module.exports = ConfigManager;
```

- [ ] **Step 4: Update tests**

Replace the ConfigManager test section in `tests/RunAll.js`:

```js
const ConfigManager = require('../src/core/config/ConfigManager');
const TokenEngine = require('../src/core/config/TokenEngine');
```

Replace the ConfigManager tests:

```js
console.log('\nTokenEngine');
test('derives spacing scale from unit=4', () => {
  const tokens = TokenEngine.resolve({ primitives: { unit: 4 } });
  assert.strictEqual(tokens.spacing['1'], '4px');
  assert.strictEqual(tokens.spacing['2'], '8px');
  assert.strictEqual(tokens.spacing['4'], '16px');
  assert.strictEqual(tokens.spacing.half, '2px');
  assert.strictEqual(tokens.spacing.px, '1px');
});
test('derives type scale from base=13, scale=1.2', () => {
  const tokens = TokenEngine.resolve({ primitives: { typeBase: 13, typeScale: 1.2 } });
  assert.strictEqual(tokens.type.md, '13px');
  assert.strictEqual(tokens.type.lg, '16px');
  assert.strictEqual(tokens.type.sm, '11px');
});
test('allows explicit spacing overrides', () => {
  const tokens = TokenEngine.resolve({ primitives: { unit: 4 }, spacing: { '2': '10px' } });
  assert.strictEqual(tokens.spacing['2'], '10px');
  assert.strictEqual(tokens.spacing['1'], '4px');
});
test('passes through colors, chart, window', () => {
  const tokens = TokenEngine.resolve({ colors: { accent: '#ff0000' }, chart: { svgSize: 600 } });
  assert.strictEqual(tokens.colors.accent, '#ff0000');
  assert.strictEqual(tokens.chart.svgSize, 600);
});

console.log('\nConfigManager');
test('load returns resolved tokens', () => {
  const cfg = ConfigManager.load();
  assert.ok(cfg.spacing, 'has spacing');
  assert.ok(cfg.type, 'has type');
  assert.ok(cfg.weight, 'has weight');
  assert.ok(cfg.colors, 'has colors');
  assert.strictEqual(cfg.spacing['1'], '4px');
  assert.strictEqual(cfg.type.md, '13px');
});
test('deep-merges partial overrides', () => {
  const cfg = ConfigManager.load({ colors: { accent: '#ff0000' }, chart: { svgSize: 800 } });
  assert.strictEqual(cfg.colors.accent, '#ff0000');
  assert.strictEqual(cfg.chart.svgSize, 800);
  assert.strictEqual(cfg.colors.bgBase, '#1e1e1e');
});
test('camelToKebab converts correctly', () => {
  assert.strictEqual(ConfigManager.camelToKebab('bgPanelSolid'), 'bg-panel-solid');
  assert.strictEqual(ConfigManager.camelToKebab('accent'), 'accent');
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass (old ConfigManager tests replaced with new TokenEngine + ConfigManager tests).

- [ ] **Step 6: Commit**

```bash
git add config.json src/core/config/TokenEngine.js src/core/config/ConfigManager.js tests/RunAll.js
git commit -m "feat: primitives-based config.json + TokenEngine for derived scales"
```

---

## Phase 2 — i18n Infrastructure

### Task 2: Create locale file + I18n module

**Files:**
- Create: `locale/zh.json`
- Create: `src/renderer/app/I18n.js`

- [ ] **Step 1: Create `locale/zh.json`**

Create directory `locale/` and the file with all Chinese strings extracted from source:

```json
{
  "app": {
    "title": "CHILLAST",
    "brandSub": "PERSONAL ASTROLOGY ANALYSIS",
    "version": "v0.0.2 · CHILLAST",
    "chipSigns": "{{count}} 星座",
    "chipCharts": "{{count}} 种星盘",
    "bootText": "正在校准星图…",
    "bootError": "应用启动失败：{{message}}"
  },
  "nav": {
    "profiles": "档案管理",
    "personal": "个人星盘",
    "relationship": "合盘分析",
    "groupProfiles": "档案",
    "groupCharts": "星盘"
  },
  "profiles": {
    "title": "档案管理",
    "sub": "创建并管理你的星盘档案",
    "panelHeading": "档案库 ({{count}})",
    "createBtn": "＋ 新建档案",
    "editBtn": "编辑",
    "deleteBtn": "删除",
    "deleteConfirm": "确定删除档案「{{name}}」？",
    "deleted": "档案已删除",
    "emptyText": "还没有档案，点击「新建档案」开始。",
    "helpTitle": "使用指引",
    "helpBody": "在左侧创建档案后，前往「个人星盘」生成本命、行运、推运与返照盘，或前往「合盘分析」生成比较盘、组合盘与戴维森盘。",
    "helpBirth": "出生时间使用公历，精确到分钟，时区由出生地坐标自动推算（含历史夏令时）。",
    "helpCity": "出生地可搜索内置城市，或手动输入经纬度。",
    "helpStorage": "所有档案以 JSON 形式保存在本机用户数据目录。",
    "editHeading": "编辑档案",
    "createHeading": "新建档案",
    "genderMale": "男",
    "genderFemale": "女",
    "genderOther": "其他"
  },
  "form": {
    "nameZh": "中文名字",
    "nameEn": "英文名字",
    "gender": "性别",
    "birthDateTime": "出生日期与时间（公历，精确到分）",
    "birthPlace": "出生地",
    "notes": "备注",
    "save": "保存修改",
    "create": "创建档案",
    "cancel": "取消",
    "saved": "档案已保存",
    "saveFailed": "保存失败",
    "placeholderZh": "中文名",
    "placeholderEn": "English name",
    "placeholderNotes": "备注（可选）",
    "placeholderYear": "年",
    "placeholderMonth": "月",
    "placeholderDay": "日",
    "placeholderHour": "时",
    "placeholderMinute": "分",
    "citySearch": "搜索城市，如 北京 / Tokyo",
    "latPlaceholder": "纬度 lat",
    "lngPlaceholder": "经度 lng"
  },
  "chart": {
    "personalTitle": "个人星盘",
    "personalSub": "本命 · 行运 · 推运 · 返照 · 太阳弧 · 法达 · 小限 · 重置",
    "relationshipTitle": "合盘分析",
    "relationshipSub": "比较 · 组合 · 马盘 · 时空 · 推运变体",
    "generate": "✶ 生成",
    "resetView": "重置视图",
    "exportSvg": "导出 SVG",
    "exported": "已导出 SVG",
    "loading": "正在计算星盘…",
    "emptyResult": "选择参数后点击「生成」查看星盘。",
    "needProfile": "请先在「档案管理」创建至少一个档案。",
    "sameProfile": "请为合盘选择两个不同的档案",
    "generated": "{{type}} 已生成",
    "labelInner": "内环",
    "labelOuter": "外环",
    "labelProfile": "档案",
    "labelType": "类型",
    "labelHouse": "宫制",
    "labelZodiac": "黄道",
    "targetDate": "目标日期",
    "returnYear": "返照年份",
    "locName": "地名",
    "locLat": "纬度",
    "locLng": "经度",
    "tropical": "回归黄道",
    "sidereal": "恒星黄道",
    "houseLabel": "第 {{num}} 宫",
    "retroLabel": "℞ 逆行中",
    "aspectCount": "相位 ({{count}})"
  },
  "wheel": {
    "sun": "日", "moon": "月", "mercury": "水", "venus": "金", "mars": "火",
    "jupiter": "木", "saturn": "土", "uranus": "天", "neptune": "海", "pluto": "冥",
    "chiron": "凯", "northnode": "北", "southnode": "南", "lilith": "莉",
    "asc": "升", "mc": "顶", "dsc": "降", "ic": "底"
  },
  "legend": {
    "conjunction": "合", "opposition": "冲", "trine": "拱",
    "square": "刑", "sextile": "六合", "quincunx": "梅花",
    "outerRing": "外环",
    "primary": "本命 / 主体", "secondary": "次体", "transit": "行运",
    "progressed": "推运", "composite": "组合", "tertiary": "三限",
    "solarArc": "太阳弧", "profection": "小限", "relocation": "重置"
  },
  "tables": {
    "positions": "行星位置 · Positions",
    "aspects": "相位 · Aspects",
    "aspectsCount": "相位 · Aspects ({{count}})",
    "distribution": "元素与模式 · Distribution",
    "noAspects": "未检测到相位。",
    "thStar": "星", "thName": "名称", "thPos": "位置",
    "thSign": "星座", "thHouse": "宫位",
    "thSymbol": "符号", "thCombo": "组合", "thAspect": "相位", "thOrb": "容许度",
    "elements": "元素 Elements",
    "modalities": "模式 Modalities",
    "angles": "四轴 Angles",
    "houseNum": "{{num}} 宫"
  }
}
```

- [ ] **Step 2: Create `src/renderer/app/I18n.js`**

```js
let _strings = {};

export function loadLocale(strings) { _strings = strings; }

export function t(key, vars) {
  const val = key.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : null), _strings);
  if (val == null) return key;
  if (!vars) return val;
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? vars[k] : `{{${k}}}`));
}
```

- [ ] **Step 3: Commit**

```bash
git add locale/zh.json src/renderer/app/I18n.js
git commit -m "feat: add locale/zh.json and I18n t() function"
```

---

### Task 3: Wire i18n + config through IPC and App.js

**Files:**
- Modify: `src/main/Main.js`
- Modify: `src/main/IpcRouter.js`
- Modify: `src/preload/Preload.js`
- Modify: `src/renderer/app/ApiClient.js`
- Modify: `src/renderer/app/App.js`

- [ ] **Step 1: Update Main.js to load locale file**

Add after the ConfigManager require:

```js
const fs = require('fs');
```

In `bootstrapServices()`, after `this.config = ConfigManager.load();`, add:

```js
    const localeName = this.config.locale || 'zh';
    const localePath = path.join(__dirname, '..', '..', 'locale', `${localeName}.json`);
    this.locale = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
```

Pass locale to IpcRouter:

```js
    new IpcRouter({
      ipcMain,
      profileRepository: this.profileRepository,
      astrologyService: this.astrologyService,
      config: this.config,
      locale: this.locale,
    }).register();
```

- [ ] **Step 2: Update IpcRouter.js**

Update constructor:

```js
  constructor({ ipcMain, profileRepository, astrologyService, config, locale }) {
    this.ipcMain = ipcMain;
    this.profiles = profileRepository;
    this.astrology = astrologyService;
    this.config = config || {};
    this.locale = locale || {};
  }
```

In `register()`, add after `config:get`:

```js
    this._handle('locale:get', () => this.locale);
```

- [ ] **Step 3: Update Preload.js**

Add after `getConfig`:

```js
  getLocale: () => invoke('locale:get'),
```

- [ ] **Step 4: Update ApiClient.js**

Add after `getConfig`:

```js
  getLocale: () => unwrap(api.getLocale()),
```

- [ ] **Step 5: Update App.js to load locale**

Add import:

```js
import { loadLocale } from './I18n.js';
```

In `start()`, after `applyConfig(config);`, add:

```js
    const locale = await ApiClient.getLocale();
    loadLocale(locale);
```

- [ ] **Step 6: Run tests and commit**

Run: `npm test`

```bash
git add src/main/Main.js src/main/IpcRouter.js src/preload/Preload.js src/renderer/app/ApiClient.js src/renderer/app/App.js
git commit -m "feat: wire i18n locale delivery through IPC pipeline"
```

---

## Phase 3 — Enhanced ConfigApplier + Utility CSS

### Task 4: Enhanced ConfigApplier + Tokens.css

**Files:**
- Modify: `src/renderer/app/ConfigApplier.js`
- Create: `src/renderer/styles/Tokens.css`
- Modify: `src/renderer/Index.html`

- [ ] **Step 1: Replace `ConfigApplier.js`**

The resolved tokens object now has `spacing`, `type`, `weight`, `colors`, `radii`, `shadows`, `layout` sections. Set all as CSS variables:

```js
export function applyConfig(config) {
  if (!config) return;
  const root = document.documentElement;
  const set = (name, val) => root.style.setProperty(name, String(val));
  const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

  if (config.spacing) {
    for (const [name, val] of Object.entries(config.spacing)) {
      set(`--sp-${name}`, val);
    }
  }

  if (config.type) {
    for (const [name, val] of Object.entries(config.type)) {
      set(`--fs-${name}`, val);
    }
  }

  if (config.weight) {
    for (const [name, val] of Object.entries(config.weight)) {
      set(`--fw-${name}`, String(val));
    }
  }

  if (config.colors) {
    for (const [key, val] of Object.entries(config.colors)) {
      set(`--${kebab(key)}`, val);
    }
  }

  if (config.radii) {
    for (const [name, val] of Object.entries(config.radii)) {
      set(`--radius-${name}`, val);
    }
  }

  if (config.shadows) {
    for (const [name, val] of Object.entries(config.shadows)) {
      set(`--shadow-${name}`, val);
    }
  }

  if (config.layout) {
    const l = config.layout;
    if (l.sidebarWidth != null) set('--sidebar-width', `${l.sidebarWidth}px`);
    if (l.chartCanvasMaxWidth != null) set('--chart-max-width', `${l.chartCanvasMaxWidth}px`);
    if (l.workbenchGridColumns != null) set('--workbench-grid', l.workbenchGridColumns);
  }
}
```

- [ ] **Step 2: Create `src/renderer/styles/Tokens.css`**

This file defines utility classes referencing the CSS custom properties. Write the full utility class set:

```css
/* Tokens.css — utility classes from design tokens. All values reference --sp-*, --fs-*, --fw-* CSS vars. */

/* —— Spacing: padding ——————————————————————————— */
.p-0    { padding: var(--sp-0); }
.p-half { padding: var(--sp-half); }
.p-1    { padding: var(--sp-1); }
.p-2    { padding: var(--sp-2); }
.p-3    { padding: var(--sp-3); }
.p-4    { padding: var(--sp-4); }
.p-5    { padding: var(--sp-5); }
.p-6    { padding: var(--sp-6); }
.p-8    { padding: var(--sp-8); }

.px-1 { padding-left: var(--sp-1); padding-right: var(--sp-1); }
.px-2 { padding-left: var(--sp-2); padding-right: var(--sp-2); }
.px-3 { padding-left: var(--sp-3); padding-right: var(--sp-3); }
.px-4 { padding-left: var(--sp-4); padding-right: var(--sp-4); }
.px-5 { padding-left: var(--sp-5); padding-right: var(--sp-5); }

.py-1 { padding-top: var(--sp-1); padding-bottom: var(--sp-1); }
.py-2 { padding-top: var(--sp-2); padding-bottom: var(--sp-2); }
.py-3 { padding-top: var(--sp-3); padding-bottom: var(--sp-3); }
.py-4 { padding-top: var(--sp-4); padding-bottom: var(--sp-4); }

.pt-1 { padding-top: var(--sp-1); }  .pt-2 { padding-top: var(--sp-2); }
.pt-3 { padding-top: var(--sp-3); }  .pt-4 { padding-top: var(--sp-4); }
.pb-1 { padding-bottom: var(--sp-1); }  .pb-2 { padding-bottom: var(--sp-2); }
.pb-3 { padding-bottom: var(--sp-3); }  .pb-4 { padding-bottom: var(--sp-4); }
.pl-4 { padding-left: var(--sp-4); }  .pl-5 { padding-left: var(--sp-5); }

/* —— Spacing: margin ———————————————————————————— */
.m-0  { margin: 0; }
.mt-1 { margin-top: var(--sp-1); }  .mt-2 { margin-top: var(--sp-2); }
.mt-3 { margin-top: var(--sp-3); }  .mt-4 { margin-top: var(--sp-4); }
.mt-5 { margin-top: var(--sp-5); }
.mb-1 { margin-bottom: var(--sp-1); }  .mb-2 { margin-bottom: var(--sp-2); }
.mb-3 { margin-bottom: var(--sp-3); }
.ml-1 { margin-left: var(--sp-1); }  .ml-2 { margin-left: var(--sp-2); }

/* —— Spacing: gap ——————————————————————————————— */
.gap-0    { gap: 0; }
.gap-half { gap: var(--sp-half); }
.gap-1    { gap: var(--sp-1); }
.gap-2    { gap: var(--sp-2); }
.gap-3    { gap: var(--sp-3); }
.gap-4    { gap: var(--sp-4); }
.gap-5    { gap: var(--sp-5); }
.gap-6    { gap: var(--sp-6); }

/* —— Typography —————————————————————————————————— */
.fs-2xs    { font-size: var(--fs-2xs); }
.fs-xs     { font-size: var(--fs-xs); }
.fs-sm     { font-size: var(--fs-sm); }
.fs-md     { font-size: var(--fs-md); }
.fs-lg     { font-size: var(--fs-lg); }
.fs-xl     { font-size: var(--fs-xl); }
.fs-2xl    { font-size: var(--fs-2xl); }
.fs-3xl    { font-size: var(--fs-3xl); }
.fs-display { font-size: var(--fs-display); }

.fw-normal   { font-weight: var(--fw-normal); }
.fw-medium   { font-weight: var(--fw-medium); }
.fw-semibold { font-weight: var(--fw-semibold); }
.fw-bold     { font-weight: var(--fw-bold); }

.ls-tight  { letter-spacing: 0.01em; }
.ls-normal { letter-spacing: 0.04em; }
.ls-wide   { letter-spacing: 0.08em; }
.ls-wider  { letter-spacing: 0.18em; }

/* —— Text colors ————————————————————————————————— */
.text-primary   { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-muted     { color: var(--text-muted); }
.text-accent    { color: var(--accent); }
.text-danger    { color: var(--danger); }
.text-success   { color: var(--success); }

/* —— Background colors ——————————————————————————— */
.bg-base    { background: var(--bg-base); }
.bg-panel   { background: var(--bg-panel); }
.bg-deep    { background: var(--bg-deep); }
.bg-elevated { background: var(--bg-elevated); }
.bg-input   { background: var(--bg-input); }

/* —— Layout utilities ———————————————————————————— */
.flex         { display: flex; }
.flex-col     { display: flex; flex-direction: column; }
.flex-wrap    { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-end    { align-items: flex-end; }
.items-baseline { align-items: baseline; }
.justify-between { justify-content: space-between; }
.justify-center  { justify-content: center; }
.flex-1     { flex: 1; }
.w-full     { width: 100%; }
.min-h-0    { min-height: 0; }
.overflow-auto   { overflow: auto; }
.overflow-hidden { overflow: hidden; }
.cursor-pointer  { cursor: pointer; }
.cursor-grab     { cursor: grab; }
.select-none     { user-select: none; }
.truncate   { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-center { text-align: center; }
.text-right  { text-align: right; }
.lh-relaxed  { line-height: 1.7; }
.lh-loose    { line-height: 1.9; }
```

- [ ] **Step 3: Add Tokens.css to Index.html**

In `src/renderer/Index.html`, add after the Theme.css link:

```html
  <link rel="stylesheet" href="styles/Tokens.css" />
```

So the link order is: Theme.css → Tokens.css → Layout.css → Components.css

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/ConfigApplier.js src/renderer/styles/Tokens.css src/renderer/Index.html
git commit -m "feat: enhanced ConfigApplier + utility CSS classes"
```

---

## Phase 4 — CSS Token Migration

### Task 5: Migrate Theme.css to use token variables

**Files:**
- Modify: `src/renderer/styles/Theme.css`

- [ ] **Step 1: Replace `:root` block with token fallbacks**

The `:root` block in Theme.css currently defines CSS custom properties with hardcoded values. These now serve as **fallbacks** — the ConfigApplier will override them at runtime. Keep the `:root` block but convert all values to match the new token naming. Also replace hardcoded values elsewhere in the file with `var()` references.

Key changes:
- Keep `:root` as-is (values match config.json defaults, they're the CSS-side fallback)
- Replace `font-size: 64px` → `font-size: var(--fs-display, 48px)` in `.boot-glyph` (or keep as special value)
- Replace `font-size: 13px` → `font-size: var(--fs-md)` in `.boot-text`
- Replace `font-weight: 600` → `font-weight: var(--fw-semibold)` in `.retro`
- Add `--sp-*` and `--fs-*` fallback defaults to `:root`

Add to the `:root` block:

```css
  --sp-0: 0px; --sp-half: 2px; --sp-px: 1px;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px; --sp-12: 48px; --sp-16: 64px;

  --fs-2xs: 8px; --fs-xs: 9px; --fs-sm: 11px; --fs-md: 13px;
  --fs-lg: 16px; --fs-xl: 19px; --fs-2xl: 22px; --fs-3xl: 27px; --fs-display: 32px;

  --fw-normal: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles/Theme.css
git commit -m "style: add token scale defaults to Theme.css :root"
```

---

### Task 6: Migrate Layout.css to token variables

**Files:**
- Modify: `src/renderer/styles/Layout.css`

- [ ] **Step 1: Replace hardcoded values with `var()` references**

Key replacements throughout the file:

| Old | New |
|-----|-----|
| `background: #252526` | `background: var(--bg-panel-solid)` |
| `padding: 16px 0` | `padding: var(--sp-4) 0` |
| `gap: 2px` | `gap: var(--sp-half)` |
| `gap: 10px` | `gap: var(--sp-2)` (snap 10→8) or use `var(--sp-3)` (12) |
| `padding: 6px 16px 16px` | `padding: var(--sp-1) var(--sp-4) var(--sp-4)` |
| `margin-bottom: 10px` | `margin-bottom: var(--sp-2)` |
| `width: 36px; height: 36px` | keep as-is (avatar is a fixed UI element) |
| `font-size: 16px` | `font-size: var(--fs-lg)` |
| `font-size: 10px` | `font-size: var(--fs-xs)` (snap 10→9) or `var(--fs-2xs)` |
| `font-size: 18px` | `font-size: var(--fs-xl)` (snap 18→19) |
| `font-size: 11px` | `font-size: var(--fs-sm)` |
| `font-size: 12px` | `font-size: var(--fs-sm)` |
| `padding: 9px 16px` | `padding: var(--sp-2) var(--sp-4)` |
| `padding: 14px 24px` | `padding: var(--sp-3) var(--sp-6)` |
| `padding: 20px 24px 40px` | `padding: var(--sp-5) var(--sp-6) var(--sp-10)` |
| `color: #fff` | `color: var(--text-primary)` |
| `font-weight: 700` | `font-weight: var(--fw-bold)` |
| `letter-spacing: 0.04em` | `letter-spacing: 0.04em` (keep, or use `.ls-normal` utility) |
| `rgba(79, 193, 255, 0.08)` | `rgba(79, 193, 255, 0.08)` (keep — derived transparencies are hard to tokenize) |

Apply these replacements throughout the file. Not every single value needs to be tokenized — structural positions (e.g., `border-left: 2px solid transparent`) and derived transparent colors can remain.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles/Layout.css
git commit -m "style: migrate Layout.css to design token variables"
```

---

### Task 7: Migrate Components.css to token variables

**Files:**
- Modify: `src/renderer/styles/Components.css`

- [ ] **Step 1: Replace hardcoded values with `var()` references**

Same pattern as Layout.css. Key replacements:

| Old | New |
|-----|-----|
| `padding: 16px 20px` (panel-header) | `padding: var(--sp-4) var(--sp-5)` |
| `font-size: 15px` | `font-size: var(--fs-lg)` (snap 15→16) |
| `padding: 18px 20px` (panel-body) | `padding: var(--sp-5) var(--sp-5)` (snap 18→20) |
| `padding: 9px 16px` (btn) | `padding: var(--sp-2) var(--sp-4)` |
| `font-size: 13px` (btn) | `font-size: var(--fs-md)` |
| `font-size: 12px` (field label) | `font-size: var(--fs-sm)` |
| `padding: 10px 12px` (input) | `padding: var(--sp-2) var(--sp-3)` |
| `font-size: 48px` (empty-state big) | `font-size: var(--fs-display)` |
| `background: #111` | `background: var(--bg-deep)` |
| `#1e1e1e` | `var(--bg-base)` |
| `font-weight: 600` | `font-weight: var(--fw-semibold)` |
| `font-weight: 500` | `font-weight: var(--fw-medium)` |
| `opacity: 0.45` (btn disabled) | keep as-is |
| `rgba(255,255,255,0.06)` | keep as-is (transparent overlays) |
| `gap: 14px` | `gap: var(--sp-3)` (snap 14→12) or `var(--sp-4)` (16) |

Also remove the duplicate `.mt-2`, `.mt-3`, `.mt-4` definitions at the bottom of Components.css — these are now in Tokens.css. But check they don't conflict first (Tokens.css uses `var(--sp-*)` while Components.css had hardcoded values).

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles/Components.css
git commit -m "style: migrate Components.css to design token variables"
```

---

## Phase 5 — JS Component i18n + Style Migration

### Task 8: Migrate App.js + Boot.js nav labels and brand text to t()

**Files:**
- Modify: `src/renderer/app/App.js`
- Modify: `src/renderer/app/Boot.js`

- [ ] **Step 1: Update App.js**

Add import:

```js
import { t } from './I18n.js';
```

Replace ROUTES array:

```js
const ROUTES = [
  { key: 'profiles', glyph: '☰', labelKey: 'nav.profiles', group: 'nav.groupProfiles' },
  { key: 'personal', glyph: '☉', labelKey: 'nav.personal', group: 'nav.groupCharts' },
  { key: 'relationship', glyph: '☍', labelKey: 'nav.relationship', group: 'nav.groupCharts' },
];
```

In `_buildShell()`, update nav rendering to use `t()`:

Replace `r.label` with `t(r.labelKey)` and `group` labels with `t(items[0].group)`.

Replace brand text:
- `'CHILLAST'` → `t('app.title')`
- `'PERSONAL ASTROLOGY ANALYSIS'` → `t('app.brandSub')`
- `'v0.0.2 · CHILLAST'` → `t('app.version')`

Replace header chips:
- `` `${this.reference.signs.length} 星座` `` → `t('app.chipSigns', { count: this.reference.signs.length })`
- `` `${this.reference.chartTypes.length} 种星盘` `` → `t('app.chipCharts', { count: this.reference.chartTypes.length })`

- [ ] **Step 2: Update Boot.js**

Add import:

```js
import { t } from './I18n.js';
```

Note: `t()` won't work in Boot.js for the error case since locale might not be loaded yet. Keep the Chinese error message as a fallback:

```js
    root.innerHTML = `<div class="empty-state"><div class="big">⚠</div>
      <p>${(err && err.message) || err}</p></div>`;
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/App.js src/renderer/app/Boot.js
git commit -m "feat: migrate App.js and Boot.js to i18n t()"
```

---

### Task 9: Migrate ProfilesView.js + ProfileForm.js + CityPicker.js

**Files:**
- Modify: `src/renderer/app/views/ProfilesView.js`
- Modify: `src/renderer/app/components/ProfileForm.js`
- Modify: `src/renderer/app/components/CityPicker.js`

- [ ] **Step 1: Update ProfilesView.js**

Add import:

```js
import { t } from '../I18n.js';
```

Replace all hardcoded Chinese text with `t()` calls:

| Old | New |
|-----|-----|
| `{ male: '男', female: '女', other: '其他' }` | `{ male: t('profiles.genderMale'), female: t('profiles.genderFemale'), other: t('profiles.genderOther') }` |
| `{ h1: '档案管理', sub: '创建并管理你的星盘档案' }` | `{ h1: t('profiles.title'), sub: t('profiles.sub') }` |
| `` `档案库 (${profiles.length})` `` | `t('profiles.panelHeading', { count: profiles.length })` |
| `'＋ 新建档案'` | `t('profiles.createBtn')` |
| `'还没有档案，点击「新建档案」开始。'` | `t('profiles.emptyText')` |
| `'编辑'` | `t('profiles.editBtn')` |
| `'删除'` | `t('profiles.deleteBtn')` |
| `'使用指引'` | `t('profiles.helpTitle')` |
| `'编辑档案'` / `'新建档案'` | `t('profiles.editHeading')` / `t('profiles.createHeading')` |
| `` `确定删除档案「${...}」？` `` | `t('profiles.deleteConfirm', { name: p.nameZh \|\| p.nameEn })` |
| `'档案已删除'` | `t('profiles.deleted')` |

Replace inline styles with utility classes:

| Old inline style | New class |
|-----------------|-----------|
| `{ fontWeight: '400', marginLeft: '6px', fontSize: '12px' }` | `class: 'fw-normal ml-1 fs-sm'` |
| `{ lineHeight: '1.9', marginTop: '12px', paddingLeft: '18px' }` | `class: 'lh-loose mt-3 pl-5'` |

Note: `GENDER_LABEL` should be computed dynamically (not at module level) since `t()` needs locale loaded:

```js
function genderLabel(gender) {
  const map = { male: 'profiles.genderMale', female: 'profiles.genderFemale', other: 'profiles.genderOther' };
  return t(map[gender] || 'profiles.genderOther');
}
```

- [ ] **Step 2: Update ProfileForm.js**

Add import:

```js
import { t } from '../I18n.js';
```

Replace all Chinese text:

| Old | New |
|-----|-----|
| `{ value: 'male', label: '男' }` | `{ value: 'male', labelKey: 'profiles.genderMale' }` |
| `placeholder: '中文名'` | `placeholder: t('form.placeholderZh')` |
| `placeholder: 'English name'` | `placeholder: t('form.placeholderEn')` |
| `placeholder: '备注（可选）'` | `placeholder: t('form.placeholderNotes')` |
| `placeholder: '年'` | `placeholder: t('form.placeholderYear')` |
| `'中文名字'` (field label) | `t('form.nameZh')` |
| `'英文名字'` | `t('form.nameEn')` |
| `'性别'` | `t('form.gender')` |
| `'出生日期与时间...'` | `t('form.birthDateTime')` |
| `'出生地'` | `t('form.birthPlace')` |
| `'备注'` | `t('form.notes')` |
| `'保存修改'` / `'创建档案'` | `t('form.save')` / `t('form.create')` |
| `'取消'` | `t('form.cancel')` |
| `'档案已保存'` | `t('form.saved')` |
| `'保存失败'` | `t('form.saveFailed')` |

Gender labels need to use `t()` at render time:

```js
const GENDERS = [
  { value: 'male', labelKey: 'profiles.genderMale' },
  { value: 'female', labelKey: 'profiles.genderFemale' },
  { value: 'other', labelKey: 'profiles.genderOther' },
];
```

Then use `t(g.labelKey)` where the label is displayed.

- [ ] **Step 3: Update CityPicker.js**

Add import:

```js
import { t } from '../I18n.js';
```

Replace:

| Old | New |
|-----|-----|
| `'搜索城市，如 北京 / Tokyo'` | `t('form.citySearch')` |
| `'纬度 lat'` | `t('form.latPlaceholder')` |
| `'经度 lng'` | `t('form.lngPlaceholder')` |
| `'出生地'` (label) | `t('form.birthPlace')` |

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

```bash
git add src/renderer/app/views/ProfilesView.js src/renderer/app/components/ProfileForm.js src/renderer/app/components/CityPicker.js
git commit -m "feat: migrate profiles/form/city components to i18n t()"
```

---

### Task 10: Migrate ChartWorkbenchView.js

**Files:**
- Modify: `src/renderer/app/views/ChartWorkbenchView.js`

- [ ] **Step 1: Add i18n import and replace all Chinese text**

Add import:

```js
import { t } from '../I18n.js';
```

Replace:

| Old | New |
|-----|-----|
| `'回归黄道'` | `t('chart.tropical')` |
| `'恒星黄道'` | `t('chart.sidereal')` |
| `{ h1: '个人星盘', sub: '本命 · ...' }` | `{ h1: t('chart.personalTitle'), sub: t('chart.personalSub') }` |
| `{ h1: '合盘分析', sub: '比较 · ...' }` | `{ h1: t('chart.relationshipTitle'), sub: t('chart.relationshipSub') }` |
| `'请先在「档案管理」...'` | `t('chart.needProfile')` |
| `'内环'` / `'外环'` / `'档案'` | `t('chart.labelInner')` / `t('chart.labelOuter')` / `t('chart.labelProfile')` |
| `'类型'` / `'宫制'` / `'黄道'` | `t('chart.labelType')` / `t('chart.labelHouse')` / `t('chart.labelZodiac')` |
| `'✶ 生成'` | `t('chart.generate')` |
| `'目标日期'` / `'返照年份'` | `t('chart.targetDate')` / `t('chart.returnYear')` |
| `'地名'` / `'纬度'` / `'经度'` | `t('chart.locName')` / `t('chart.locLat')` / `t('chart.locLng')` |
| `'请为合盘选择两个不同的档案'` | `t('chart.sameProfile')` |
| `'选择参数后点击「生成」...'` | `t('chart.emptyResult')` |
| `'正在计算星盘…'` | `t('chart.loading')` |
| `` `${chart.meta.typeNameZh} 已生成` `` | `t('chart.generated', { type: chart.meta.typeNameZh })` |

Replace inline styles on `labeled()` helper with utility classes:

```js
function labeled(text, control) {
  return h('div', { class: 'flex-col gap-half' }, [
    h('span', { class: 'fs-2xs text-muted ls-normal' }, text),
    control,
  ]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/app/views/ChartWorkbenchView.js
git commit -m "feat: migrate ChartWorkbenchView to i18n t() + utility classes"
```

---

### Task 11: Migrate ChartWheel.js planet labels to locale

**Files:**
- Modify: `src/renderer/app/components/ChartWheel.js`

- [ ] **Step 1: Pass locale strings to ChartWheel**

The `ChartWheel` constructor already accepts `(reference, chartConfig)`. We need to also pass locale data for planet/angle labels. Update the constructor:

```js
  constructor(reference, chartConfig, wheelLocale) {
    this.signs = reference.signs;
    this.locale = wheelLocale || {};
    // ...rest of existing config setup
  }
```

Replace `PLANET_LABEL` usage in `_planets()` method:

```js
      const pLabel = (this.locale[p.key]) || PLANET_LABEL[p.key] || p.glyph;
```

Replace angle labels in `_angleMarkers()`:

```js
    const labels = {
      ascendant: this.locale.asc || '升',
      midheaven: this.locale.mc || '顶',
      descendant: this.locale.dsc || '降',
      imumcoeli: this.locale.ic || '底',
    };
```

- [ ] **Step 2: Update ChartResult.js to pass wheel locale**

In `renderChartResult`, where ChartWheel is constructed, pass the wheel locale:

```js
  const wheelLocale = reference._wheelLocale || {};
  const wheel = new ChartWheel(reference, chartConfig, wheelLocale);
```

- [ ] **Step 3: Update App.js to attach wheel locale to reference**

In `App.js`, after loading locale, attach the wheel section to the reference object:

```js
    this.reference._wheelLocale = locale.wheel || {};
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/components/ChartWheel.js src/renderer/app/components/ChartResult.js src/renderer/app/App.js
git commit -m "feat: migrate ChartWheel planet/angle labels to locale"
```

---

### Task 12: Migrate ChartTables.js — dedupe colors + i18n

**Files:**
- Modify: `src/renderer/app/components/ChartTables.js`

- [ ] **Step 1: Remove duplicate color maps, import from ChartWheel**

Replace the hardcoded color maps at the top:

```js
import { h } from '../Dom.js';
import { PLANET_COLOR, ASPECT_TYPE_COLOR } from './ChartWheel.js';
import { t } from '../I18n.js';
```

Remove the `ELEMENT_COLOR`, `ASPECT_COLOR`, and `minorColor` constants entirely. Use `ASPECT_TYPE_COLOR` instead of `ASPECT_COLOR`, and get element colors from the chart config context.

In `aspectsPanel`, replace:
```js
    const color = ASPECT_TYPE_COLOR[a.aspectKey] || '#6e6e6e';
```

In `distributionsPanel`, pass element colors from the chart config or use the reference data.

- [ ] **Step 2: Replace all Chinese text with t() calls**

| Old | New |
|-----|-----|
| `'行星位置 · Positions'` | `t('tables.positions')` |
| `'相位 · Aspects'` | `t('tables.aspects')` |
| `` `相位 · Aspects (${aspects.length})` `` | `t('tables.aspectsCount', { count: aspects.length })` |
| `'元素与模式 · Distribution'` | `t('tables.distribution')` |
| `'未检测到相位。'` | `t('tables.noAspects')` |
| `'星'`, `'名称'`, `'位置'`, `'星座'`, `'宫位'` | `t('tables.thStar')`, etc. |
| `'符号'`, `'组合'`, `'相位'`, `'容许度'` | `t('tables.thSymbol')`, etc. |
| `'元素 Elements'` | `t('tables.elements')` |
| `'模式 Modalities'` | `t('tables.modalities')` |
| `'四轴 Angles'` | `t('tables.angles')` |
| `` `${p.house} 宫` `` | `t('tables.houseNum', { num: p.house })` |

Replace inline styles with utility classes:

| Old | New |
|-----|-----|
| `style: { color: ... }` (retrograde) | `class: p.retrograde ? 'text-danger' : ''` |
| `style: { marginBottom: '8px' }` | `class: 'mb-2'` |
| `style: { fontSize: '12px', marginBottom: '8px' }` | `class: 'fs-sm mb-2'` |
| `style: { fontSize: '13px' }` | `class: 'fs-md'` |
| `style: { fontSize: '12px', textAlign: 'right' }` | `class: 'fs-sm text-right'` |

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/components/ChartTables.js
git commit -m "feat: dedupe ChartTables colors + migrate to i18n t()"
```

---

### Task 13: Migrate ChartResult.js inline styles + i18n

**Files:**
- Modify: `src/renderer/app/components/ChartResult.js`

- [ ] **Step 1: Add i18n import and replace text**

Add import:

```js
import { t } from '../I18n.js';
```

Replace RING_LEGEND:

```js
const RING_LEGEND = {};  // no longer needed — use t('legend.*') directly
```

Replace all Chinese text:

| Old | New |
|-----|-----|
| `'重置视图'` | `t('chart.resetView')` |
| `'导出 SVG'` | `t('chart.exportSvg')` |
| `'已导出 SVG'` | `t('chart.exported')` |
| `'合'`, `'冲'`, `'拱'`, `'刑'`, `'六合'`, `'梅花'` | `t('legend.conjunction')`, etc. |
| `'外环'` | `t('legend.outerRing')` |
| `` `宫制 ${...}` `` | `` `${t('chart.labelHouse')} ${...}` `` |
| `` `黄道 ${...}` `` | `` `${t('chart.labelZodiac')} ${...}` `` |
| `` `第 ${pointData.house} 宫` `` | `t('chart.houseLabel', { num: pointData.house })` |
| `'℞ 逆行中'` | `t('chart.retroLabel')` |
| `` `相位 (${related.length})` `` | `t('chart.aspectCount', { count: related.length })` |

- [ ] **Step 2: Replace inline styles with utility classes**

| Old inline style | New class |
|-----------------|-----------|
| `{ gap: '10px', fontSize: '11px', justifyContent: 'center' }` | `class: 'flex flex-wrap gap-2 fs-sm justify-center'` |
| `{ gap: '8px' }` | `class: 'flex gap-2'` |
| `{ fontSize: '12px', padding: '2px 0', display: 'flex', gap: '6px', alignItems: 'center' }` | `class: 'flex items-center gap-1 fs-sm py-half'` |
| `{ color: pColor, fontSize: '14px' }` | keep `style: { color: pColor }` + `class: 'fs-md'` |
| `{ padding: '2px 8px', fontSize: '14px', border: 'none' }` | `class: 'px-2 py-half fs-md'` + `style: { border: 'none' }` |
| `{ fontSize: '13px', lineHeight: '1.7' }` | `class: 'fs-md lh-relaxed'` |
| `{ fontSize: '10px', marginBottom: '4px', letterSpacing: '0.08em' }` | `class: 'fs-2xs mb-1 ls-wide'` |
| `{ gap: '5px' }` | `class: 'flex items-center gap-1'` |

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/components/ChartResult.js
git commit -m "feat: migrate ChartResult to i18n t() + utility classes"
```

---

## Phase 6 — Skill Update + Verification

### Task 14: Update config-driven-gui skill

**Files:**
- Modify: `.opencode/skills/config-driven-gui/SKILL.md`

- [ ] **Step 1: Replace skill content**

Update the skill to reflect the new token system, i18n, and utility classes. Add sections for:
- Token architecture (primitives → TokenEngine → CSS vars)
- i18n workflow (locale/zh.json + t() function)
- Utility class usage pattern
- Checklist now includes i18n check

Key additions to the checklist:

```markdown
## Checklist Before Committing GUI Changes

- [ ] No new hardcoded color literals — use config color + `var(--name)` in CSS
- [ ] No new hardcoded dimensions — use `var(--sp-*)` or utility classes
- [ ] No new hardcoded font sizes — use `var(--fs-*)` or utility classes
- [ ] No new Chinese text in JS — use `t('key')` from I18n.js
- [ ] New text string added to `locale/zh.json` with appropriate key
- [ ] New visual parameter added to `config.json` if needed
- [ ] No inline `style: { ... }` — use utility classes from Tokens.css
- [ ] `npm test` passes
```

- [ ] **Step 2: Commit**

```bash
git add .opencode/skills/config-driven-gui/SKILL.md
git commit -m "feat: update config-driven-gui skill for token system + i18n"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Verify token override works**

Edit `config.json`: change `"accent": "#4fc1ff"` to `"accent": "#ff0000"`. Run `npm start`. All accent-colored elements should be red. Revert.

- [ ] **Step 3: Verify i18n works**

Check that all UI text in the app comes from locale/zh.json by searching for stray Chinese strings in JS:

```bash
grep -rn '[\u4e00-\u9fff]' src/renderer/ --include="*.js"
```

The only remaining Chinese should be in fallback defaults or comments.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: design token system verification complete"
```
