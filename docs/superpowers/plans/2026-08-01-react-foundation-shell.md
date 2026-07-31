# React Foundation and Application Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separately runnable React/TypeScript renderer with the approved dual-theme design system and responsive, resizable three-column shell without changing the default legacy renderer.

**Architecture:** Vite builds `src/renderer-react` to `dist/renderer-react`; a pure CommonJS loader lets Electron select the legacy file, React build, or local Vite URL. The React application wraps the existing preload envelope with typed adapters, owns theme/density preferences in a small Zustand store, and renders localized placeholder routes inside a responsive split-panel shell so later feature plans can migrate one route at a time.

**Tech Stack:** Electron 42, React, TypeScript, Vite, Vitest, React Testing Library, Zustand, TanStack Query, Lucide React, react-resizable-panels, CSS custom properties

**Design spec:** `docs/superpowers/specs/2026-08-01-react-workbench-redesign-design.md`

---

## Delivery Boundary

This is plan 1 of 5. It delivers a working shell, not migrated feature pages.
The follow-up plans are:

1. Profile directory and editor migration.
2. Western chart workbench, SVG interaction, and data explorer migration.
3. Chinese astrology, solar terms, and settings migration.
4. AI chat, reports, research, final parity, and production cutover.

The default `npm start` and `npm run smoke` continue to run the legacy renderer.
React is selected only by `npm run dev:react`, `npm run start:react`, or the new
React smoke test.

## File Map

### Build and Electron integration

- Modify `package.json`: add React tooling scripts, dependencies, and packaged renderer files.
- Modify `package-lock.json`: generated dependency lock changes.
- Create `vite.config.mts`: Vite root, relative asset base, output, and Vitest settings.
- Create `tsconfig.json`: project references for the renderer.
- Create `tsconfig.renderer.json`: strict browser/React compiler settings.
- Create `src/main/RendererLoader.js`: pure renderer target selection and loading.
- Modify `src/main/Main.js`: use the selected renderer target without changing window security.
- Create `tests/RendererLoader.test.js`: loader branch and URL-safety tests.

### Renderer platform

- Create `src/renderer-react/index.html`: CSP, pre-paint theme script, and React mount point.
- Create `src/renderer-react/build-configuration.test.ts`: CSP and generated build-artifact regression checks.
- Create `src/renderer-react/public/theme-bootstrap.js`: synchronous pre-paint theme and density attributes.
- Create `src/renderer-react/main.tsx`: renderer entry.
- Create `src/renderer-react/api/contracts.ts`: config, locale, AI status, and IPC envelope types.
- Create `src/renderer-react/api/client.ts`: typed preload envelope adapter.
- Create `src/renderer-react/api/client.test.ts`: envelope behavior tests.
- Create `src/renderer-react/types/myst-api.d.ts`: global `window.mystApi` declaration.
- Create `src/renderer-react/config/applyRuntimeConfig.ts`: apply non-color backend tokens.
- Create `src/renderer-react/config/applyRuntimeConfig.test.ts`: token mapping tests.
- Create `src/renderer-react/i18n/I18nProvider.tsx`: locale lookup and interpolation.
- Create `src/renderer-react/i18n/I18nProvider.test.tsx`: locale behavior tests.

### Preferences and visual system

- Create `src/renderer-react/preferences/preferences.ts`: theme/density store and DOM synchronization.
- Create `src/renderer-react/preferences/preferences.test.ts`: persistence and system-theme tests.
- Create `src/renderer-react/styles/fonts.css`: bundled Maple Mono NF CN faces.
- Create `src/renderer-react/styles/tokens.css`: geometry, spacing, and typography tokens.
- Create `src/renderer-react/styles/themes.css`: semantic light/dark colors.
- Create `src/renderer-react/styles/density.css`: compact/comfortable dimensions.
- Create `src/renderer-react/styles/global.css`: reset, focus, scrollbars, and reduced motion.
- Create `src/renderer-react/styles/shell.css`: shell, navigation, placeholders, and responsive overlay.

### Shell and bootstrap

- Create `src/renderer-react/shell/routes.ts`: stable route metadata and icons.
- Create `src/renderer-react/shell/useNarrowLayout.ts`: responsive media-query hook.
- Create `src/renderer-react/shell/PanelLayout.tsx`: desktop split panels and narrow overlay.
- Create `src/renderer-react/shell/PanelLayout.test.tsx`: desktop/narrow and keyboard resize tests.
- Create `src/renderer-react/shell/Navigation.tsx`: grouped route navigation.
- Create `src/renderer-react/shell/AiStatusPanel.tsx`: application-lifetime AI status surface.
- Create `src/renderer-react/shell/AppShell.tsx`: shell composition and route state.
- Create `src/renderer-react/shell/AppShell.test.tsx`: route, collapse, and status tests.
- Create `src/renderer-react/app/AppProviders.tsx`: QueryClient and preference synchronization.
- Create `src/renderer-react/app/App.tsx`: config/locale bootstrap and startup states.
- Create `src/renderer-react/app/App.test.tsx`: bootstrap success/error tests.
- Create `src/renderer-react/test/setup.ts`: DOM test setup and browser API mocks.
- Modify `locale/zh.json`: shell, appearance, accessibility, and placeholder labels.
- Create `tests/SmokeReactRenderer.js`: built renderer/preload/IPC smoke test.

---

### Task 1: Install and Configure the React Toolchain

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vite.config.mts`
- Create: `tsconfig.json`
- Create: `tsconfig.renderer.json`
- Create: `src/renderer-react/index.html`
- Create: `src/renderer-react/build-configuration.test.ts`
- Create: `src/renderer-react/public/theme-bootstrap.js`
- Create: `src/renderer-react/main.tsx`
- Create: `src/renderer-react/test/setup.ts`

- [ ] **Step 1: Install runtime dependencies**

Run:

```powershell
npm install react react-dom zustand @tanstack/react-query lucide-react react-resizable-panels@2.1.9
```

Expected: exit code 0; `package.json` and `package-lock.json` list the direct dependencies.

- [ ] **Step 2: Install build and test dependencies**

Run:

```powershell
npm install --save-dev vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom concurrently wait-on cross-env
```

Expected: exit code 0 with no peer-dependency failure.

- [ ] **Step 3: Add renderer scripts and package files**

Add these scripts to `package.json` without changing `start`, `test`, or `smoke`:

```json
{
  "dev:renderer": "vite --host 127.0.0.1",
  "dev:react": "concurrently -k \"npm:dev:renderer\" \"wait-on tcp:5173 && cross-env CHILLAST_RENDERER_URL=http://127.0.0.1:5173 electron .\"",
  "build:renderer": "vite build",
  "start:react": "npm run build:renderer && cross-env CHILLAST_RENDERER=react electron .",
  "test:renderer": "vitest run",
  "test:renderer:watch": "vitest",
  "test:loader": "node --test tests/RendererLoader.test.js",
  "smoke:react": "npm run build:renderer && electron tests/SmokeReactRenderer.js"
}
```

Add `"dist/renderer-react/**/*"` to `build.files`. Change `predist` to:

```json
"predist": "npm run build:renderer && electron-rebuild -f --only swisseph-v2"
```

- [ ] **Step 4: Create strict TypeScript and Vite configuration**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.renderer.json" }]
}
```

Create `tsconfig.renderer.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "tsBuildInfoFile": "./dist/.cache/tsconfig.renderer.tsbuildinfo",
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/renderer-react", "vite.config.mts"]
}
```

Create `vite.config.mts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer-react', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer-react', import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('./src/renderer-react/test/setup.ts', import.meta.url))],
    include: ['**/*.test.{ts,tsx}'],
    css: true,
  },
});
```

- [ ] **Step 5: Create the HTML and minimal renderer entry**

Create `src/renderer-react/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; font-src 'self'; connect-src 'self' ws://127.0.0.1:*;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script vite-ignore src="./theme-bootstrap.js"></script>
    <title>CHILLAST</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer-react/public/theme-bootstrap.js`:

```js
(() => {
  const theme = localStorage.getItem('chillast.theme') || 'system';
  const density = localStorage.getItem('chillast.density') || 'compact';
  const dark = theme === 'dark'
    || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePreference = theme;
  document.documentElement.dataset.density = density === 'comfortable' ? 'comfortable' : 'compact';
})();
```

Create `src/renderer-react/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('React root element is missing');
createRoot(root).render(<main aria-label="CHILLAST React renderer">React renderer bootstrap</main>);
```

Create `src/renderer-react/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);
```

- [ ] **Step 6: Verify the toolchain**

Run:

```powershell
npm run build:renderer
npx tsc -p tsconfig.renderer.json
```

Expected: both commands exit 0 and `dist/renderer-react/index.html` exists.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json vite.config.mts tsconfig.json tsconfig.renderer.json src/renderer-react
git commit -m "build(ui): add React renderer toolchain"
```

---

### Task 2: Select the Renderer Without Breaking Legacy Startup

**Files:**
- Create: `src/main/RendererLoader.js`
- Modify: `src/main/Main.js:1-10,152-180`
- Create: `tests/RendererLoader.test.js`

- [ ] **Step 1: Write failing loader tests**

Create `tests/RendererLoader.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { selectRendererTarget, loadRenderer } = require('../src/main/RendererLoader');

const appRoot = path.join('D:', 'repo', 'chillast');

test('legacy renderer remains the default', () => {
  assert.deepStrictEqual(selectRendererTarget({ env: {}, appRoot }), {
    kind: 'legacy',
    value: path.join(appRoot, 'src', 'renderer', 'Index.html'),
  });
});

test('react build requires the explicit renderer flag', () => {
  assert.deepStrictEqual(selectRendererTarget({ env: { CHILLAST_RENDERER: 'react' }, appRoot }), {
    kind: 'react-file',
    value: path.join(appRoot, 'dist', 'renderer-react', 'index.html'),
  });
});

test('development URL accepts localhost only', () => {
  assert.equal(selectRendererTarget({ env: { CHILLAST_RENDERER_URL: 'http://127.0.0.1:5173' }, appRoot }).kind, 'react-url');
  assert.throws(
    () => selectRendererTarget({ env: { CHILLAST_RENDERER_URL: 'https://example.com/app' }, appRoot }),
    /localhost renderer URL/,
  );
});

test('loadRenderer delegates to the matching BrowserWindow method', async () => {
  const calls = [];
  const win = {
    loadURL: async (value) => calls.push(['url', value]),
    loadFile: async (value) => calls.push(['file', value]),
  };
  await loadRenderer(win, { kind: 'react-url', value: 'http://localhost:5173' });
  await loadRenderer(win, { kind: 'react-file', value: 'D:/app/index.html' });
  assert.deepStrictEqual(calls, [
    ['url', 'http://localhost:5173'],
    ['file', 'D:/app/index.html'],
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:loader`

Expected: FAIL because `src/main/RendererLoader.js` does not exist.

- [ ] **Step 3: Implement the pure loader**

Create `src/main/RendererLoader.js`:

```js
'use strict';

const path = require('node:path');

function selectRendererTarget({ env = process.env, appRoot = path.join(__dirname, '..', '..') } = {}) {
  if (env.CHILLAST_RENDERER_URL) {
    const url = new URL(env.CHILLAST_RENDERER_URL);
    const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
    if (url.protocol !== 'http:' || !localHosts.has(url.hostname)) {
      throw new Error('CHILLAST_RENDERER_URL must be an http localhost renderer URL');
    }
    return { kind: 'react-url', value: url.href.replace(/\/$/, '') };
  }
  if (env.CHILLAST_RENDERER === 'react') {
    return { kind: 'react-file', value: path.join(appRoot, 'dist', 'renderer-react', 'index.html') };
  }
  return { kind: 'legacy', value: path.join(appRoot, 'src', 'renderer', 'Index.html') };
}

async function loadRenderer(win, target) {
  if (target.kind === 'react-url') return win.loadURL(target.value);
  return win.loadFile(target.value);
}

module.exports = { selectRendererTarget, loadRenderer };
```

- [ ] **Step 4: Integrate the loader in Main**

Add `nativeTheme` to the Electron import, import the loader, and replace the
hard-coded load call. The resulting relevant code must be:

```js
const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const { selectRendererTarget, loadRenderer } = require('./RendererLoader');

createWindow() {
  const win = this.config.window || {};
  const rendererTarget = selectRendererTarget();
  const reactBackground = nativeTheme.shouldUseDarkColors ? '#171719' : '#f6f6f8';
  this.mainWindow = new BrowserWindow({
    width: win.width || 1440,
    height: win.height || 920,
    minWidth: win.minWidth || 1100,
    minHeight: win.minHeight || 720,
    backgroundColor: rendererTarget.kind === 'legacy'
      ? (win.backgroundColor || '#1e1e1e')
      : reactBackground,
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

  this.router.setWebContents(this.mainWindow.webContents);
  loadRenderer(this.mainWindow, rendererTarget).catch((error) => {
    console.error('[Main] Renderer load failed:', error);
  });
  this.mainWindow.once('ready-to-show', () => this.mainWindow.show());
  this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  this.mainWindow.on('closed', () => { this.mainWindow = null; });
}
```

- [ ] **Step 5: Run loader and legacy tests**

Run:

```powershell
npm run test:loader
npm test
```

Expected: loader reports 4 passing tests; the existing suite reports 0 failures.

- [ ] **Step 6: Commit**

```powershell
git add src/main/RendererLoader.js src/main/Main.js tests/RendererLoader.test.js
git commit -m "feat(ui): add staged React renderer loader"
```

---

### Task 3: Add the Typed Preload Adapter, Runtime Config, and Localization

**Files:**
- Create: `src/renderer-react/api/contracts.ts`
- Create: `src/renderer-react/api/client.ts`
- Create: `src/renderer-react/api/client.test.ts`
- Create: `src/renderer-react/types/myst-api.d.ts`
- Create: `src/renderer-react/config/applyRuntimeConfig.ts`
- Create: `src/renderer-react/config/applyRuntimeConfig.test.ts`
- Create: `src/renderer-react/i18n/I18nProvider.tsx`
- Create: `src/renderer-react/i18n/I18nProvider.test.tsx`

- [ ] **Step 1: Write failing adapter and token tests**

Create `src/renderer-react/api/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { unwrap } from './client';

describe('unwrap', () => {
  it('returns successful IPC data', async () => {
    await expect(unwrap(Promise.resolve({ ok: true, data: { locale: 'zh' } })))
      .resolves.toEqual({ locale: 'zh' });
  });

  it('throws the IPC error message', async () => {
    await expect(unwrap(Promise.resolve({ ok: false, error: '配置失败' })))
      .rejects.toThrow('配置失败');
  });

  it('rejects malformed envelopes', async () => {
    await expect(unwrap(Promise.resolve(null as never))).rejects.toThrow('未知错误');
  });
});
```

Create `src/renderer-react/config/applyRuntimeConfig.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { applyRuntimeConfig } from './applyRuntimeConfig';

describe('applyRuntimeConfig', () => {
  beforeEach(() => document.documentElement.removeAttribute('style'));

  it('applies spacing, type, weight, and layout tokens', () => {
    applyRuntimeConfig({
      spacing: { 2: '8px' },
      type: { md: '13px' },
      weight: { semibold: 600 },
      layout: { headerHeight: 56, sidebarWidth: 228 },
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--sp-2')).toBe('8px');
    expect(style.getPropertyValue('--fs-md')).toBe('13px');
    expect(style.getPropertyValue('--fw-semibold')).toBe('600');
    expect(style.getPropertyValue('--header-height')).toBe('56px');
    expect(style.getPropertyValue('--sidebar-width')).toBe('228px');
  });

  it('does not copy legacy dark colors into the semantic React theme', () => {
    applyRuntimeConfig({ colors: { bgBase: '#000000' } });
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer -- src/renderer-react/api/client.test.ts src/renderer-react/config/applyRuntimeConfig.test.ts`

Expected: FAIL because the imported modules do not exist.

- [ ] **Step 3: Define the phase-one contracts and global API**

Create `src/renderer-react/api/contracts.ts`:

```ts
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type LocaleDictionary = { [key: string]: string | LocaleDictionary };

export interface AppConfig {
  spacing?: Record<string, string>;
  type?: Record<string, string>;
  weight?: Record<string, number>;
  colors?: Record<string, string>;
  layout?: {
    sidebarWidth?: number;
    chartCanvasMaxWidth?: number;
    headerHeight?: number;
  };
  window?: { width?: number; height?: number; minWidth?: number; minHeight?: number };
  ui?: { showBrandSub?: boolean; aiGlyph?: string };
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
  knowledgeDocCount: number;
}

export type AiInitProgress =
  | { phase: 'preparing' }
  | { phase: 'model'; percent?: number; file?: string }
  | { phase: 'indexing'; done?: number; total?: number }
  | { phase: 'ready'; docs?: number; chunks?: number; fromCache?: boolean }
  | { phase: 'error'; message: string };
```

Create `src/renderer-react/types/myst-api.d.ts`:

```ts
import type { AiInitProgress, AiStatus, AppConfig, IpcResult, LocaleDictionary } from '../api/contracts';

interface PhaseOneMystApi {
  getConfig(): Promise<IpcResult<AppConfig>>;
  getLocale(): Promise<IpcResult<LocaleDictionary>>;
  ai: {
    status(): Promise<IpcResult<AiStatus>>;
    initStatus(): Promise<IpcResult<AiInitProgress | null>>;
    onStatusChanged(callback: (status: AiStatus) => void): void;
    onInitProgress(callback: (progress: AiInitProgress) => void): void;
  };
}

declare global {
  interface Window { mystApi: PhaseOneMystApi }
}

export {};
```

- [ ] **Step 4: Implement envelope and runtime-config adapters**

Create `src/renderer-react/api/client.ts`:

```ts
import type { AiStatus, AppConfig, IpcResult, LocaleDictionary } from './contracts';

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result || result.ok !== true) {
    throw new Error(result && 'error' in result ? result.error : '未知错误');
  }
  return result.data;
}

export const apiClient = {
  getConfig: (): Promise<AppConfig> => unwrap(window.mystApi.getConfig()),
  getLocale: (): Promise<LocaleDictionary> => unwrap(window.mystApi.getLocale()),
  getAiStatus: (): Promise<AiStatus> => unwrap(window.mystApi.ai.status()),
};
```

Create `src/renderer-react/config/applyRuntimeConfig.ts`:

```ts
import type { AppConfig } from '../api/contracts';

export function applyRuntimeConfig(config: AppConfig): void {
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(config.spacing ?? {})) style.setProperty(`--sp-${name}`, value);
  for (const [name, value] of Object.entries(config.type ?? {})) style.setProperty(`--fs-${name}`, value);
  for (const [name, value] of Object.entries(config.weight ?? {})) style.setProperty(`--fw-${name}`, String(value));
  const layout = config.layout ?? {};
  if (layout.headerHeight != null) style.setProperty('--header-height', `${layout.headerHeight}px`);
  if (layout.sidebarWidth != null) style.setProperty('--sidebar-width', `${layout.sidebarWidth}px`);
  if (layout.chartCanvasMaxWidth != null) style.setProperty('--chart-max-width', `${layout.chartCanvasMaxWidth}px`);
}
```

- [ ] **Step 5: Write and implement localization behavior**

Create `src/renderer-react/i18n/I18nProvider.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from './I18nProvider';

function Probe() {
  const { t } = useI18n();
  return <>{t('shell.count', { count: 6 })}|{t('missing.key')}</>;
}

describe('I18nProvider', () => {
  it('resolves nested keys, variables, and missing-key fallback', () => {
    render(<I18nProvider messages={{ shell: { count: '{{count}} 个页面' } }}><Probe /></I18nProvider>);
    expect(screen.getByText('6 个页面|missing.key')).toBeInTheDocument();
  });
});
```

Create `src/renderer-react/i18n/I18nProvider.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { LocaleDictionary } from '../api/contracts';

type Variables = Record<string, string | number>;
type I18nValue = { t: (key: string, variables?: Variables) => string };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ messages, children }: { messages: LocaleDictionary; children: ReactNode }) {
  const t = (key: string, variables?: Variables): string => {
    const value = key.split('.').reduce<string | LocaleDictionary | undefined>(
      (current, part) => typeof current === 'object' ? current[part] : undefined,
      messages,
    );
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
      variables?.[name] == null ? match : String(variables[name]));
  };
  return <I18nContext.Provider value={{ t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
```

- [ ] **Step 6: Run the focused tests and typecheck**

Run:

```powershell
npm run test:renderer -- src/renderer-react/api/client.test.ts src/renderer-react/config/applyRuntimeConfig.test.ts src/renderer-react/i18n/I18nProvider.test.tsx
npx tsc -p tsconfig.renderer.json
```

Expected: 3 test files pass and TypeScript exits 0.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer-react/api src/renderer-react/config src/renderer-react/i18n src/renderer-react/types
git commit -m "feat(ui): add typed renderer platform adapters"
```

---

### Task 4: Implement Theme and Density Preferences

**Files:**
- Create: `src/renderer-react/preferences/preferences.ts`
- Create: `src/renderer-react/preferences/preferences.test.ts`
- Create: `src/renderer-react/styles/fonts.css`
- Create: `src/renderer-react/styles/tokens.css`
- Create: `src/renderer-react/styles/themes.css`
- Create: `src/renderer-react/styles/density.css`
- Create: `src/renderer-react/styles/global.css`
- Modify: `src/renderer-react/main.tsx`

- [ ] **Step 1: Write failing preference tests**

Create `src/renderer-react/preferences/preferences.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreferencesStore, syncPreferencesToDocument } from './preferences';

function media(matches: boolean) {
  return { matches, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList;
}

describe('preferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to system theme and compact density', () => {
    const store = createPreferencesStore(localStorage);
    expect(store.getState()).toMatchObject({ theme: 'system', density: 'compact' });
  });

  it('persists explicit choices', () => {
    const store = createPreferencesStore(localStorage);
    store.getState().setTheme('light');
    store.getState().setDensity('comfortable');
    expect(localStorage.getItem('chillast.theme')).toBe('light');
    expect(localStorage.getItem('chillast.density')).toBe('comfortable');
  });

  it('resolves system changes and writes document attributes', () => {
    const query = media(true);
    syncPreferencesToDocument({ theme: 'system', density: 'compact' }, query);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePreference).toBe('system');
    expect(document.documentElement.dataset.density).toBe('compact');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:renderer -- src/renderer-react/preferences/preferences.test.ts`

Expected: FAIL because `preferences.ts` does not exist.

- [ ] **Step 3: Implement the store and DOM synchronization**

Create `src/renderer-react/preferences/preferences.ts`:

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'compact' | 'comfortable';

type PreferenceValues = { theme: ThemePreference; density: DensityPreference };
type PreferenceState = PreferenceValues & {
  setTheme: (theme: ThemePreference) => void;
  setDensity: (density: DensityPreference) => void;
};

const validTheme = (value: string | null): ThemePreference =>
  value === 'light' || value === 'dark' ? value : 'system';
const validDensity = (value: string | null): DensityPreference =>
  value === 'comfortable' ? value : 'compact';

export function createPreferencesStore(storage: Storage): StoreApi<PreferenceState> {
  return createStore<PreferenceState>((set) => ({
    theme: validTheme(storage.getItem('chillast.theme')),
    density: validDensity(storage.getItem('chillast.density')),
    setTheme: (theme) => { storage.setItem('chillast.theme', theme); set({ theme }); },
    setDensity: (density) => { storage.setItem('chillast.density', density); set({ density }); },
  }));
}

export const preferencesStore = createPreferencesStore(window.localStorage);
export const usePreferences = <T,>(selector: (state: PreferenceState) => T): T =>
  useStore(preferencesStore, selector);

export function syncPreferencesToDocument(values: PreferenceValues, query: MediaQueryList): void {
  const resolved = values.theme === 'system' ? (query.matches ? 'dark' : 'light') : values.theme;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = values.theme;
  root.dataset.density = values.density;
  root.style.colorScheme = resolved;
}

export function startPreferenceSync(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => syncPreferencesToDocument(preferencesStore.getState(), query);
  sync();
  const unsubscribe = preferencesStore.subscribe(sync);
  query.addEventListener('change', sync);
  return () => { unsubscribe(); query.removeEventListener('change', sync); };
}
```

- [ ] **Step 4: Create the complete foundation token styles**

Create `src/renderer-react/styles/fonts.css` with four bundled faces:

```css
@font-face { font-family: "Maple Mono NF CN"; src: url("../../../fonts/MapleMono-NF-CN-Regular.ttf") format("truetype"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Maple Mono NF CN"; src: url("../../../fonts/MapleMono-NF-CN-Medium.ttf") format("truetype"); font-weight: 500; font-display: swap; }
@font-face { font-family: "Maple Mono NF CN"; src: url("../../../fonts/MapleMono-NF-CN-SemiBold.ttf") format("truetype"); font-weight: 600; font-display: swap; }
@font-face { font-family: "Maple Mono NF CN"; src: url("../../../fonts/MapleMono-NF-CN-Bold.ttf") format("truetype"); font-weight: 700; font-display: swap; }
```

Create `src/renderer-react/styles/tokens.css`:

```css
:root {
  --font-ui: "Maple Mono NF CN", "Segoe UI", "Microsoft YaHei", sans-serif;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px; --sp-6: 24px;
  --fs-xs: 10px; --fs-sm: 11px; --fs-md: 13px; --fs-lg: 16px; --fs-xl: 19px;
  --fw-normal: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px;
  --header-height: 52px;
  --motion-fast: 120ms cubic-bezier(.2, .8, .2, 1);
  --motion-normal: 170ms cubic-bezier(.2, .8, .2, 1);
}
```

Create `src/renderer-react/styles/themes.css`:

```css
:root[data-theme="light"] {
  --surface-base: #f4f4f6; --surface-panel: rgba(250, 250, 251, .88);
  --surface-work: #ffffff; --surface-raised: #ffffff; --surface-hover: #ededf0;
  --surface-selected: #e5e5e9; --text-primary: #18181b; --text-secondary: #5b5b63;
  --text-muted: #8a8a93; --border-subtle: rgba(24, 24, 27, .10);
  --border-strong: rgba(24, 24, 27, .20); --focus: #2563eb; --danger: #c93434;
  --success: #167a50; --shadow-float: 0 12px 32px rgba(24, 24, 27, .14);
}

:root[data-theme="dark"] {
  --surface-base: #171719; --surface-panel: rgba(30, 30, 33, .88);
  --surface-work: #1c1c1f; --surface-raised: #26262a; --surface-hover: #2b2b2f;
  --surface-selected: #333338; --text-primary: #f0f0f2; --text-secondary: #aaaab2;
  --text-muted: #74747d; --border-subtle: rgba(255, 255, 255, .09);
  --border-strong: rgba(255, 255, 255, .17); --focus: #6ea8fe; --danger: #ff6b6b;
  --success: #50c99a; --shadow-float: 0 16px 40px rgba(0, 0, 0, .36);
}
```

Create `src/renderer-react/styles/density.css`:

```css
:root[data-density="compact"] { --control-height: 32px; --row-height: 32px; --panel-padding: 12px; --content-gap: 12px; }
:root[data-density="comfortable"] { --control-height: 36px; --row-height: 36px; --panel-padding: 16px; --content-gap: 16px; }
```

Create `src/renderer-react/styles/global.css`:

```css
* { box-sizing: border-box; }
html, body, #root { width: 100%; height: 100%; margin: 0; }
body { overflow: hidden; color: var(--text-primary); background: var(--surface-base); font-family: var(--font-ui); font-size: var(--fs-md); letter-spacing: 0; }
button, input, select, textarea { color: inherit; font: inherit; letter-spacing: 0; }
button { border: 0; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
::selection { background: color-mix(in srgb, var(--focus) 28%, transparent); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border: 3px solid transparent; background-clip: padding-box; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; } }
```

- [ ] **Step 5: Activate preference synchronization and styles**

Replace `main.tsx` with:

```tsx
import { createRoot } from 'react-dom/client';
import { startPreferenceSync } from './preferences/preferences';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/density.css';
import './styles/global.css';

const stopPreferenceSync = startPreferenceSync();
window.addEventListener('beforeunload', stopPreferenceSync, { once: true });
const root = document.getElementById('root');
if (!root) throw new Error('React root element is missing');
createRoot(root).render(<main aria-label="CHILLAST React renderer">React renderer bootstrap</main>);
```

- [ ] **Step 6: Run tests, typecheck, and build**

Run:

```powershell
npm run test:renderer -- src/renderer-react/preferences/preferences.test.ts
npx tsc -p tsconfig.renderer.json
npm run build:renderer
```

Expected: preference tests pass, typecheck exits 0, and Vite copies all Maple font assets into the build.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer-react/preferences src/renderer-react/styles src/renderer-react/main.tsx
git commit -m "feat(ui): add light dark themes and density"
```

---

### Task 5: Build the Responsive Resizable Panel Layout

**Files:**
- Create: `src/renderer-react/shell/useNarrowLayout.ts`
- Create: `src/renderer-react/shell/PanelLayout.tsx`
- Create: `src/renderer-react/shell/PanelLayout.test.tsx`
- Create: `src/renderer-react/styles/shell.css`

- [ ] **Step 1: Add a controllable matchMedia mock to test setup**

Append to `src/renderer-react/test/setup.ts`:

```ts
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
let mediaMatches = false;

vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
  media: query,
  get matches() { return mediaMatches; },
  onchange: null,
  addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
  removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
  dispatchEvent: () => true,
})));

export function setMediaMatches(matches: boolean) {
  mediaMatches = matches;
  const event = { matches } as MediaQueryListEvent;
  mediaListeners.forEach((listener) => listener(event));
}
```

- [ ] **Step 2: Write failing desktop and narrow-layout tests**

Create `src/renderer-react/shell/PanelLayout.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setMediaMatches } from '../test/setup';
import { PanelLayout } from './PanelLayout';

describe('PanelLayout', () => {
  beforeEach(() => act(() => setMediaMatches(false)));

  it('shows navigation, workspace, and AI together on desktop', () => {
    render(<PanelLayout navigation="Navigation" ai="AI">Workspace</PanelLayout>);
    expect(screen.getByRole('navigation')).toBeVisible();
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('complementary')).toBeVisible();
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('uses an explicit AI overlay at narrow width', async () => {
    act(() => setMediaMatches(true));
    render(<PanelLayout navigation="Navigation" ai="AI">Workspace</PanelLayout>);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '打开 AI 助手' }));
    expect(screen.getByRole('complementary')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '关闭 AI 助手' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:renderer -- src/renderer-react/shell/PanelLayout.test.tsx`

Expected: FAIL because `PanelLayout` does not exist.

- [ ] **Step 4: Implement the responsive hook and layout**

Create `src/renderer-react/shell/useNarrowLayout.ts`:

```ts
import { useEffect, useState } from 'react';

export function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 1199px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width: 1199px)');
    const update = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}
```

Create `src/renderer-react/shell/PanelLayout.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { Bot, X } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useNarrowLayout } from './useNarrowLayout';

export function PanelLayout({ navigation, ai, children }: {
  navigation: ReactNode; ai: ReactNode; children: ReactNode;
}) {
  const narrow = useNarrowLayout();
  const [aiOpen, setAiOpen] = useState(false);

  if (narrow) {
    return <div className="shell shell--narrow">
      <nav className="shell-nav shell-nav--rail" aria-label="主导航">{navigation}</nav>
      <main className="shell-main">{children}</main>
      <button className="icon-button ai-open" aria-label="打开 AI 助手" onClick={() => setAiOpen(true)}><Bot size={17} /></button>
      {aiOpen && <div className="ai-scrim" onMouseDown={() => setAiOpen(false)}>
        <aside className="ai-overlay" aria-label="AI 助手" onMouseDown={(event) => event.stopPropagation()}>
          <button className="icon-button ai-close" aria-label="关闭 AI 助手" onClick={() => setAiOpen(false)}><X size={17} /></button>
          {ai}
        </aside>
      </div>}
    </div>;
  }

  return <PanelGroup className="shell" direction="horizontal" autoSaveId="chillast.shell.desktop">
    <Panel defaultSize={16} minSize={12} maxSize={22} collapsible collapsedSize={5}>
      <nav className="shell-nav" aria-label="主导航">{navigation}</nav>
    </Panel>
    <PanelResizeHandle className="resize-handle" aria-label="调整导航栏宽度" />
    <Panel minSize={42}><main className="shell-main">{children}</main></Panel>
    <PanelResizeHandle className="resize-handle" aria-label="调整 AI 栏宽度" />
    <Panel defaultSize={27} minSize={22} maxSize={40} collapsible collapsedSize={0}>
      <aside className="shell-ai" aria-label="AI 助手">{ai}</aside>
    </Panel>
  </PanelGroup>;
}
```

- [ ] **Step 5: Add stable shell geometry**

Create `src/renderer-react/styles/shell.css`:

```css
.shell { width: 100%; height: 100%; background: var(--surface-base); }
.shell-nav, .shell-ai { height: 100%; overflow: hidden; background: var(--surface-panel); backdrop-filter: blur(18px); }
.shell-nav { border-right: 1px solid var(--border-subtle); }
.shell-ai { border-left: 1px solid var(--border-subtle); }
.shell-main { min-width: 0; height: 100%; overflow: hidden; background: var(--surface-work); }
.resize-handle { position: relative; width: 1px; background: var(--border-subtle); transition: background var(--motion-fast); }
.resize-handle::after { content: ""; position: absolute; inset: 0 -4px; }
.resize-handle[data-resize-handle-active] { background: var(--focus); }
.icon-button { width: var(--control-height); height: var(--control-height); display: grid; place-items: center; padding: 0; border-radius: var(--radius-sm); color: var(--text-secondary); background: transparent; cursor: pointer; }
.icon-button:hover { color: var(--text-primary); background: var(--surface-hover); }
.shell--narrow { display: grid; grid-template-columns: 56px minmax(0, 1fr); }
.shell-nav--rail { grid-column: 1; }
.shell--narrow .shell-main { grid-column: 2; }
.ai-open { position: fixed; z-index: 20; top: 10px; right: 12px; }
.ai-scrim { position: fixed; z-index: 40; inset: 0; display: flex; justify-content: flex-end; background: rgba(0, 0, 0, .26); }
.ai-overlay { position: relative; width: min(420px, calc(100vw - 72px)); height: 100%; padding-top: 48px; background: var(--surface-panel); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-float); backdrop-filter: blur(18px); }
.ai-close { position: absolute; top: 10px; right: 12px; }
```

Import `./styles/shell.css` from `main.tsx`.

- [ ] **Step 6: Run focused and full renderer tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/shell/PanelLayout.test.tsx
npm run test:renderer
```

Expected: all renderer tests pass with no act warnings.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer-react/shell src/renderer-react/styles/shell.css src/renderer-react/test/setup.ts src/renderer-react/main.tsx
git commit -m "feat(ui): add responsive resizable shell layout"
```

---

### Task 6: Add Localized Navigation, Appearance Controls, and AI Status

**Files:**
- Create: `src/renderer-react/shell/routes.ts`
- Create: `src/renderer-react/shell/Navigation.tsx`
- Create: `src/renderer-react/shell/AiStatusPanel.tsx`
- Create: `src/renderer-react/shell/AppShell.tsx`
- Create: `src/renderer-react/shell/AppShell.test.tsx`
- Modify: `src/renderer-react/styles/shell.css`
- Modify: `locale/zh.json`

- [ ] **Step 1: Write failing shell behavior tests**

Create `src/renderer-react/shell/AppShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { AppShell } from './AppShell';

const messages = {
  app: { title: 'CHILLAST' },
  nav: { groupProfiles: '档案', groupCharts: '星盘', groupChinese: '命理', groupTools: '工具', profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析', solarTerms: '节气年历', settings: '设置' },
  profiles: { title: '档案管理' }, chart: { personalTitle: '个人星盘', relationshipTitle: '合盘分析' },
  chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' }, settings: { title: '设置' },
  shell: { placeholder: '{{title}}将在后续迁移阶段启用', theme: '主题', density: '密度', aiConfigured: 'AI 已配置', aiNotConfigured: 'AI 未配置' },
  appearance: { system: '跟随系统', light: '亮色', dark: '深色', compact: '紧凑', comfortable: '均衡' },
};

describe('AppShell', () => {
  beforeEach(() => {
    window.mystApi = {
      getConfig: vi.fn(), getLocale: vi.fn(),
      ai: { status: vi.fn().mockResolvedValue({ ok: true, data: { configured: true, provider: 'openai', model: 'gpt-4o', baseUrl: '', knowledgeDocCount: 2 } }), initStatus: vi.fn(), onStatusChanged: vi.fn(), onInitProgress: vi.fn() },
    };
  });

  it('renders six routes and navigates without a URL router', async () => {
    render(<I18nProvider messages={messages}><AppShell /></I18nProvider>);
    expect(screen.getAllByRole('button', { name: /档案管理|个人星盘|合盘分析|命理分析|节气年历|设置/ })).toHaveLength(6);
    await userEvent.click(screen.getByRole('button', { name: '个人星盘' }));
    expect(screen.getByRole('heading', { name: '个人星盘' })).toBeInTheDocument();
  });

  it('loads AI status and labels it as configured, not connected', async () => {
    render(<I18nProvider messages={messages}><AppShell /></I18nProvider>);
    expect(await screen.findByText('AI 已配置')).toBeInTheDocument();
    expect(screen.queryByText('已连接')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:renderer -- src/renderer-react/shell/AppShell.test.tsx`

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Define stable route metadata**

Create `src/renderer-react/shell/routes.ts`:

```ts
import { CalendarDays, ChartNoAxesCombined, CircleUserRound, Orbit, Settings, UsersRound, type LucideIcon } from 'lucide-react';

export type RouteKey = 'profiles' | 'personal' | 'relationship' | 'chinese' | 'solarTerms' | 'settings';
export type Route = { key: RouteKey; labelKey: string; titleKey: string; groupKey: string; icon: LucideIcon };

export const routes: Route[] = [
  { key: 'profiles', labelKey: 'nav.profiles', titleKey: 'profiles.title', groupKey: 'nav.groupProfiles', icon: CircleUserRound },
  { key: 'personal', labelKey: 'nav.personal', titleKey: 'chart.personalTitle', groupKey: 'nav.groupCharts', icon: Orbit },
  { key: 'relationship', labelKey: 'nav.relationship', titleKey: 'chart.relationshipTitle', groupKey: 'nav.groupCharts', icon: UsersRound },
  { key: 'chinese', labelKey: 'nav.chinese', titleKey: 'chinese.title', groupKey: 'nav.groupChinese', icon: ChartNoAxesCombined },
  { key: 'solarTerms', labelKey: 'nav.solarTerms', titleKey: 'tools.solarTermTitle', groupKey: 'nav.groupTools', icon: CalendarDays },
  { key: 'settings', labelKey: 'nav.settings', titleKey: 'settings.title', groupKey: 'nav.groupTools', icon: Settings },
];
```

- [ ] **Step 4: Implement navigation and the AI status panel**

Create `src/renderer-react/shell/Navigation.tsx`:

```tsx
import type { RouteKey } from './routes';
import { routes } from './routes';
import { useI18n } from '../i18n/I18nProvider';

export function Navigation({ active, onNavigate }: { active: RouteKey; onNavigate: (route: RouteKey) => void }) {
  const { t } = useI18n();
  let group = '';
  return <div className="navigation-inner">
    <div className="brand-mark" aria-label="CHILLAST">✶</div>
    {routes.map((route) => {
      const showGroup = group !== route.groupKey;
      group = route.groupKey;
      const Icon = route.icon;
      return <div className="nav-entry" key={route.key}>
        {showGroup && <div className="nav-group">{t(route.groupKey)}</div>}
        <button className="nav-button" data-active={active === route.key} aria-current={active === route.key ? 'page' : undefined} onClick={() => onNavigate(route.key)} title={t(route.labelKey)}>
          <Icon size={17} aria-hidden="true" /><span>{t(route.labelKey)}</span>
        </button>
      </div>;
    })}
  </div>;
}
```

Create `src/renderer-react/shell/AiStatusPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { apiClient } from '../api/client';
import type { AiStatus } from '../api/contracts';
import { useI18n } from '../i18n/I18nProvider';

export function AiStatusPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiClient.getAiStatus().then((value) => { if (active) setStatus(value); }).catch((reason: Error) => { if (active) setError(reason.message); });
    // Preload status listeners are application-lifetime and currently have no unsubscribe contract.
    window.mystApi.ai.onStatusChanged(setStatus);
    return () => { active = false; };
  }, []);
  return <div className="ai-status-panel">
    <header><Bot size={17} /><strong>{t('ai.title')}</strong></header>
    {error && <p role="alert">{error}</p>}
    {!error && !status && <p>{t('shell.loading')}</p>}
    {status && <><p>{t(status.configured ? 'shell.aiConfigured' : 'shell.aiNotConfigured')}</p><p className="muted">{status.provider || '—'} · {status.model || '—'}</p></>}
  </div>;
}
```

- [ ] **Step 5: Compose the shell and appearance controls**

Create `src/renderer-react/shell/AppShell.tsx`:

```tsx
import { useState } from 'react';
import { PanelLayout } from './PanelLayout';
import { Navigation } from './Navigation';
import { AiStatusPanel } from './AiStatusPanel';
import { routes, type RouteKey } from './routes';
import { useI18n } from '../i18n/I18nProvider';
import { usePreferences, type DensityPreference, type ThemePreference } from '../preferences/preferences';

export function AppShell() {
  const { t } = useI18n();
  const [active, setActive] = useState<RouteKey>('profiles');
  const route = routes.find((item) => item.key === active) ?? routes[0];
  const theme = usePreferences((state) => state.theme);
  const density = usePreferences((state) => state.density);
  const setTheme = usePreferences((state) => state.setTheme);
  const setDensity = usePreferences((state) => state.setDensity);
  const title = t(route.titleKey);
  const PageIcon = route.icon;

  return <PanelLayout navigation={<Navigation active={active} onNavigate={setActive} />} ai={<AiStatusPanel />}>
    <div className="workspace-page">
      <header className="workspace-header">
        <h1>{title}</h1>
        <div className="appearance-controls">
          <label>{t('shell.theme')}<select value={theme} onChange={(event) => setTheme(event.target.value as ThemePreference)}>
            <option value="system">{t('appearance.system')}</option><option value="light">{t('appearance.light')}</option><option value="dark">{t('appearance.dark')}</option>
          </select></label>
          <label>{t('shell.density')}<select value={density} onChange={(event) => setDensity(event.target.value as DensityPreference)}>
            <option value="compact">{t('appearance.compact')}</option><option value="comfortable">{t('appearance.comfortable')}</option>
          </select></label>
        </div>
      </header>
      <section className="placeholder-page"><PageIcon size={24} /><p>{t('shell.placeholder', { title })}</p></section>
    </div>
  </PanelLayout>;
}
```

- [ ] **Step 6: Add exact locale keys**

Add these top-level objects to `locale/zh.json`, preserving valid JSON:

```json
"shell": {
  "loading": "正在读取状态…",
  "placeholder": "{{title}}将在后续迁移阶段启用",
  "theme": "主题",
  "density": "密度",
  "aiConfigured": "AI 已配置",
  "aiNotConfigured": "AI 未配置",
  "openAi": "打开 AI 助手",
  "closeAi": "关闭 AI 助手",
  "resizeNavigation": "调整导航栏宽度",
  "resizeAi": "调整 AI 栏宽度"
},
"appearance": {
  "system": "跟随系统",
  "light": "亮色",
  "dark": "深色",
  "compact": "紧凑",
  "comfortable": "均衡"
}
```

Change `nav.settings` from `AI 设置` to `设置`; the existing page title may
remain `AI 设置` until the settings migration.

- [ ] **Step 7: Finish shell styling**

Append to `styles/shell.css`:

```css
.navigation-inner { height: 100%; padding: 10px 8px; overflow-y: auto; }
.brand-mark { width: 34px; height: 34px; display: grid; place-items: center; margin: 0 4px 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); font-size: 18px; }
.nav-entry { display: contents; }
.nav-group { padding: 14px 8px 5px; color: var(--text-muted); font-size: var(--fs-xs); text-transform: uppercase; }
.nav-button { width: 100%; height: var(--control-height); display: flex; align-items: center; gap: 9px; padding: 0 9px; border-radius: var(--radius-sm); color: var(--text-secondary); background: transparent; cursor: pointer; text-align: left; }
.nav-button:hover { color: var(--text-primary); background: var(--surface-hover); }
.nav-button[data-active="true"] { color: var(--text-primary); background: var(--surface-selected); }
.shell-nav--rail .nav-group, .shell-nav--rail .nav-button span { display: none; }
.shell-nav--rail .nav-button { justify-content: center; padding: 0; }
.workspace-page { display: flex; flex-direction: column; height: 100%; min-width: 0; }
.workspace-header { min-height: var(--header-height); display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px var(--panel-padding); border-bottom: 1px solid var(--border-subtle); }
.workspace-header h1 { margin: 0; font-size: var(--fs-lg); }
.appearance-controls { display: flex; gap: 8px; }
.appearance-controls label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: var(--fs-sm); }
.appearance-controls select { height: var(--control-height); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-primary); background: var(--surface-raised); }
.placeholder-page { flex: 1; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--text-muted); }
.ai-status-panel { height: 100%; padding: var(--panel-padding); }
.ai-status-panel header { height: 32px; display: flex; align-items: center; gap: 8px; }
.ai-status-panel p { margin: 8px 0; }
.muted { color: var(--text-muted); }
```

- [ ] **Step 8: Run shell tests and commit**

Run:

```powershell
npm run test:renderer -- src/renderer-react/shell/AppShell.test.tsx
npx tsc -p tsconfig.renderer.json
```

Expected: shell tests pass and TypeScript exits 0.

Then commit:

```powershell
git add src/renderer-react/shell src/renderer-react/styles/shell.css locale/zh.json
git commit -m "feat(ui): add localized React application shell"
```

---

### Task 7: Bootstrap Config and Locale, Then Smoke-Test Electron

**Files:**
- Create: `src/renderer-react/app/AppProviders.tsx`
- Create: `src/renderer-react/app/App.tsx`
- Create: `src/renderer-react/app/App.test.tsx`
- Modify: `src/renderer-react/main.tsx`
- Create: `tests/SmokeReactRenderer.js`

- [ ] **Step 1: Write failing bootstrap tests**

Create `src/renderer-react/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppProviders } from './AppProviders';

const locale = {
  app: { title: 'CHILLAST' }, nav: { groupProfiles: '档案', groupCharts: '星盘', groupChinese: '命理', groupTools: '工具', profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析', solarTerms: '节气年历', settings: '设置' },
  profiles: { title: '档案管理' }, chart: { personalTitle: '个人星盘', relationshipTitle: '合盘分析' }, chinese: { title: '命理分析' }, tools: { solarTermTitle: '节气年历' }, settings: { title: '设置' },
  shell: { loading: '正在校准星图…', startupError: '应用启动失败：{{message}}', placeholder: '{{title}}将在后续迁移阶段启用', theme: '主题', density: '密度', aiConfigured: 'AI 已配置', aiNotConfigured: 'AI 未配置' }, appearance: { system: '跟随系统', light: '亮色', dark: '深色', compact: '紧凑', comfortable: '均衡' }, ai: { title: 'AI 占星顾问' },
};

describe('App', () => {
  beforeEach(() => {
    window.mystApi = {
      getConfig: vi.fn().mockResolvedValue({ ok: true, data: { layout: { headerHeight: 58 } } }),
      getLocale: vi.fn().mockResolvedValue({ ok: true, data: locale }),
      ai: { status: vi.fn().mockResolvedValue({ ok: true, data: { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 } }), initStatus: vi.fn(), onStatusChanged: vi.fn(), onInitProgress: vi.fn() },
    };
  });

  it('loads config and locale before rendering the shell', async () => {
    render(<AppProviders><App /></AppProviders>);
    expect(screen.getByText('正在校准星图…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '档案管理' })).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('58px');
  });

  it('keeps a retryable startup error on screen', async () => {
    vi.mocked(window.mystApi.getConfig).mockResolvedValue({ ok: false, error: '配置损坏' });
    render(<AppProviders><App /></AppProviders>);
    expect(await screen.findByRole('alert')).toHaveTextContent('应用启动失败：配置损坏');
  });
});
```

Use the existing `app.bootText` and `app.bootError` locale strings in the
implementation, so the expected loading and error text are `正在校准星图…` and
`应用启动失败：配置损坏`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:renderer -- src/renderer-react/app/App.test.tsx`

Expected: FAIL because `App` and `AppProviders` do not exist.

- [ ] **Step 3: Implement providers and application bootstrap**

Create `src/renderer-react/app/AppProviders.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

Create `src/renderer-react/app/App.tsx`:

```tsx
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { applyRuntimeConfig } from '../config/applyRuntimeConfig';
import { I18nProvider } from '../i18n/I18nProvider';
import { AppShell } from '../shell/AppShell';

export function App() {
  const config = useQuery({ queryKey: ['config'], queryFn: apiClient.getConfig });
  const locale = useQuery({ queryKey: ['locale'], queryFn: apiClient.getLocale });
  useEffect(() => { if (config.data) applyRuntimeConfig(config.data); }, [config.data]);

  if (config.error || locale.error) {
    const message = (config.error ?? locale.error) as Error;
    return <main className="startup-state" role="alert">应用启动失败：{message.message}</main>;
  }
  if (!config.data || !locale.data) return <main className="startup-state">正在校准星图…</main>;
  return <I18nProvider messages={locale.data}><AppShell /></I18nProvider>;
}
```

Replace the render call in `main.tsx`:

```tsx
import { App } from './app/App';
import { AppProviders } from './app/AppProviders';

createRoot(root).render(<AppProviders><App /></AppProviders>);
```

- [ ] **Step 4: Run bootstrap and all renderer tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/app/App.test.tsx
npm run test:renderer
npx tsc -p tsconfig.renderer.json
```

Expected: every renderer test passes and TypeScript exits 0.

- [ ] **Step 5: Create the React Electron smoke test**

Create `tests/SmokeReactRenderer.js`:

```js
'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const errors = [];
const ok = (data) => ({ ok: true, data });

function fail(message) {
  console.error(`\nReact smoke failed: ${message}\n`);
  app.exit(1);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  ipcMain.handle('config:get', () => ok({ layout: { sidebarWidth: 228, headerHeight: 52 } }));
  ipcMain.handle('locale:get', () => ok(require('../locale/zh.json')));
  ipcMain.handle('ai:status', () => ok({ configured: true, provider: 'openai', model: 'gpt-4o', baseUrl: '', knowledgeDocCount: 0 }));
  ipcMain.handle('ai:initStatus', () => ok(null));

  const win = new BrowserWindow({
    show: false, width: 1440, height: 920,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'Preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  win.webContents.on('preload-error', (_event, file, error) => errors.push(`${file}: ${error}`));

  try {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'renderer-react', 'index.html'));
    await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('shell timeout')), 5000);
      const poll = () => document.querySelector('[aria-label="主导航"]')
        ? (clearTimeout(timeout), resolve()) : requestAnimationFrame(poll);
      poll();
    })`);
    const report = await win.webContents.executeJavaScript(`({
      hasApi: !!window.mystApi,
      navItems: document.querySelectorAll('.nav-button').length,
      hasWorkspace: !!document.querySelector('main.shell-main'),
      hasAi: !!document.querySelector('aside.shell-ai'),
      theme: document.documentElement.dataset.theme,
      density: document.documentElement.dataset.density,
      title: (document.querySelector('h1') || {}).textContent || ''
    })`);
    const problems = [];
    if (!report.hasApi) problems.push('window.mystApi missing');
    if (report.navItems !== 6) problems.push(`expected 6 routes, got ${report.navItems}`);
    if (!report.hasWorkspace || !report.hasAi) problems.push('three-column shell incomplete');
    if (!['light', 'dark'].includes(report.theme)) problems.push(`invalid theme ${report.theme}`);
    if (report.density !== 'compact') problems.push(`invalid density ${report.density}`);
    if (report.title !== '档案管理') problems.push(`unexpected route title ${report.title}`);
    if (errors.length) problems.push(errors.join(' | '));
    if (problems.length) fail(problems.join('; '));
    else { console.log('React smoke passed', report); app.exit(0); }
  } catch (error) { fail(error.stack || String(error)); }
});

setTimeout(() => fail('timed out'), 30000);
```

- [ ] **Step 6: Run full phase verification**

Run:

```powershell
npm run test:loader
npm run test:renderer
npx tsc -p tsconfig.renderer.json
npm run build:renderer
npm test
npm run smoke
npm run smoke:react
```

Expected:

- Loader: 4 passing tests.
- Renderer: all Vitest files pass with 0 failures.
- TypeScript: exit code 0.
- Vite: production build succeeds with relative assets.
- Existing Node suite: 0 failures.
- Legacy smoke: `SMOKE PASSED`.
- React smoke: `React smoke passed` with 6 routes, a resolved theme, compact density, and complete desktop shell.

- [ ] **Step 7: Inspect packaged file inclusion**

Run:

```powershell
npm run dist
```

Expected: packaging exits 0 and `release/win-unpacked/resources/app.asar` is produced.
Inspect the archive with:

```powershell
npx asar list "release/win-unpacked/resources/app.asar" | rg "dist\\renderer-react\\index.html|src\\renderer\\Index.html"
```

Expected: output contains both `dist/renderer-react/index.html` and
`src/renderer/Index.html` (path separators may be displayed as backslashes).

- [ ] **Step 8: Commit**

```powershell
git add src/renderer-react/app src/renderer-react/main.tsx tests/SmokeReactRenderer.js
git commit -m "test(ui): verify React shell in Electron"
```

---

## Phase Completion Criteria

- `npm start` still opens the unchanged legacy renderer.
- `npm run start:react` opens the built React shell.
- `npm run dev:react` opens the Vite renderer and rejects non-local renderer URLs.
- The React shell uses the preload bridge with no direct Node access.
- Light/dark/system preference and compact/comfortable density persist and update the root document.
- At `1440x920`, navigation, workspace, and AI are visible with draggable separators.
- At `1100x720`, navigation is a rail and AI opens as a controlled overlay.
- All six routes are localized and represented by stable placeholder pages.
- AI status is described as configured/not configured, not as connected/disconnected.
- Legacy tests and smoke checks continue to pass alongside the new React tests.
- Packaged output includes both renderers for subsequent migration phases.
