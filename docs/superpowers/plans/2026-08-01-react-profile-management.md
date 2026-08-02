# React Profile Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the React profile directory, read pane, and editor with backward-compatible tags, shared primary/recent/chart-intent state, derived location metadata, and complete unsaved-change protection.

**Architecture:** The CommonJS `Profile` aggregate remains the persisted schema authority and gains normalized tags without changing existing IPC method names or stored birth data. React uses a typed preload client and TanStack Query for server state, a persisted Zustand workspace store for primary/recent/chart intent, feature-local form drafts, and one shell-level dirty-transition coordinator that also answers a narrow Electron close handshake.

**Tech Stack:** Electron 42, CommonJS Node domain and IPC code, React 19, TypeScript, TanStack Query 5, Zustand 5, Luxon, tz-lookup, Vitest, React Testing Library, Node test runner, Lucide React, CSS custom properties

**Design spec:** `docs/superpowers/specs/2026-08-01-react-workbench-redesign-design.md`

---

## Delivery Boundary

This plan delivers profile management and the shared navigation intent consumed by later chart pages. It does not implement chart calculation pages, folders, profile grouping, bulk selection, bulk editing, cloud synchronization, or replacement of the legacy renderer. Natal, transit, and relationship commands only publish a typed intent and navigate to the existing route fallback.

The existing renderer remains usable. Existing `profiles:list`, `profiles:get`, `profiles:save`, `profiles:remove`, `cities:search`, and `chinese:searchCities` behavior remains compatible. The only new request channel is `locations:resolve`; the only new lifecycle channel pair is the React-only close request/decision handshake.

## Design Decisions

- Normalize tags to Unicode NFC in the domain model, accept only strings, trim and remove empty values, limit each tag to 32 Unicode code points and each profile to 20 tags, and deduplicate with Unicode 17.0.0 full default case-fold keys while retaining the first spelling. Generate the CommonJS folding table reproducibly from the tracked official `CaseFolding.txt` statuses C+F, excluding simple and Turkic mappings, and verify exact bytes offline. Package the complete Unicode License V3 notice with the application. Missing or malformed legacy `tags` becomes a frozen `[]`.
- Do not persist primary profile, recents, timezone, or UTC offset. Primary and recents use `localStorage`; timezone and offset are derived for the entered local birth moment.
- Keep at most 50 recent profile uses and prune entries older than 90 days. The directory exposes 7-day and 30-day filters from that bounded map.
- Resolve the primary profile to the persisted ID when it still exists, otherwise the first profile in the current sorted server response, otherwise `null`.
- A relationship chart intent identifies the selected row as `primaryProfileId`; choosing the second profile belongs to the later relationship workbench.
- Refetch profile queries after every successful save, duplicate, or delete. `ProfileRepository.save()` currently refreshes `updatedAt` on disk but returns the pre-refresh object, so no React mutation writes the response directly into cache.
- Keep draft data inside `ProfilePage`/`ProfileForm`. The Zustand store contains only cross-route workspace state.
- The native close handshake is enabled only for the React renderer target. Legacy windows retain their current immediate close behavior.

## File Map

### Domain and Electron boundary

- Modify `src/core/models/Profile.js`: normalize and serialize `tags` while accepting records that omit it.
- Create `src/core/util/UnicodeCaseFold.js`: apply full default Unicode folding to normalized tag keys.
- Create `src/core/util/UnicodeCaseFoldData.js`: generated Unicode 17.0.0 C+F mapping table.
- Create `vendor/unicode/17.0.0/CaseFolding.txt`: pinned official Unicode source data.
- Create `licenses/UNICODE-LICENSE-3.0.txt`: complete notice packaged with the application.
- Create `tools/generate-unicode-case-folding.mjs`: reproduce the mapping table from tracked Unicode data and provide offline `--check` mode.
- Create `tests/UnicodeCaseFoldGenerator.test.js`: clean/tampered generation, provenance, and license coverage.
- Modify `tests/RunAll.js`: domain compatibility and normalization assertions.
- Create `tests/ProfileRepository.test.js`: round-trip old and tagged profile documents through disk storage.
- Create `tests/RunNodeTests.js`: discover and run root Node test files deterministically.
- Create `tests/NodeTestRunner.test.js`: verify deterministic discovery and child failure propagation.
- Create `src/core/astrology/LocationResolver.js`: derive IANA zone and historical offset with the same `tz-lookup` and Luxon path used by chart casting.
- Create `tests/LocationResolver.test.js`: historical offset and invalid-coordinate coverage.
- Modify `src/main/IpcRouter.js`: register `locations:resolve` and the injected close-decision callback under the existing trusted-frame envelope.
- Modify `tests/IpcRouterSecurity.test.js`: resolver envelope and close-decision sender checks.
- Modify `src/preload/Preload.js`: expose location resolution and narrowly scoped close subscription/decision methods.
- Modify `tests/PreloadSubscriptions.test.js`: channel arguments and listener cleanup coverage.
- Create `src/main/CloseGuard.js`: pure, single-pending-request native close state machine.
- Modify `src/main/Main.js`: inject the resolver, enable a React-only close request/decision state machine, and preserve legacy close behavior.
- Create `tests/MainCloseGuard.test.js`: pure close-state transition coverage for `CloseGuard.js`.

### Typed renderer API and state

- Modify `src/renderer-react/api/contracts.ts`: profile, city, location-resolution, and close-decision types.
- Modify `src/renderer-react/types/myst-api.d.ts`: complete typed preload surface used by profiles and close protection.
- Modify `src/renderer-react/api/client.ts`: typed profile CRUD, merged city search, location resolution, and close lifecycle adapters.
- Modify `src/renderer-react/api/client.test.ts`: bridge forwarding, merged/deduplicated cities, and malformed-envelope coverage.
- Create `src/renderer-react/features/profiles/directory.ts`: pure normalized search, recent filtering, and stable sorting.
- Create `src/renderer-react/features/profiles/directory.test.ts`: bilingual name/location/tag/notes matching, 7/30-day filters, and sort tests.
- Create `src/renderer-react/stores/profileWorkspace.ts`: persisted primary ID, bounded recents, and chart navigation intent.
- Create `src/renderer-react/stores/profileWorkspace.test.ts`: fallback, pruning, bounds, persistence, and intent tests.

### Profile feature

- Create `src/renderer-react/features/profiles/profileQueries.ts`: TanStack Query list/detail hooks and invalidating mutations.
- Create `src/renderer-react/features/profiles/ProfilePage.tsx`: directory/detail/editor composition, selection, duplicate/delete, primary, and chart actions.
- Create `src/renderer-react/features/profiles/ProfilePage.test.tsx`: page-level reads, mutations, confirmation, and chart-intent integration.
- Create `src/renderer-react/features/profiles/ProfileDirectory.tsx`: search/filter/sort controls and scan-friendly profile rows.
- Create `src/renderer-react/features/profiles/ProfileDetail.tsx`: explicit primary marker, metadata, notes/tags, and command buttons.
- Create `src/renderer-react/features/profiles/profileForm.ts`: draft conversion and deterministic validation.
- Create `src/renderer-react/features/profiles/profileForm.test.ts`: conversion and field-error tests.
- Create `src/renderer-react/features/profiles/ProfileForm.tsx`: create/edit form, segmented date/time controls, inline errors, and retryable save state.
- Create `src/renderer-react/features/profiles/ProfileForm.test.tsx`: keyboard entry, validation, location selection/manual coordinates, and failed-save retention.
- Create `src/renderer-react/features/profiles/LocationPicker.tsx`: merged western/Chinese search, manual coordinates, and derived zone/offset display.
- Create `src/renderer-react/features/profiles/LocationPicker.test.tsx`: async search, deduplication rendering, manual resolution, and stale-result clearing.
- Create `src/renderer-react/features/profiles/profiles.css`: responsive directory/detail/editor layout and stable control geometry.

### Shell, locale, and end-to-end verification

- Create `src/renderer-react/shell/DirtyNavigationProvider.tsx`: register the current editor, show save/discard/cancel, and serialize transitions.
- Create `src/renderer-react/shell/DirtyNavigationProvider.test.tsx`: profile switch, navigation, failed save, and native close decisions.
- Modify `src/renderer-react/shell/AppShell.tsx`: render `ProfilePage`, retain route fallbacks, and guard route changes.
- Modify `src/renderer-react/shell/AppShell.test.tsx`: real profile route plus guarded navigation coverage.
- Modify `src/renderer-react/main.tsx`: retain preference cleanup while native close is handled in React composition.
- Modify `src/renderer-react/styles/global.css`: import profile feature styles.
- Modify `locale/zh.json`: directory, read/editor, location, validation, confirmation, and dirty-dialog strings.
- Modify `src/renderer-react/shell/locale.test.ts`: require every new key.
- Modify `tests/SmokeReactRenderer.js`: mock profile/location channels and verify profile CRUD, direct action intent, responsive geometry, and screenshot pixels.
- Modify `package.json`: keep `RunAll.js` and automatically discover root Node test files in the canonical test script.

---

### Task 1: Domain Tags and Backward Compatibility

**Files:**
- Modify: `src/core/models/Profile.js`
- Create: `src/core/util/UnicodeCaseFold.js`
- Create: `src/core/util/UnicodeCaseFoldData.js`
- Create: `vendor/unicode/17.0.0/CaseFolding.txt`
- Create: `licenses/UNICODE-LICENSE-3.0.txt`
- Create: `tools/generate-unicode-case-folding.mjs`
- Create: `tests/UnicodeCaseFoldGenerator.test.js`
- Modify: `tests/RunAll.js`
- Create: `tests/ProfileRepository.test.js`
- Create: `tests/RunNodeTests.js`
- Create: `tests/NodeTestRunner.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add failing domain tests for absent, normalized, and serialized tags**

Add these cases under the `Models` section in `tests/RunAll.js`:

```js
test('legacy profiles without tags deserialize with an empty tag list', () => {
  const profile = Profile.fromJSON(subjectA);
  assert.deepStrictEqual(profile.tags, []);
  assert.deepStrictEqual(profile.toJSON().tags, []);
});

test('profile tags are trimmed and deduplicated case-insensitively', () => {
  const profile = Profile.fromJSON({
    ...subjectA,
    tags: [' Client ', 'client', '', 'VIP', ' vip '],
  });
  assert.deepStrictEqual(profile.tags, ['Client', 'VIP']);
  assert.deepStrictEqual(profile.withUpdates({ notes: 'updated' }).tags, ['Client', 'VIP']);
});

test('malformed persisted tags fall back to an empty tag list', () => {
  assert.deepStrictEqual(Profile.fromJSON({ ...subjectA, tags: 'client' }).tags, []);
  assert.deepStrictEqual(Profile.fromJSON({ ...subjectA, tags: [42, null, 'valid'] }).tags, ['valid']);
  assert.deepStrictEqual(Profile.fromJSON({ ...subjectA, tags: ['x'.repeat(33)] }).tags, []);
});
```

- [ ] **Step 2: Run the domain suite and confirm the compatibility test fails**

Run: `node tests/RunAll.js`

Expected: FAIL in `legacy profiles without tags deserialize with an empty tag list` because `profile.tags` is `undefined`.

- [ ] **Step 3: Implement tag normalization in the aggregate**

Add this function after `GENDERS` in `src/core/models/Profile.js`:

```js
const unicodeDefaultCaseFold = require('../util/UnicodeCaseFold');

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return Object.freeze([]);
  const seen = new Set();
  const normalized = [];
  for (const value of tags) {
    if (typeof value !== 'string') continue;
    const tag = value.normalize('NFC').trim();
    const key = unicodeDefaultCaseFold(tag);
    if (!tag || Array.from(tag).length > 32 || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length === 20) break;
  }
  return Object.freeze(normalized);
}
```

Change the constructor signature and assignment:

```js
constructor({ id, nameZh, nameEn, gender, birthData, notes, tags, createdAt, updatedAt }) {
  this.id = id || Profile.generateId();
  this.nameZh = String(nameZh || '').trim();
  this.nameEn = String(nameEn || '').trim();
  this.gender = GENDERS.includes(gender) ? gender : 'other';
  this.birthData = birthData instanceof BirthData ? birthData : new BirthData(birthData || {});
  this.notes = String(notes || '');
  Object.defineProperty(this, 'tags', {
    value: normalizeTags(tags),
    enumerable: true,
    writable: false,
    configurable: false,
  });
  this.createdAt = createdAt || new Date().toISOString();
  this.updatedAt = updatedAt || this.createdAt;
}
```

Add `tags: this.tags` after `notes` in `toJSON()`, and document `@param {string[]} [params.tags]` in the constructor JSDoc. Do not reject missing tags in `validate()`.

- [ ] **Step 4: Run the domain suite and confirm it passes**

Run: `node tests/RunAll.js`

Expected: PASS with the normalization, code-point limit, and immutable-property cases included in the final pass count.

- [ ] **Step 5: Add a failing repository compatibility test**

Create `tests/ProfileRepository.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ProfileRepository = require('../src/main/ProfileRepository');

const birthData = {
  year: 1990, month: 1, day: 15, hour: 14, minute: 30,
  location: { label: '北京 Beijing', latitude: 39.9042, longitude: 116.4074 },
};

test('repository upgrades legacy records and round-trips normalized tags', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-profiles-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'Profiles.json'), JSON.stringify([
    { id: 'legacy', nameZh: '旧档案', nameEn: '', gender: 'other', birthData, notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]));

  const repository = new ProfileRepository(directory).init();
  assert.deepEqual(repository.get('legacy').tags, []);
  repository.save({ ...repository.get('legacy'), tags: [' Client ', 'client', 'VIP'] });
  assert.deepEqual(repository.get('legacy').tags, ['Client', 'VIP']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'Profiles.json'), 'utf8'))[0].tags, ['Client', 'VIP']);
});
```

- [ ] **Step 6: Register and run the repository test**

Create `tests/RunNodeTests.js` to sort and run every root `tests/*.test.js` file with `child_process.spawnSync`, insert `--` before absolute file paths so option-shaped names stay positional across Node's per-file child processes, and propagate the child exit status. Change the `test` script in `package.json` to:

```json
"test": "node tests/RunAll.js && node tests/RunNodeTests.js"
```

Run: `node tests/RunNodeTests.js`

Expected: PASS for every discovered root Node test. A failing child test must produce a non-zero runner exit status, and temporary directories must be removed.

- [ ] **Step 7: Commit the domain change**

```powershell
git add src/core/models/Profile.js tests/RunAll.js tests/ProfileRepository.test.js tests/RunNodeTests.js tests/NodeTestRunner.test.js package.json
git commit -m "feat: persist normalized profile tags"
```

Expected: one commit containing only domain compatibility changes.

---

### Task 2: Typed Profile, City, and Location IPC Client

**Files:**
- Create: `src/core/astrology/LocationResolver.js`
- Create: `tests/LocationResolver.test.js`
- Modify: `src/main/IpcRouter.js`
- Modify: `tests/IpcRouterSecurity.test.js`
- Modify: `src/main/Main.js`
- Modify: `src/preload/Preload.js`
- Modify: `tests/PreloadSubscriptions.test.js`
- Modify: `src/renderer-react/api/contracts.ts`
- Modify: `src/renderer-react/types/myst-api.d.ts`
- Modify: `src/renderer-react/api/client.ts`
- Modify: `src/renderer-react/api/client.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing location resolver tests**

Create `tests/LocationResolver.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const LocationResolver = require('../src/core/astrology/LocationResolver');

test('resolves historical timezone and offset for a local birth moment', () => {
  const result = new LocationResolver().resolve({
    year: 1990, month: 7, day: 1, hour: 12, minute: 0,
    latitude: 40.7128, longitude: -74.006,
  });
  assert.deepEqual(result, {
    timeZone: 'America/New_York',
    utcOffsetMinutes: -240,
    utcOffsetLabel: 'UTC-04:00',
  });
});

test('rejects invalid coordinates and impossible local dates', () => {
  const resolver = new LocationResolver();
  assert.throws(() => resolver.resolve({ year: 1990, month: 1, day: 1, hour: 0, minute: 0, latitude: 91, longitude: 0 }), /纬度/);
  assert.throws(() => resolver.resolve({ year: 2026, month: 2, day: 30, hour: 0, minute: 0, latitude: 39.9, longitude: 116.4 }), /日期/);
});
```

- [ ] **Step 2: Run the resolver test and confirm the missing module failure**

Run: `node --test tests/LocationResolver.test.js`

Expected: FAIL with `Cannot find module '../src/core/astrology/LocationResolver'`.

- [ ] **Step 3: Implement the shared timezone/Luxon resolver**

Create `src/core/astrology/LocationResolver.js`:

```js
'use strict';

const tzlookup = require('tz-lookup');
const { DateTime } = require('luxon');

class LocationResolver {
  resolve(input) {
    const latitude = Number(input && input.latitude);
    const longitude = Number(input && input.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('纬度必须在 -90 到 90 之间');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('经度必须在 -180 到 180 之间');

    const fields = ['year', 'month', 'day', 'hour', 'minute'];
    const localFields = Object.fromEntries(fields.map((key) => [key, Number(input[key])]));
    const timeZone = tzlookup(latitude, longitude) || 'UTC';
    const local = DateTime.fromObject(localFields, { zone: timeZone });
    if (!local.isValid) throw new Error(`出生日期时间无效：${local.invalidExplanation || local.invalidReason}`);
    const sign = local.offset >= 0 ? '+' : '-';
    const absolute = Math.abs(local.offset);
    const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
    const minutes = String(absolute % 60).padStart(2, '0');
    return { timeZone, utcOffsetMinutes: local.offset, utcOffsetLabel: `UTC${sign}${hours}:${minutes}` };
  }
}

module.exports = LocationResolver;
```

- [ ] **Step 4: Run the resolver test and commit the core unit**

Run: `node --test tests/LocationResolver.test.js`

Expected: PASS with `2` tests.

```powershell
git add src/core/astrology/LocationResolver.js tests/LocationResolver.test.js
git commit -m "feat: resolve historical profile timezone"
```

- [ ] **Step 5: Write failing IPC registration tests**

Append to `tests/IpcRouterSecurity.test.js`:

```js
test('location resolution and close decisions stay behind the trusted main-frame envelope', async () => {
  const handlers = new Map();
  const calls = [];
  const router = new IpcRouter({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    locationResolver: { resolve: (input) => ({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00', input }) },
    closeDecision: (decision) => { calls.push(decision); return true; },
  }).register();
  const mainFrame = {};
  const trusted = { mainFrame };
  router.setWebContents(trusted);
  const event = { sender: trusted, senderFrame: mainFrame };

  const resolved = await handlers.get('locations:resolve')(event, { latitude: 39.9, longitude: 116.4 });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.timeZone, 'Asia/Shanghai');
  assert.deepEqual(await handlers.get('app:closeDecision')(event, 'proceed'), { ok: true, data: true });
  assert.deepEqual(calls, ['proceed']);

  const rejected = await handlers.get('app:closeDecision')({ sender: {}, senderFrame: {} }, 'proceed');
  assert.equal(rejected.ok, false);
  assert.deepEqual(calls, ['proceed']);
});
```

- [ ] **Step 6: Run the IPC test and confirm channels are absent**

Run: `node --test tests/IpcRouterSecurity.test.js`

Expected: FAIL because `handlers.get('locations:resolve')` is not a function.

- [ ] **Step 7: Register injected resolver and close decision handlers**

Extend the `IpcRouter` constructor dependency list and assignments in `src/main/IpcRouter.js`:

```js
constructor({ ipcMain, profileRepository, astrologyService, chineseAstrologyService, config, locale, aiService, aiSessionStore, locationResolver, closeDecision }) {
  this.ipcMain = ipcMain;
  this.profiles = profileRepository;
  this.astrology = astrologyService;
  this.chinese = chineseAstrologyService;
  this.config = config || {};
  this.locale = locale || {};
  this.ai = aiService;
  this.aiSessionStore = aiSessionStore || null;
  this.locationResolver = locationResolver || null;
  this.closeDecision = closeDecision || null;
  this.webContents = null;
}
```

Register after profile handlers:

```js
if (this.locationResolver) {
  this._handle('locations:resolve', (_event, input) => this.locationResolver.resolve(input));
}
if (this.closeDecision) {
  this._handle('app:closeDecision', (_event, decision) => this.closeDecision(decision));
}
```

In `src/main/Main.js`, import `LocationResolver`, construct one in `bootstrapServices()`, and add the final two properties to the existing `new IpcRouter({ ... })` object:

```js
const LocationResolver = require('../core/astrology/LocationResolver');

this.locationResolver = new LocationResolver();
locationResolver: this.locationResolver,
closeDecision: (decision) => this._handleCloseDecision(decision),
```

Task 7 adds `_handleCloseDecision`; until then add this strict no-op method so the composition root is runnable:

```js
_handleCloseDecision(decision) {
  if (decision !== 'proceed' && decision !== 'cancel') throw new Error('无效的关闭决定');
  return false;
}
```

- [ ] **Step 8: Run IPC tests and register Node scripts**

Change `test:security` and `test:preload` in `package.json` to:

```json
"test:security": "node --test tests/RendererLoader.test.js tests/IpcRouterSecurity.test.js tests/MainPolicy.test.js tests/LocationResolver.test.js",
"test:preload": "node --test tests/PreloadSubscriptions.test.js"
```

Run: `npm run test:security`

Expected: PASS, including trusted-frame rejection and both resolver cases.

- [ ] **Step 9: Write failing preload forwarding tests**

In `tests/PreloadSubscriptions.test.js`, change `ipcRenderer.invoke` in `loadPreloadApi()` to record calls and return them:

```js
const invocations = [];
ipcRenderer.invoke = (...args) => {
  invocations.push(args);
  return Promise.resolve({ ok: true, data: null });
};
return { api: exposedApi, ipcRenderer, invocations };
```

Add:

```js
test('preload exposes only the typed profile location and close lifecycle channels', async () => {
  const { api, ipcRenderer, invocations } = loadPreloadApi();
  const received = [];
  const cleanup = api.app.onCloseRequested(() => received.push('close'));
  ipcRenderer.emit('app:closeRequested', {});
  await api.locations.resolve({ latitude: 1, longitude: 2 });
  await api.app.decideClose('cancel');
  assert.deepEqual(received, ['close']);
  assert.deepEqual(invocations, [
    ['locations:resolve', { latitude: 1, longitude: 2 }],
    ['app:closeDecision', 'cancel'],
  ]);
  cleanup();
  assert.equal(ipcRenderer.listenerCount('app:closeRequested'), 0);
});
```

Run: `npm run test:preload`

Expected: FAIL because `api.app` and `api.locations` are undefined.

- [ ] **Step 10: Expose narrow preload methods and rerun the test**

Add to the object exposed in `src/preload/Preload.js`:

```js
locations: {
  resolve: (input) => invoke('locations:resolve', input),
},
app: {
  onCloseRequested: (callback) => subscribe('app:closeRequested', callback),
  decideClose: (decision) => invoke('app:closeDecision', decision),
},
```

Run: `npm run test:preload`

Expected: PASS; cleanup removes only the wrapped close-request listener.

- [ ] **Step 11: Define renderer contracts before adding client methods**

Append to `src/renderer-react/api/contracts.ts`:

```ts
export type Gender = 'male' | 'female' | 'other';

export interface GeoLocation {
  label: string;
  latitude: number;
  longitude: number;
}

export interface BirthData {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  location: GeoLocation;
}

export interface Profile {
  id: string;
  nameZh: string;
  nameEn: string;
  gender: Gender;
  birthData: BirthData;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ProfileSaveInput = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>
  & Partial<Pick<Profile, 'id' | 'createdAt' | 'updatedAt'>>;

export interface CitySearchResult extends GeoLocation {
  key: string;
  nameZh: string;
  nameEn: string;
  region: string;
  country: string;
  source: 'western' | 'chinese';
}

export interface ResolveLocationInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  latitude: number;
  longitude: number;
}

export interface LocationResolution {
  timeZone: string;
  utcOffsetMinutes: number;
  utcOffsetLabel: string;
}

export type CloseDecision = 'proceed' | 'cancel';
```

Replace `MystApi` declarations in `src/renderer-react/types/myst-api.d.ts` with signatures using those exact types:

```ts
interface MystProfilesApi {
  list(): Promise<IpcResult<Profile[]>>;
  get(id: string): Promise<IpcResult<Profile | null>>;
  save(profile: ProfileSaveInput): Promise<IpcResult<Profile>>;
  remove(id: string): Promise<IpcResult<boolean>>;
}

interface MystLocationsApi {
  resolve(input: ResolveLocationInput): Promise<IpcResult<LocationResolution>>;
}

interface MystAppApi {
  onCloseRequested(callback: () => void): () => void;
  decideClose(decision: CloseDecision): Promise<IpcResult<boolean>>;
}

interface MystChineseApi {
  searchCities(query: string): Promise<IpcResult<unknown[]>>;
}

interface MystApi {
  getConfig(): Promise<IpcResult<AppConfig>>;
  getLocale(): Promise<IpcResult<LocaleDictionary>>;
  profiles: MystProfilesApi;
  searchCities(query: string): Promise<IpcResult<unknown[]>>;
  locations: MystLocationsApi;
  app: MystAppApi;
  chinese: MystChineseApi;
  ai: MystAiApi;
}
```

Import the added contract types at the top of the declaration file.

- [ ] **Step 12: Write failing typed-client tests for CRUD and merged cities**

Add this typed fixture in `src/renderer-react/api/client.test.ts`, using the file's existing valid AI status fixture:

```ts
function createApi(overrides: Partial<MystApi> = {}): MystApi {
  const base: MystApi = {
    getConfig: async () => ({ ok: true, data: {} }),
    getLocale: async () => ({ ok: true, data: {} }),
    profiles: {
      list: async () => ({ ok: true, data: [] }),
      get: async () => ({ ok: true, data: null }),
      save: async (profile) => ({ ok: true, data: makeProfile(profile) }),
      remove: async () => ({ ok: true, data: false }),
    },
    searchCities: async () => ({ ok: true, data: [] }),
    locations: { resolve: async () => ({ ok: true, data: { timeZone: 'UTC', utcOffsetMinutes: 0, utcOffsetLabel: 'UTC+00:00' } }) },
    app: { onCloseRequested: () => () => {}, decideClose: async () => ({ ok: true, data: true }) },
    chinese: { searchCities: async () => ({ ok: true, data: [] }) },
    ai: {
      status: async () => ({ ok: true, data: { configured: false, provider: '', model: '', baseUrl: '', knowledgeDocCount: 0 } }),
      initStatus: async () => ({ ok: true, data: null }),
      onStatusChanged: () => () => {},
      onInitProgress: () => () => {},
    },
  };
  return {
    ...base,
    ...overrides,
    profiles: { ...base.profiles, ...overrides.profiles },
    locations: { ...base.locations, ...overrides.locations },
    app: { ...base.app, ...overrides.app },
    chinese: { ...base.chinese, ...overrides.chinese },
    ai: { ...base.ai, ...overrides.ai },
  };
}
```

Then add:

```ts
test('forwards profile CRUD and location resolution through the envelope', async () => {
  const profile = makeProfile({ id: 'p1', tags: ['VIP'] });
  window.mystApi = createApi({
    profiles: {
      list: async () => ({ ok: true, data: [profile] }),
      get: async () => ({ ok: true, data: profile }),
      save: async () => ({ ok: true, data: profile }),
      remove: async () => ({ ok: true, data: true }),
    },
    locations: { resolve: async () => ({ ok: true, data: { timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00' } }) },
  });
  await expect(apiClient.listProfiles()).resolves.toEqual([profile]);
  await expect(apiClient.getProfile('p1')).resolves.toEqual(profile);
  await expect(apiClient.saveProfile(profile)).resolves.toEqual(profile);
  await expect(apiClient.removeProfile('p1')).resolves.toBe(true);
  await expect(apiClient.resolveLocation({ year: 1990, month: 1, day: 1, hour: 0, minute: 0, latitude: 39.9, longitude: 116.4 })).resolves.toMatchObject({ timeZone: 'Asia/Shanghai' });
});

test('merges western and Chinese city results and deduplicates coordinates', async () => {
  window.mystApi = createApi({
    searchCities: async () => ({ ok: true, data: [{ nameZh: '北京', nameEn: 'Beijing', country: 'CN', latitude: 39.9042, longitude: 116.4074 }] }),
    chinese: { searchCities: async () => ({ ok: true, data: [{ nameZh: '北京市', province: '北京', latitude: 39.9042, longitude: 116.4074 }, { nameZh: '密云', province: '北京', latitude: 40.37, longitude: 116.84 }] }) },
  });
  await expect(apiClient.searchCities('北京')).resolves.toEqual([
    expect.objectContaining({ key: '39.9042:116.4074', label: '北京 / Beijing', source: 'western' }),
    expect.objectContaining({ key: '40.3700:116.8400', label: '密云, 北京', source: 'chinese' }),
  ]);
});
```

Run: `npx vitest run src/renderer-react/api/client.test.ts`

Expected: FAIL because the profile, location, and merged city client methods do not exist.

- [ ] **Step 13: Implement typed API methods and city normalization**

Add imports for the new contracts to `src/renderer-react/api/client.ts`, then add these helpers and object methods:

```ts
function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

function normalizeWesternCity(value: unknown): CitySearchResult | null {
  const city = value as Record<string, unknown>;
  const latitude = Number(city?.latitude);
  const longitude = Number(city?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const nameZh = String(city.nameZh || '');
  const nameEn = String(city.nameEn || '');
  return { key: coordinateKey(latitude, longitude), label: [nameZh, nameEn].filter(Boolean).join(' / '), nameZh, nameEn, region: '', country: String(city.country || ''), latitude, longitude, source: 'western' };
}

function normalizeChineseCity(value: unknown): CitySearchResult | null {
  const city = value as Record<string, unknown>;
  const latitude = Number(city?.latitude);
  const longitude = Number(city?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const nameZh = String(city.nameZh || '');
  const region = String(city.province || '');
  return { key: coordinateKey(latitude, longitude), label: [nameZh, region].filter(Boolean).join(', '), nameZh, nameEn: '', region, country: 'CN', latitude, longitude, source: 'chinese' };
}

export const apiClient = {
  getConfig: (): Promise<AppConfig> => invoke((api) => api.getConfig()),
  getLocale: (): Promise<LocaleDictionary> => invoke((api) => api.getLocale()),
  getAiStatus: async (): Promise<AiStatus> => parseAiStatus(await invoke<unknown>((api) => api.ai.status())),
  listProfiles: (): Promise<Profile[]> => invoke((api) => api.profiles.list()),
  getProfile: (id: string): Promise<Profile | null> => invoke((api) => api.profiles.get(id)),
  saveProfile: (profile: ProfileSaveInput): Promise<Profile> => invoke((api) => api.profiles.save(profile)),
  removeProfile: (id: string): Promise<boolean> => invoke((api) => api.profiles.remove(id)),
  resolveLocation: (input: ResolveLocationInput): Promise<LocationResolution> => invoke((api) => api.locations.resolve(input)),
  searchCities: async (query: string): Promise<CitySearchResult[]> => {
    const [western, chinese] = await Promise.all([
      invoke<unknown[]>((api) => api.searchCities(query)),
      invoke<unknown[]>((api) => api.chinese.searchCities(query)),
    ]);
    const merged = [...western.map(normalizeWesternCity), ...chinese.map(normalizeChineseCity)];
    return [...new Map(merged.filter((city): city is CitySearchResult => city !== null).map((city) => [city.key, city])).values()];
  },
  onCloseRequested: (callback: () => void): (() => void) => window.mystApi.app.onCloseRequested(callback),
  decideClose: (decision: CloseDecision): Promise<boolean> => invoke((api) => api.app.decideClose(decision)),
};
```

- [ ] **Step 14: Run boundary tests and commit the IPC/client unit**

Run: `npm run test:security`

Expected: PASS.

Run: `npm run test:preload`

Expected: PASS.

Run: `npx vitest run src/renderer-react/api/client.test.ts`

Expected: PASS with CRUD, resolver, and merged-city assertions.

```powershell
git add src/core/astrology/LocationResolver.js tests/LocationResolver.test.js src/main/IpcRouter.js tests/IpcRouterSecurity.test.js src/main/Main.js src/preload/Preload.js tests/PreloadSubscriptions.test.js src/renderer-react/api/contracts.ts src/renderer-react/types/myst-api.d.ts src/renderer-react/api/client.ts src/renderer-react/api/client.test.ts package.json
git commit -m "feat: add typed profile location bridge"
```

---

### Task 3: Pure Directory Query, Sort, and Recent Selectors

**Files:**
- Create: `src/renderer-react/features/profiles/directory.ts`
- Create: `src/renderer-react/features/profiles/directory.test.ts`

- [ ] **Step 1: Write failing selector tests with fixed time**

Create `src/renderer-react/features/profiles/directory.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import type { Profile } from '../../api/contracts';
import { selectDirectoryProfiles, type DirectoryQuery } from './directory';

const NOW = Date.parse('2026-08-01T12:00:00.000Z');
const makeProfile = (patch: Partial<Profile>): Profile => ({
  id: 'p1', nameZh: '王小明', nameEn: 'Alex Wang', gender: 'other',
  birthData: { year: 1990, month: 1, day: 2, hour: 3, minute: 4, location: { label: '北京 / Beijing', latitude: 39.9, longitude: 116.4 } },
  notes: '长期客户', tags: ['VIP'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', ...patch,
});
const profiles = [
  makeProfile({ id: 'p1' }),
  makeProfile({ id: 'p2', nameZh: '李梅', nameEn: 'May Li', notes: 'Tokyo relocation', tags: ['Research'], birthData: { ...makeProfile({}).birthData, location: { label: '东京 / Tokyo', latitude: 35.68, longitude: 139.69 } }, updatedAt: '2026-06-01T00:00:00.000Z' }),
  makeProfile({ id: 'p3', nameZh: '陈晨', nameEn: 'Chen', notes: '', tags: [], updatedAt: '2026-07-15T00:00:00.000Z' }),
];
const base: DirectoryQuery = { search: '', recent: 'all', sort: 'updated-desc' };
const recents = { p1: NOW - 2 * 86_400_000, p2: NOW - 20 * 86_400_000 };

describe('selectDirectoryProfiles', () => {
  test.each(['alex', '北京', 'vip', '长期', 'Tokyo', 'research'])('searches bilingual names, location, tags, and notes for %s', (search) => {
    expect(selectDirectoryProfiles(profiles, { ...base, search }, recents, NOW).map((profile) => profile.id)).toHaveLength(1);
  });

  test('filters profile use within seven or thirty days', () => {
    expect(selectDirectoryProfiles(profiles, { ...base, recent: '7d' }, recents, NOW).map((profile) => profile.id)).toEqual(['p1']);
    expect(selectDirectoryProfiles(profiles, { ...base, recent: '30d' }, recents, NOW).map((profile) => profile.id)).toEqual(['p1', 'p2']);
  });

  test('sorts by display name, birth date, updated time, and recent use with stable ID ties', () => {
    expect(selectDirectoryProfiles(profiles, { ...base, sort: 'name-asc' }, recents, NOW).map((profile) => profile.id)).toEqual(['p3', 'p2', 'p1']);
    expect(selectDirectoryProfiles(profiles, { ...base, sort: 'updated-desc' }, recents, NOW).map((profile) => profile.id)).toEqual(['p1', 'p3', 'p2']);
    expect(selectDirectoryProfiles(profiles, { ...base, sort: 'recent-desc' }, recents, NOW).map((profile) => profile.id)).toEqual(['p1', 'p2', 'p3']);
  });
});
```

- [ ] **Step 2: Run the selector test and confirm the missing module failure**

Run: `npx vitest run src/renderer-react/features/profiles/directory.test.ts`

Expected: FAIL with `Failed to resolve import "./directory"`.

- [ ] **Step 3: Implement deterministic filtering and sorting**

Create `src/renderer-react/features/profiles/directory.ts`:

```ts
import type { Profile } from '../../api/contracts';

export type RecentFilter = 'all' | '7d' | '30d';
export type ProfileSort = 'updated-desc' | 'name-asc' | 'birth-asc' | 'recent-desc';
export interface DirectoryQuery { search: string; recent: RecentFilter; sort: ProfileSort }
export type ProfileRecents = Record<string, number>;

const DAY_MS = 86_400_000;
const displayName = (profile: Profile) => profile.nameZh || profile.nameEn;
const birthKey = (profile: Profile) => {
  const birth = profile.birthData;
  return birth.year * 100_000_000 + birth.month * 1_000_000 + birth.day * 10_000 + birth.hour * 100 + birth.minute;
};

export function selectDirectoryProfiles(
  profiles: readonly Profile[],
  query: DirectoryQuery,
  recents: ProfileRecents,
  now = Date.now(),
): Profile[] {
  const needle = query.search.trim().toLocaleLowerCase();
  const cutoff = query.recent === '7d' ? now - 7 * DAY_MS : query.recent === '30d' ? now - 30 * DAY_MS : null;
  const selected = profiles.filter((profile) => {
    const searchable = [profile.nameZh, profile.nameEn, profile.birthData.location.label, profile.notes, ...profile.tags].join('\n').toLocaleLowerCase();
    return (!needle || searchable.includes(needle)) && (cutoff === null || (recents[profile.id] ?? 0) >= cutoff);
  });

  return selected.sort((left, right) => {
    let order = 0;
    if (query.sort === 'name-asc') order = displayName(left).localeCompare(displayName(right), 'zh-CN');
    if (query.sort === 'birth-asc') order = birthKey(left) - birthKey(right);
    if (query.sort === 'updated-desc') order = right.updatedAt.localeCompare(left.updatedAt);
    if (query.sort === 'recent-desc') order = (recents[right.id] ?? 0) - (recents[left.id] ?? 0);
    return order || left.id.localeCompare(right.id);
  });
}
```

- [ ] **Step 4: Run selector tests and commit**

Run: `npx vitest run src/renderer-react/features/profiles/directory.test.ts`

Expected: PASS with all search, recent, and sorting cases.

```powershell
git add src/renderer-react/features/profiles/directory.ts src/renderer-react/features/profiles/directory.test.ts
git commit -m "feat: add profile directory selectors"
```

---

### Task 4: Zustand Profile Workspace Primary, Recents, and Chart Intent

**Files:**
- Create: `src/renderer-react/stores/profileWorkspace.ts`
- Create: `src/renderer-react/stores/profileWorkspace.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `src/renderer-react/stores/profileWorkspace.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import { createProfileWorkspaceStore, PROFILE_WORKSPACE_KEY } from './profileWorkspace';

beforeEach(() => localStorage.clear());

test('falls back primary to the first available profile and persists explicit changes', () => {
  const store = createProfileWorkspaceStore(localStorage);
  store.getState().reconcileProfiles(['p2', 'p1']);
  expect(store.getState().primaryProfileId).toBe('p2');
  store.getState().setPrimaryProfile('p1');
  expect(JSON.parse(localStorage.getItem(PROFILE_WORKSPACE_KEY)!).primaryProfileId).toBe('p1');
  store.getState().reconcileProfiles(['p2']);
  expect(store.getState().primaryProfileId).toBe('p2');
});

test('bounds recents to fifty and prunes entries older than ninety days', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  const store = createProfileWorkspaceStore(localStorage);
  for (let index = 0; index < 55; index += 1) store.getState().recordRecentUse(`p${index}`, now - index * 1000, now);
  store.getState().recordRecentUse('expired', now - 91 * 86_400_000, now);
  expect(Object.keys(store.getState().recentUses)).toHaveLength(50);
  expect(store.getState().recentUses.expired).toBeUndefined();
  expect(store.getState().recentUses.p0).toBe(now);
});

test('publishes and consumes an exact chart navigation intent', () => {
  const store = createProfileWorkspaceStore(localStorage);
  const intent = { route: 'relationship', chartType: 'synastry', primaryProfileId: 'p1' } as const;
  store.getState().openChart(intent);
  expect(store.getState().chartIntent).toEqual(intent);
  expect(store.getState().consumeChartIntent()).toEqual(intent);
  expect(store.getState().chartIntent).toBeNull();
});

test('continues in memory when local storage reads or writes fail', () => {
  const storage = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  } as unknown as Storage;
  const store = createProfileWorkspaceStore(storage);
  store.getState().reconcileProfiles(['p1']);
  store.getState().recordRecentUse('p1', 1000, 1000);
  expect(store.getState()).toMatchObject({ primaryProfileId: 'p1', recentUses: { p1: 1000 } });
});
```

- [ ] **Step 2: Run the store test and confirm the missing module failure**

Run: `npx vitest run src/renderer-react/stores/profileWorkspace.test.ts`

Expected: FAIL with `Failed to resolve import "./profileWorkspace"`.

- [ ] **Step 3: Implement the store with an injectable storage boundary**

Create `src/renderer-react/stores/profileWorkspace.ts`:

```ts
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

export const PROFILE_WORKSPACE_KEY = 'chillast.profileWorkspace';
const MAX_RECENTS = 50;
const RECENT_TTL_MS = 90 * 86_400_000;

export type ChartNavigationIntent = {
  route: 'personal' | 'relationship';
  chartType: 'natal' | 'transit' | 'synastry';
  primaryProfileId: string;
};

interface PersistedWorkspace {
  primaryProfileId: string | null;
  recentUses: Record<string, number>;
}

export interface ProfileWorkspaceState extends PersistedWorkspace {
  chartIntent: ChartNavigationIntent | null;
  setPrimaryProfile: (id: string) => void;
  reconcileProfiles: (ids: readonly string[]) => void;
  recordRecentUse: (id: string, usedAt?: number, now?: number) => void;
  removeProfile: (id: string) => void;
  openChart: (intent: ChartNavigationIntent) => void;
  consumeChartIntent: () => ChartNavigationIntent | null;
}

function readWorkspace(storage: Storage): PersistedWorkspace {
  try {
    const value = JSON.parse(storage.getItem(PROFILE_WORKSPACE_KEY) || '{}') as Partial<PersistedWorkspace>;
    return { primaryProfileId: typeof value.primaryProfileId === 'string' ? value.primaryProfileId : null, recentUses: value.recentUses && typeof value.recentUses === 'object' ? value.recentUses : {} };
  } catch {
    return { primaryProfileId: null, recentUses: {} };
  }
}

export function createProfileWorkspaceStore(storage: Storage): StoreApi<ProfileWorkspaceState> {
  const initial = readWorkspace(storage);
  const persist = (state: ProfileWorkspaceState) => {
    try {
      storage.setItem(PROFILE_WORKSPACE_KEY, JSON.stringify({ primaryProfileId: state.primaryProfileId, recentUses: state.recentUses }));
    } catch { /* in-memory state remains usable */ }
  };
  return createStore<ProfileWorkspaceState>((set, get) => ({
    ...initial,
    chartIntent: null,
    setPrimaryProfile: (primaryProfileId) => { set({ primaryProfileId }); persist(get()); },
    reconcileProfiles: (ids) => {
      const current = get().primaryProfileId;
      const primaryProfileId = current && ids.includes(current) ? current : ids[0] ?? null;
      const recentUses = Object.fromEntries(Object.entries(get().recentUses).filter(([id]) => ids.includes(id)));
      set({ primaryProfileId, recentUses }); persist(get());
    },
    recordRecentUse: (id, usedAt = Date.now(), now = Date.now()) => {
      const recentUses = Object.fromEntries(Object.entries({ ...get().recentUses, [id]: usedAt }).filter(([, timestamp]) => now - timestamp <= RECENT_TTL_MS).sort(([, left], [, right]) => right - left).slice(0, MAX_RECENTS));
      set({ recentUses }); persist(get());
    },
    removeProfile: (id) => {
      const recentUses = { ...get().recentUses }; delete recentUses[id];
      set({ primaryProfileId: get().primaryProfileId === id ? null : get().primaryProfileId, recentUses }); persist(get());
    },
    openChart: (chartIntent) => { get().recordRecentUse(chartIntent.primaryProfileId); set({ chartIntent, primaryProfileId: chartIntent.primaryProfileId }); persist(get()); },
    consumeChartIntent: () => { const intent = get().chartIntent; set({ chartIntent: null }); return intent; },
  }));
}

export const profileWorkspaceStore = createProfileWorkspaceStore(window.localStorage);
export const useProfileWorkspace = <T>(selector: (state: ProfileWorkspaceState) => T): T => useStore(profileWorkspaceStore, selector);
```

- [ ] **Step 4: Run store tests and commit**

Run: `npx vitest run src/renderer-react/stores/profileWorkspace.test.ts`

Expected: PASS with fallback, bounded recents, persistence, and consume-once intent behavior.

```powershell
git add src/renderer-react/stores/profileWorkspace.ts src/renderer-react/stores/profileWorkspace.test.ts
git commit -m "feat: add shared profile workspace state"
```

---

### Task 5: Profile Directory, Read Interactions, and Mutations

**Files:**
- Create: `src/renderer-react/features/profiles/profileQueries.ts`
- Create: `src/renderer-react/features/profiles/ProfileDirectory.tsx`
- Create: `src/renderer-react/features/profiles/ProfileDetail.tsx`
- Create: `src/renderer-react/features/profiles/ProfilePage.tsx`
- Create: `src/renderer-react/features/profiles/ProfilePage.test.tsx`
- Create: `src/renderer-react/features/profiles/profiles.css`
- Modify: `src/renderer-react/shell/AppShell.tsx`
- Modify: `src/renderer-react/styles/global.css`
- Modify: `locale/zh.json`
- Modify: `src/renderer-react/shell/locale.test.ts`

- [ ] **Step 1: Write a failing page integration test**

Create `src/renderer-react/features/profiles/ProfilePage.test.tsx` with a QueryClient wrapper (`retry: false`, `staleTime: Infinity`), the real `I18nProvider`, a reset workspace store, and this primary scenario:

```tsx
test('searches, selects, marks primary, duplicates, deletes, and publishes chart intents', async () => {
  const user = userEvent.setup();
  const profiles = [makeProfile({ id: 'p1', nameZh: '王小明', tags: ['VIP'] }), makeProfile({ id: 'p2', nameZh: '李梅', nameEn: 'May Li' })];
  const list = vi.fn().mockResolvedValue(profiles);
  const save = vi.fn().mockImplementation(async (input) => makeProfile({ ...input, id: 'copy' }));
  const remove = vi.fn().mockResolvedValue(true);
  window.mystApi = createProfileApi({ list, save, remove });
  renderProfilePage();

  expect(await screen.findByRole('heading', { name: '王小明' })).toBeInTheDocument();
  await user.type(screen.getByRole('searchbox', { name: '搜索档案' }), 'May');
  await user.click(screen.getByRole('button', { name: /李梅/ }));
  expect(screen.getByRole('heading', { name: '李梅' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '设为主档案' }));
  expect(profileWorkspaceStore.getState().primaryProfileId).toBe('p2');

  await user.click(screen.getByRole('button', { name: '复制档案' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, nameZh: '李梅 副本' }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

  await user.click(screen.getByRole('button', { name: '删除档案' }));
  expect(screen.getByRole('alertdialog', { name: '删除档案' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '删除档案' }));
  await user.click(screen.getByRole('button', { name: '确认删除' }));
  expect(remove).toHaveBeenCalledWith('p2');

  await user.clear(screen.getByRole('searchbox', { name: '搜索档案' }));
  await user.click(screen.getByRole('button', { name: /王小明/ }));
  await user.click(screen.getByRole('button', { name: '查看行运盘' }));
  expect(profileWorkspaceStore.getState().chartIntent).toEqual({ route: 'personal', chartType: 'transit', primaryProfileId: 'p1' });
});
```

- [ ] **Step 2: Run the page test and confirm missing component failure**

Run: `npx vitest run src/renderer-react/features/profiles/ProfilePage.test.tsx`

Expected: FAIL with `Failed to resolve import "./ProfilePage"`.

- [ ] **Step 3: Implement query hooks with mandatory refetch after mutations**

Create `src/renderer-react/features/profiles/profileQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ProfileSaveInput } from '../../api/contracts';

export const profilesQueryKey = ['profiles'] as const;

export const useProfiles = () => useQuery({ queryKey: profilesQueryKey, queryFn: apiClient.listProfiles });

export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileSaveInput) => apiClient.saveProfile(input),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: profilesQueryKey }); },
  });
}

export function useRemoveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.removeProfile(id),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: profilesQueryKey }); },
  });
}
```

- [ ] **Step 4: Implement the directory component with fixed-format controls**

Create `ProfileDirectory.tsx` exporting props `{ profiles, selectedId, primaryId, query, recents, onQueryChange, onSelect, onCreate }`. Render:

```tsx
<aside className="profile-directory" aria-label={t('profiles.directory')}>
  <div className="profile-directory__toolbar">
    <label className="profile-search">
      <Search aria-hidden="true" size={16} />
      <span className="sr-only">{t('profiles.search')}</span>
      <input type="search" value={query.search} onChange={(event) => onQueryChange({ ...query, search: event.target.value })} placeholder={t('profiles.search')} />
    </label>
    <button type="button" onClick={onCreate} title={t('profiles.createBtn')} aria-label={t('profiles.createBtn')}><Plus aria-hidden="true" size={17} /></button>
  </div>
  <div className="profile-directory__filters">
    <select aria-label={t('profiles.recentFilter')} value={query.recent} onChange={(event) => onQueryChange({ ...query, recent: event.target.value as RecentFilter })}>
      <option value="all">{t('profiles.allProfiles')}</option><option value="7d">{t('profiles.used7d')}</option><option value="30d">{t('profiles.used30d')}</option>
    </select>
    <select aria-label={t('profiles.sort')} value={query.sort} onChange={(event) => onQueryChange({ ...query, sort: event.target.value as ProfileSort })}>
      <option value="updated-desc">{t('profiles.sortUpdated')}</option><option value="name-asc">{t('profiles.sortName')}</option><option value="birth-asc">{t('profiles.sortBirth')}</option><option value="recent-desc">{t('profiles.sortRecent')}</option>
    </select>
  </div>
  <div className="profile-directory__rows">
    {selectDirectoryProfiles(profiles, query, recents).map((profile) => <button type="button" className="profile-row" data-selected={selectedId === profile.id} key={profile.id} onClick={() => onSelect(profile.id)}>
      <span className="profile-row__name">{profile.nameZh || profile.nameEn}</span>{primaryId === profile.id && <span className="profile-row__primary">{t('profiles.primary')}</span>}
      <time>{formatBirth(profile.birthData)}</time><span>{profile.birthData.location.label}</span>
    </button>)}
  </div>
</aside>
```

Define `formatBirth` in the same file with zero-padded `YYYY-MM-DD HH:mm`; do not introduce a generic formatting module for one caller.

- [ ] **Step 5: Implement the read pane and direct commands**

Create `ProfileDetail.tsx` with props `{ profile, isPrimary, onEdit, onDuplicate, onDelete, onSetPrimary, onChart }`. Render the bilingual names, gender, exact birth moment, location label and coordinates, tags as semantic list items, notes with preserved line breaks, and these commands:

```tsx
<div className="profile-detail__commands">
  <button type="button" onClick={() => onChart({ route: 'personal', chartType: 'natal', primaryProfileId: profile.id })}><Orbit size={16} aria-hidden="true" />{t('profiles.openNatal')}</button>
  <button type="button" onClick={() => onChart({ route: 'personal', chartType: 'transit', primaryProfileId: profile.id })}><Clock3 size={16} aria-hidden="true" />{t('profiles.openTransit')}</button>
  <button type="button" onClick={() => onChart({ route: 'relationship', chartType: 'synastry', primaryProfileId: profile.id })}><UsersRound size={16} aria-hidden="true" />{t('profiles.openRelationship')}</button>
</div>
```

Use Lucide `Pencil`, `Copy`, `Trash2`, and `Star` for edit, duplicate, delete, and primary commands. Show a text marker beside the name when `isPrimary`; do not encode primary status by color alone.

- [ ] **Step 6: Compose selection, fallback, duplicate, delete, and route intent**

Create `ProfilePage.tsx` with prop `onNavigate: (route: RouteKey) => void`. Use `useProfiles`, `useSaveProfile`, `useRemoveProfile`, local `selectedId`, and the workspace selectors. On every list result call `reconcileProfiles(profiles.map(({ id }) => id))` in an effect and select `selectedId` if it still exists, otherwise the resolved primary ID, otherwise the first ID.

Use these exact mutation handlers:

```ts
const duplicate = async (profile: Profile) => {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = profile;
  await saveProfile.mutateAsync({ ...copy, nameZh: copy.nameZh ? `${copy.nameZh} 副本` : '', nameEn: copy.nameEn ? `${copy.nameEn} Copy` : '' });
};

const remove = async (profile: Profile) => {
  await removeProfile.mutateAsync(profile.id);
  profileWorkspaceStore.getState().removeProfile(profile.id);
  setSelectedId(null);
};

const openChart = (intent: ChartNavigationIntent) => {
  profileWorkspaceStore.getState().openChart(intent);
  onNavigate(intent.route);
};
```

Opening delete sets `pendingDelete` and renders one accessible
`role="alertdialog"` named `删除档案`, containing the interpolated profile name
and `确认删除` / `取消` buttons. Only the confirm button calls
`remove(profile)`; cancel clears `pendingDelete`. Disable confirmation while the
mutation is pending and keep the dialog open with an inline retryable error when
removal fails. Do not use `window.confirm`.

Render explicit loading, retryable error, no-results, and empty-library states in the directory area. Keep create/edit mode hooks in this component but render a temporary `mode === 'read'` detail only; Task 6 fills the editor branch.

- [ ] **Step 7: Wire real route content while retaining every other route fallback**

In `AppShell.tsx`, add:

```tsx
const routeContent = activeRoute === 'profiles'
  ? <ProfilePage onNavigate={setActiveRoute} />
  : <section className="workspace__placeholder" aria-labelledby="workspace-title"><PageIcon aria-hidden="true" size={34} strokeWidth={1.5} /><p>{t('shell.placeholder', { title })}</p></section>;
```

Replace only the previous fallback section with `{routeContent}`. Keep the header, appearance controls, route state, panel composition, and five unimplemented route fallbacks intact.

- [ ] **Step 8: Add feature CSS and locale keys**

Create `profiles.css` with a two-column `minmax(280px, 34%) minmax(0, 1fr)` grid, 32/36 px density-aware control heights, scroll-contained directory rows, 4-8 px radii, visible focus rings, and a single-column layout below `760px`. Ensure `.profile-row`, `.profile-detail__commands`, tags, and long location/name text wrap without changing row width.

Add `@import '../features/profiles/profiles.css';` to `src/renderer-react/styles/global.css`.

Add exact Chinese keys under `profiles` in `locale/zh.json`: `directory`, `search`, `recentFilter`, `allProfiles`, `used7d`, `used30d`, `sort`, `sortUpdated`, `sortName`, `sortBirth`, `sortRecent`, `primary`, `setPrimary`, `duplicate`, `deleteTitle`, `confirmDelete`, `openNatal`, `openTransit`, `openRelationship`, `loadFailed`, `retry`, `noResults`, `tags`, `coordinates`, `createdAt`, and `updatedAt`. Values for `deleteTitle` and `confirmDelete` are `删除档案` and `确认删除`; reuse `form.cancel` for `取消`. Add each dot-path to the required-key array in `src/renderer-react/shell/locale.test.ts`.

- [ ] **Step 9: Run focused UI and locale tests**

Run: `npx vitest run src/renderer-react/features/profiles/ProfilePage.test.tsx src/renderer-react/shell/locale.test.ts`

Expected: PASS; duplicate causes a second list request and delete requires confirmation.

- [ ] **Step 10: Commit the directory/read slice**

```powershell
git add src/renderer-react/features/profiles/profileQueries.ts src/renderer-react/features/profiles/ProfileDirectory.tsx src/renderer-react/features/profiles/ProfileDetail.tsx src/renderer-react/features/profiles/ProfilePage.tsx src/renderer-react/features/profiles/ProfilePage.test.tsx src/renderer-react/features/profiles/profiles.css src/renderer-react/shell/AppShell.tsx src/renderer-react/styles/global.css locale/zh.json src/renderer-react/shell/locale.test.ts
git commit -m "feat: add searchable profile directory"
```

---

### Task 6: Create/Edit Form, Location Picker, and Validation

**Files:**
- Create: `src/renderer-react/features/profiles/profileForm.ts`
- Create: `src/renderer-react/features/profiles/profileForm.test.ts`
- Create: `src/renderer-react/features/profiles/LocationPicker.tsx`
- Create: `src/renderer-react/features/profiles/LocationPicker.test.tsx`
- Create: `src/renderer-react/features/profiles/ProfileForm.tsx`
- Create: `src/renderer-react/features/profiles/ProfileForm.test.tsx`
- Modify: `src/renderer-react/features/profiles/ProfilePage.tsx`
- Modify: `src/renderer-react/features/profiles/ProfilePage.test.tsx`
- Modify: `src/renderer-react/features/profiles/profiles.css`
- Modify: `locale/zh.json`
- Modify: `src/renderer-react/shell/locale.test.ts`

- [ ] **Step 1: Write failing pure draft and validation tests**

Create `profileForm.test.ts` with exact assertions:

```ts
import { expect, test } from 'vitest';
import { createDraft, toSaveInput, validateProfileDraft } from './profileForm';

test('creates segmented string fields from a profile and round-trips normalized values', () => {
  const draft = createDraft(makeProfile({ tags: ['VIP', 'Client'] }));
  expect(draft).toMatchObject({ year: '1990', month: '01', day: '02', hour: '03', minute: '04', tags: 'VIP, Client' });
  expect(toSaveInput({ ...draft, tags: ' VIP, client, VIP ', latitude: '39.9042', longitude: '116.4074' })).toMatchObject({ tags: ['VIP', 'client'], birthData: { location: { latitude: 39.9042, longitude: 116.4074 } } });
});

test('returns field-specific errors for names, calendar, and coordinates', () => {
  const draft = createDraft(null);
  expect(validateProfileDraft({ ...draft, year: '2026', month: '02', day: '30', hour: '24', latitude: '91', longitude: '181' })).toEqual(expect.objectContaining({ names: expect.any(String), day: expect.any(String), hour: expect.any(String), latitude: expect.any(String), longitude: expect.any(String), locationLabel: expect.any(String) }));
});
```

- [ ] **Step 2: Run the pure test and confirm missing implementation**

Run: `npx vitest run src/renderer-react/features/profiles/profileForm.test.ts`

Expected: FAIL with `Failed to resolve import "./profileForm"`.

- [ ] **Step 3: Implement the draft contract, conversion, and deterministic validation**

Create `profileForm.ts` with:

```ts
export interface ProfileDraft {
  id?: string; createdAt?: string; updatedAt?: string;
  nameZh: string; nameEn: string; gender: Gender; tags: string; notes: string;
  year: string; month: string; day: string; hour: string; minute: string;
  locationLabel: string; latitude: string; longitude: string;
}
export type ProfileFieldErrors = Partial<Record<keyof ProfileDraft | 'names' | 'save', string>>;
```

`createDraft(profile)` must use current local year only for a new draft, default month/day to `01`, time to `00:00`, gender to `other`, and all other new fields to empty strings. Existing profiles preserve IDs/timestamps. `toSaveInput()` must trim names/location, split tags on commas (`,` and `，`), apply the Task 1 case-insensitive normalization rule, and convert segmented/date/coordinate fields to numbers.

`validateProfileDraft()` must check: one name present; year 1-3000; real Gregorian date via `Date.UTC`; hour 0-23; minute 0-59; non-empty location label; latitude -90..90; longitude -180..180. Return localized key-independent Chinese messages so field errors remain usable before locale bootstrap is involved.

- [ ] **Step 4: Run pure form tests**

Run: `npx vitest run src/renderer-react/features/profiles/profileForm.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing location picker interaction tests**

Create `LocationPicker.test.tsx` using fake timers only for the 200 ms debounce:

```tsx
test('searches merged cities, selects a result, and shows derived timezone data', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onChange = vi.fn();
  vi.spyOn(apiClient, 'searchCities').mockResolvedValue([{ key: '39.9042:116.4074', label: '北京 / Beijing', nameZh: '北京', nameEn: 'Beijing', region: '', country: 'CN', latitude: 39.9042, longitude: 116.4074, source: 'western' }]);
  vi.spyOn(apiClient, 'resolveLocation').mockResolvedValue({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00' });
  render(<LocationPicker value={locationValue} birthMoment={birthMoment} errors={{}} onChange={onChange} />);
  await user.type(screen.getByRole('combobox', { name: '搜索城市' }), '北京');
  await vi.advanceTimersByTimeAsync(200);
  await user.click(await screen.findByRole('option', { name: /北京 \/ Beijing/ }));
  expect(onChange).toHaveBeenCalledWith({ locationLabel: '北京 / Beijing', latitude: '39.9042', longitude: '116.4074' });
  expect(await screen.findByText('Asia/Shanghai · UTC+08:00')).toBeInTheDocument();
});

test('resolves manual coordinates and clears stale derivation when input becomes invalid', async () => {
  const { rerender } = render(<LocationPicker value={locationValue} birthMoment={birthMoment} errors={{}} onChange={vi.fn()} />);
  expect(await screen.findByText(/UTC\+08:00/)).toBeInTheDocument();
  rerender(<LocationPicker value={{ ...locationValue, latitude: '91' }} birthMoment={birthMoment} errors={{ latitude: '纬度无效' }} onChange={vi.fn()} />);
  expect(screen.queryByText(/UTC\+08:00/)).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Implement merged search and derived display without persistence**

Create `LocationPicker.tsx` with props:

```ts
interface LocationPickerProps {
  value: Pick<ProfileDraft, 'locationLabel' | 'latitude' | 'longitude'>;
  birthMoment: Pick<ProfileDraft, 'year' | 'month' | 'day' | 'hour' | 'minute'>;
  errors: ProfileFieldErrors;
  onChange: (patch: Pick<ProfileDraft, 'locationLabel' | 'latitude' | 'longitude'>) => void;
}
```

Use local `query`, `results`, `searchError`, and `resolution` state. Debounce non-empty search by 200 ms and ignore superseded promise results with an effect cleanup flag. Resolve only when all five birth segments and both coordinates parse to valid ranges. Clear `resolution` synchronously before a new resolve request. Render the city list as `role="listbox"`/`role="option"`, manual label/latitude/longitude inputs, inline errors, a loading status, and `resolution ? `${timeZone} · ${utcOffsetLabel}` : null`. Never include resolution in `onChange` or `ProfileDraft`.

- [ ] **Step 7: Run location picker tests**

Run: `npx vitest run src/renderer-react/features/profiles/LocationPicker.test.tsx`

Expected: PASS with selected coordinates and stale derived output cleared.

- [ ] **Step 8: Write failing form interaction tests**

Create `ProfileForm.test.tsx` with these scenarios:

```tsx
test('supports segmented date/time steppers and sends validated create input', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ProfileForm profile={null} onSave={onSave} onCancel={vi.fn()} onDraftStateChange={vi.fn()} />);
  await user.type(screen.getByLabelText('中文名字'), '张三');
  await user.clear(screen.getByLabelText('年')); await user.type(screen.getByLabelText('年'), '1991');
  await user.clear(screen.getByLabelText('月')); await user.type(screen.getByLabelText('月'), '8');
  await user.clear(screen.getByLabelText('日')); await user.type(screen.getByLabelText('日'), '9');
  await user.click(screen.getByRole('button', { name: '小时增加' }));
  await user.type(screen.getByLabelText('出生地名称'), '北京');
  await user.type(screen.getByLabelText('纬度'), '39.9042');
  await user.type(screen.getByLabelText('经度'), '116.4074');
  await user.click(screen.getByRole('button', { name: '创建档案' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nameZh: '张三', birthData: expect.objectContaining({ year: 1991, month: 8, day: 9, hour: 1 }) }));
});

test('keeps draft values and exposes retry after a storage failure', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValueOnce(new Error('磁盘已满')).mockResolvedValueOnce(undefined);
  render(<ProfileForm profile={makeProfile({})} onSave={onSave} onCancel={vi.fn()} onDraftStateChange={vi.fn()} />);
  await user.type(screen.getByLabelText('备注'), ' retained');
  await user.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('磁盘已满');
  expect(screen.getByLabelText('备注')).toHaveValue(expect.stringContaining('retained'));
  await user.click(screen.getByRole('button', { name: '重试保存' }));
  expect(onSave).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 9: Implement one shared create/edit form**

Create `ProfileForm.tsx` with props:

```ts
export interface DraftRegistration {
  dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}
interface ProfileFormProps {
  profile: Profile | null;
  onSave: (input: ProfileSaveInput) => Promise<void>;
  onCancel: () => void;
  onDraftStateChange: (registration: DraftRegistration) => void;
}
```

Keep `initialDraft` and `draft` state, compute dirty with `JSON.stringify(draft) !== JSON.stringify(initialDraft)`, and expose a stable registration whenever those values change. `submit()` validates, focuses the first invalid input using its field name, retains draft on rejected save, sets `errors.save`, and returns `false`; success replaces initial draft, reports clean state, and returns `true`.

Use five `inputMode="numeric"` segmented inputs with labels `year/month/day/hour/minute` locale values. Add Lucide `ChevronUp`/`ChevronDown` icon buttons for each segment, clamped to valid ranges and labelled with localized increment/decrement names. Render names, gender select, comma-delimited tags, notes, `LocationPicker`, inline errors, save/create, and cancel commands. Disable only while a save request is active.

- [ ] **Step 10: Complete editor composition in `ProfilePage`**

Replace the Task 5 read-only mode branch with:

```tsx
{mode === 'read' && selected && <ProfileDetail profile={selected} isPrimary={selected.id === primaryProfileId} onEdit={() => setMode('edit')} onDuplicate={() => void duplicate(selected)} onDelete={() => void remove(selected)} onSetPrimary={() => setPrimaryProfile(selected.id)} onChart={openChart} />}
{mode === 'create' && <ProfileForm profile={null} onSave={async (input) => { await saveProfile.mutateAsync(input); setMode('read'); }} onCancel={() => setMode('read')} onDraftStateChange={setDraftRegistration} />}
{mode === 'edit' && selected && <ProfileForm profile={selected} onSave={async (input) => { await saveProfile.mutateAsync(input); setMode('read'); }} onCancel={() => setMode('read')} onDraftStateChange={setDraftRegistration} />}
```

Selection and route dirty protection is added in Task 7. For this task, create/new and edit buttons enter the modes, and clean cancel returns to read mode.

- [ ] **Step 11: Add editor/location locale and CSS coverage**

Add exact locale keys for: segmented field labels; all increment/decrement labels; tags; location resolution status; search loading/error; manual coordinates; timezone/offset; create/edit headings; retry save; required-name/date/time/location/coordinate errors. Add every key to `locale.test.ts`.

Extend `profiles.css` with a stable five-column segmented date row, compact icon-button dimensions, a popover-like result list constrained to the picker width, a two-column coordinates row that collapses on narrow screens, inline field error spacing, and a save error region that cannot overlap commands.

- [ ] **Step 12: Run form and page tests**

Run: `npx vitest run src/renderer-react/features/profiles/profileForm.test.ts src/renderer-react/features/profiles/LocationPicker.test.tsx src/renderer-react/features/profiles/ProfileForm.test.tsx src/renderer-react/features/profiles/ProfilePage.test.tsx src/renderer-react/shell/locale.test.ts`

Expected: PASS; failed save retains input and derived timezone never enters save input.

- [ ] **Step 13: Commit the editor slice**

```powershell
git add src/renderer-react/features/profiles/profileForm.ts src/renderer-react/features/profiles/profileForm.test.ts src/renderer-react/features/profiles/LocationPicker.tsx src/renderer-react/features/profiles/LocationPicker.test.tsx src/renderer-react/features/profiles/ProfileForm.tsx src/renderer-react/features/profiles/ProfileForm.test.tsx src/renderer-react/features/profiles/ProfilePage.tsx src/renderer-react/features/profiles/ProfilePage.test.tsx src/renderer-react/features/profiles/profiles.css locale/zh.json src/renderer-react/shell/locale.test.ts
git commit -m "feat: add validated profile editor"
```

---

### Task 7: Dirty Guard, Native Close, Smoke, Visual, and Package Verification

**Files:**
- Create: `src/renderer-react/shell/DirtyNavigationProvider.tsx`
- Create: `src/renderer-react/shell/DirtyNavigationProvider.test.tsx`
- Modify: `src/renderer-react/features/profiles/ProfilePage.tsx`
- Modify: `src/renderer-react/features/profiles/ProfileForm.tsx`
- Modify: `src/renderer-react/shell/AppShell.tsx`
- Modify: `src/renderer-react/shell/AppShell.test.tsx`
- Create: `src/main/CloseGuard.js`
- Create: `tests/MainCloseGuard.test.js`
- Modify: `src/main/Main.js`
- Modify: `src/renderer-react/main.tsx`
- Modify: `tests/SmokeReactRenderer.js`
- Modify: `package.json`
- Modify: `locale/zh.json`
- Modify: `src/renderer-react/shell/locale.test.ts`

- [ ] **Step 1: Write failing dirty-transition provider tests**

Create `DirtyNavigationProvider.test.tsx` with a harness that registers `{ dirty: true, save, discard }`, calls `requestTransition(action)`, and asserts:

```tsx
function DirtyHarness({ save, discard, transition }: { save: () => Promise<boolean>; discard: () => void; transition: () => void }) {
  const { register, requestTransition } = useDirtyNavigation();
  useEffect(() => { register({ dirty: true, save, discard }); return () => register(null); }, [discard, register, save]);
  return <button type="button" onClick={() => void requestTransition(transition)}>离开</button>;
}

function renderDirtyHarness(callbacks: { save: () => Promise<boolean>; discard?: () => void; transition: () => void }) {
  return render(<I18nProvider dictionary={dictionary}><DirtyNavigationProvider><DirtyHarness save={callbacks.save} discard={callbacks.discard ?? (() => {})} transition={callbacks.transition} /></DirtyNavigationProvider></I18nProvider>);
}

test('save runs the editor save before the pending transition', async () => {
  const user = userEvent.setup();
  const order: string[] = [];
  renderDirtyHarness({ save: async () => { order.push('save'); return true; }, transition: () => order.push('transition') });
  await user.click(screen.getByRole('button', { name: '离开' }));
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(order).toEqual(['save', 'transition']);
});

test('discard runs discard then transition while cancel runs neither', async () => {
  const user = userEvent.setup();
  const order: string[] = [];
  renderDirtyHarness({ save: async () => true, discard: () => order.push('discard'), transition: () => order.push('transition') });
  await user.click(screen.getByRole('button', { name: '离开' }));
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(order).toEqual([]);
  await user.click(screen.getByRole('button', { name: '离开' }));
  await user.click(screen.getByRole('button', { name: '放弃修改' }));
  expect(order).toEqual(['discard', 'transition']);
});

test('failed save keeps the dialog and blocks the transition', async () => {
  const user = userEvent.setup();
  const transition = vi.fn();
  renderDirtyHarness({ save: async () => false, transition });
  await user.click(screen.getByRole('button', { name: '离开' }));
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(transition).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});

test('native close request maps clean/save/discard to proceed and cancel to cancel', async () => {
  const user = userEvent.setup();
  let closeRequest: (() => void) | undefined;
  vi.spyOn(apiClient, 'onCloseRequested').mockImplementation((callback) => { closeRequest = callback; return () => { closeRequest = undefined; }; });
  const decideClose = vi.spyOn(apiClient, 'decideClose').mockResolvedValue(true);
  renderDirtyHarness({ save: async () => true, transition: vi.fn() });
  act(() => closeRequest?.());
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(decideClose).toHaveBeenLastCalledWith('cancel');
  act(() => closeRequest?.());
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(decideClose).toHaveBeenLastCalledWith('proceed');
  expect(decideClose).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run provider tests and confirm missing module failure**

Run: `npx vitest run src/renderer-react/shell/DirtyNavigationProvider.test.tsx`

Expected: FAIL with `Failed to resolve import "./DirtyNavigationProvider"`.

- [ ] **Step 3: Implement one serialized dirty-transition coordinator**

Create `DirtyNavigationProvider.tsx` exporting:

```ts
export interface DirtyRegistration { dirty: boolean; save: () => Promise<boolean>; discard: () => void }
export interface DirtyNavigationValue {
  register: (registration: DirtyRegistration | null) => void;
  requestTransition: (action: () => void) => Promise<boolean>;
}
export const useDirtyNavigation = (): DirtyNavigationValue => { /* context lookup; throw outside provider */ };
```

The provider owns one registration, one pending `{ action, resolve, nativeClose }`, and one `saving` flag. `requestTransition` immediately runs clean transitions; dirty transitions open an accessible `role="alertdialog"`. Save awaits `registration.save()`, closes and runs the action only on `true`; discard calls `registration.discard()` then runs the action; cancel resolves `false`. Reject a second pending request by returning `false` so profile selection, navigation, and close cannot race.

Subscribe once with `apiClient.onCloseRequested`. For a clean request call `decideClose('proceed')`. For dirty requests open the same dialog with `nativeClose: true`; save/discard call `decideClose('proceed')`, while cancel calls `decideClose('cancel')`. The native path has no arbitrary callback and therefore cannot execute renderer-controlled navigation during close.

Render localized buttons `保存并继续`, `放弃修改`, and `取消`, an error line when save returns false, and disable all three while saving.

- [ ] **Step 4: Guard selection, create/edit cancellation, and shell navigation**

In `ProfileForm`, call `register(registration)` from the dirty context and unregister on unmount. Remove the `onDraftStateChange` prop introduced in Task 6.

In `ProfilePage`, wrap profile row selection, create, edit cancel, duplicate, and delete with `requestTransition`. Direct chart actions continue calling the supplied `onNavigate`; `AppShell` supplies its guarded `navigate`, so wrapping those actions again would create two pending guards. A save success may transition because the registration reports clean before the page mode changes. The exact selection shape is:

```ts
const selectProfile = (id: string) => void requestTransition(() => {
  setSelectedId(id);
  setMode('read');
  recordRecentUse(id);
});
```

In `AppShell`, wrap the shell with `DirtyNavigationProvider`, split composition into an inner component that can call `useDirtyNavigation()`, and pass this handler to `Navigation`:

```ts
const navigate = (route: RouteKey) => void requestTransition(() => setActiveRoute(route));
```

Pass the same `navigate` to `ProfilePage`. Keep all non-profile routes rendering their existing fallback content.

- [ ] **Step 5: Complete dirty UI tests**

Extend `ProfilePage.test.tsx` to edit notes, click a second profile, choose cancel and assert selection/draft remain, repeat and choose discard, then repeat and choose save. Extend `AppShell.test.tsx` to edit a profile, click `个人星盘`, cancel and assert the profile route remains active, then discard and assert the personal route fallback appears.

Run: `npx vitest run src/renderer-react/shell/DirtyNavigationProvider.test.tsx src/renderer-react/features/profiles/ProfilePage.test.tsx src/renderer-react/shell/AppShell.test.tsx`

Expected: PASS with save/discard/cancel covering both selection and navigation.

- [ ] **Step 6: Write failing pure native close state tests**

Create `tests/MainCloseGuard.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const createCloseGuard = require('../src/main/CloseGuard');

test('React close requests renderer decision once and proceeds only after approval', () => {
  const sent = [];
  let closed = 0;
  const guard = createCloseGuard({ send: (channel) => sent.push(channel), close: () => { closed += 1; } });
  assert.equal(guard.request(), false);
  assert.equal(guard.request(), false);
  assert.deepEqual(sent, ['app:closeRequested']);
  assert.equal(guard.decide('cancel'), false);
  assert.equal(closed, 0);
  guard.request();
  assert.equal(guard.decide('proceed'), true);
  assert.equal(closed, 1);
  assert.equal(guard.request(), true);
});

test('close guard rejects unsolicited or malformed decisions', () => {
  const guard = createCloseGuard({ send: () => {}, close: () => {} });
  assert.throws(() => guard.decide('proceed'), /待处理/);
  guard.request();
  assert.throws(() => guard.decide('yes'), /无效/);
});
```

- [ ] **Step 7: Run native close tests and confirm export failure**

Run: `node --test tests/MainCloseGuard.test.js`

Expected: FAIL with `Cannot find module '../src/main/CloseGuard'`.

- [ ] **Step 8: Implement and wire the React-only native close handshake**

Create `src/main/CloseGuard.js`:

```js
'use strict';

function createCloseGuard({ send, close }) {
  let pending = false;
  let approved = false;
  return {
    request() {
      if (approved) return true;
      if (!pending) {
        pending = true;
        send('app:closeRequested');
      }
      return false;
    },
    decide(decision) {
      if (decision !== 'proceed' && decision !== 'cancel') throw new Error('无效的关闭决定');
      if (!pending) throw new Error('没有待处理的关闭请求');
      pending = false;
      if (decision === 'cancel') return false;
      approved = true;
      close();
      return true;
    },
  };
}

module.exports = createCloseGuard;
```

Import it near the other local dependencies in `src/main/Main.js`:

```js
const createCloseGuard = require('./CloseGuard');
```

It tracks one pending request and one final approval; malformed and unsolicited decisions throw.

After `rendererTarget` is selected and the window is created, wire only React targets:

```js
if (rendererTarget.kind === 'react-file' || rendererTarget.kind === 'react-url') {
  this.closeGuard = createCloseGuard({
    send: (channel) => rendererWindow.webContents.send(channel),
    close: () => rendererWindow.close(),
  });
  rendererWindow.on('close', (event) => {
    if (!this.closeGuard.request()) event.preventDefault();
  });
}
```

Replace Task 2's no-op `_handleCloseDecision` with:

```js
_handleCloseDecision(decision) {
  if (!this.closeGuard) return false;
  return this.closeGuard.decide(decision);
}
```

Do not export or restructure the `Main` class; retain the existing `new Main().start()` composition path. The IpcRouter trusted sender/main-frame check remains the authorization boundary for decisions.

- [ ] **Step 9: Register and run native close/security tests**

Change `test:security` to include `tests/MainCloseGuard.test.js`.

Run: `node --test tests/MainCloseGuard.test.js tests/IpcRouterSecurity.test.js tests/PreloadSubscriptions.test.js`

Expected: PASS; malformed, unsolicited, foreign-renderer, and trusted close paths are all covered.

- [ ] **Step 10: Ensure renderer entry cleanup remains scoped**

Keep the existing `beforeunload` listener in `src/renderer-react/main.tsx` only for `stopPreferenceSync`; do not use it to protect profile drafts. The dirty provider subscription must return its own preload cleanup on unmount. Add a source assertion to `DirtyNavigationProvider.test.tsx` that `DirtyNavigationProvider.tsx` contains `onCloseRequested` and does not contain `beforeunload`.

Run: `npx vitest run src/renderer-react/shell/DirtyNavigationProvider.test.tsx`

Expected: PASS.

- [ ] **Step 11: Expand React Electron smoke data and profile workflow**

In `tests/SmokeReactRenderer.js`, register in-memory handlers before creating the window:

```js
let profiles = [{ id: 'smoke-p1', nameZh: '烟测档案', nameEn: 'Smoke Profile', gender: 'other', birthData: { year: 1990, month: 1, day: 2, hour: 3, minute: 4, location: { label: '北京 / Beijing', latitude: 39.9042, longitude: 116.4074 } }, notes: 'renderer smoke', tags: ['Smoke'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
registerEnvelope('profiles:list', () => profiles);
registerEnvelope('profiles:get', (id) => profiles.find((profile) => profile.id === id) || null);
registerEnvelope('profiles:save', (input) => { const saved = { ...input, id: input.id || `smoke-${profiles.length + 1}`, createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; profiles = [...profiles.filter(({ id }) => id !== saved.id), saved]; return saved; });
registerEnvelope('profiles:remove', (id) => { const before = profiles.length; profiles = profiles.filter((profile) => profile.id !== id); return profiles.length !== before; });
registerEnvelope('cities:search', () => [{ nameZh: '北京', nameEn: 'Beijing', country: 'CN', latitude: 39.9042, longitude: 116.4074 }]);
registerEnvelope('chinese:searchCities', () => []);
registerEnvelope('locations:resolve', () => ({ timeZone: 'Asia/Shanghai', utcOffsetMinutes: 480, utcOffsetLabel: 'UTC+08:00' }));
```

Subscribe to `app:closeDecision` in the smoke harness only if the smoke window uses Main's close guard; this standalone smoke window does not, so no close handler is required.

Add browser probes that: wait for `烟测档案`; search `Smoke`; select the row; assert explicit primary marker after clicking set-primary; click transit and assert heading becomes `个人星盘`; return to profiles; create a profile with segmented fields and Beijing location; verify it appears after query invalidation; enter edit mode, change notes, attempt navigation, and verify cancel keeps the editor while discard allows navigation.

- [ ] **Step 12: Add responsive and visual assertions for the actual profile page**

Capture profile screenshots at `1440x920`, `1280x800`, and `1100x720` in light/compact and dark/comfortable combinations. For each capture assert non-zero directory/detail widths and use the central profile feature width as the responsive authority: at `>= 760px`, require side-by-side geometry with directory right `<=` detail left (one-pixel tolerance); below `760px`, require stacked geometry with directory bottom `<=` detail top (one-pixel tolerance). Also require every `[data-profile-control]` scroll width to fit its client width, exact PNG dimensions, PNG size above 10 KB, sampled luminance range above 20, and at least 32 sampled RGB colors. Save deterministic files under `tests/screenshots/profile-<width>x<height>-<theme>-<density>.png`.

Run: `npm run smoke:react`

Expected: PASS with profile CRUD/dirty workflow report and six nonblank screenshot records.

- [ ] **Step 13: Run focused verification before the full suite**

Run: `npm run test:security`

Expected: PASS.

Run: `npm run test:preload`

Expected: PASS.

Run: `npm run test:renderer`

Expected: PASS with no unhandled query or React state warnings.

Run: `npm run typecheck`

Expected: PASS with no missing `MystApi`, draft, intent, or route signatures.

- [ ] **Step 14: Run complete source, smoke, and package verification**

Run: `npm run verify`

Expected: exit code `0`; legacy tests/smoke and React tests/build/smoke all pass.

Run: `npm run smoke`

Expected: exit code `0`; the old renderer still loads and closes without waiting for the React close handshake.

Run: `npm run smoke:react`

Expected: exit code `0`; profile workflow and visual pixel checks pass.

Run: `npm run verify:package`

Expected: exit code `0`; unpacked package contains the React assets, preload profile/location/close APIs work, and packaged renderer smoke passes.

- [ ] **Step 15: Commit the guarded, verified profile deliverable**

```powershell
git add src/renderer-react/shell/DirtyNavigationProvider.tsx src/renderer-react/shell/DirtyNavigationProvider.test.tsx src/renderer-react/features/profiles/ProfilePage.tsx src/renderer-react/features/profiles/ProfileForm.tsx src/renderer-react/shell/AppShell.tsx src/renderer-react/shell/AppShell.test.tsx src/main/CloseGuard.js tests/MainCloseGuard.test.js src/main/Main.js src/renderer-react/main.tsx tests/SmokeReactRenderer.js package.json locale/zh.json src/renderer-react/shell/locale.test.ts
git commit -m "feat: protect unsaved profile changes"
```

Expected: one final implementation commit; screenshots remain ignored verification artifacts and `git status --short` is empty after generated build output is excluded by existing ignore rules.

---

## Final Acceptance Checklist

- [ ] Existing profile JSON without `tags` loads as `tags: []`; tagged data round-trips without changing other fields.
- [ ] Search matches Chinese/English names, location, tags, and notes; 7/30-day recent filters and all four sorts are deterministic.
- [ ] Primary status is explicit, shared, persisted locally, and falls back when the profile disappears.
- [ ] Recents are local-only, pruned after 90 days, and bounded to 50 IDs.
- [ ] Create, read, edit, duplicate, delete confirmation, and storage-error retry work through existing profile IPC contracts.
- [ ] Successful mutations invalidate/refetch `['profiles']`; no mutation trusts the stale save timestamp response.
- [ ] Date/time uses segmented numeric controls; city search merges western/Chinese results; manual coordinates work.
- [ ] Timezone and offset are derived through `tz-lookup`/Luxon for the local birth moment and never persisted.
- [ ] Natal, transit, and relationship actions publish only `ChartNavigationIntent` and navigate; no chart page is implemented here.
- [ ] Save/discard/cancel protects profile selection, shell navigation, direct actions, deletion, duplication, and native React window close.
- [ ] Native close decisions are accepted only through the trusted main-frame IPC envelope; legacy close behavior is unchanged.
- [ ] No folder, grouping, or bulk-operation UI or state was introduced.
- [ ] `npm run verify`, `npm run smoke`, `npm run smoke:react`, and `npm run verify:package` pass.
