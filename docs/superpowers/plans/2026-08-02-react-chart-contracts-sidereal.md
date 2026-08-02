# React Chart Contracts and Sidereal Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the validated western-chart process contract for all 20 service types and correct Swiss Ephemeris Lahiri sidereal calculations without rendering a React chart page.

**Architecture:** CommonJS `AstrologyService` remains the domain authority and the existing trusted IPC channel names remain unchanged. The React boundary defines exhaustive TypeScript/Zod request, catalog, reference, and normalized-result contracts; normalization creates ring-qualified identities before later UI code sees data. Swiss zodiac mode is selected per call through one auditable `SwissEphCore` path so sidereal flags reach bodies and houses while later tropical calls remain uncontaminated.

**Tech Stack:** CommonJS Node.js, Swiss Ephemeris `swisseph-v2`, Electron IPC/preload, TypeScript, Zod 3, Vitest, Node test runner

---

## Delivery Boundary and Handoff

This is plan 1 of 4. It creates no React page. Its working increment is a tested
domain and renderer boundary that can fetch an exact catalog/reference payload,
validate a `ChartRequest`, compute through the existing `chart:compute` channel,
parse a `NormalizedChartResult`, and calculate independently pinned tropical and
Lahiri sidereal values.

Plan 2 imports these exact public names from `src/renderer-react/features/charts/contracts.ts`:
`ChartType`, `ChartRoute`, `ChartRequest`, `ChartSettings`, `ChartOptions`,
`ChartCatalogDefinition`, `ChartReferenceData`, `NormalizedChartResult`,
`ChartIdentity`, `AspectIdentity`, `CHART_TYPES`, `PERSONAL_CHART_TYPES`, and
`RELATIONSHIP_CHART_TYPES`. It imports `CHART_DESCRIPTORS`, `assertCatalogMatchesDescriptors`,
and `normalizeChartResult` from the files named below. Plans 2-4 must not redefine them.

## File Map

- Create `src/renderer-react/features/charts/contracts.ts`: shared TypeScript chart vocabulary and public Zod-derived types.
- Create `src/renderer-react/features/charts/schemas.ts`: strict runtime schemas for requests, catalog, reference data, IPC chart results, metadata, and finite numeric fields.
- Create `src/renderer-react/features/charts/catalog.ts`: compile-time exhaustive 20-token route/control/request descriptor map and runtime catalog assertion.
- Create `src/renderer-react/features/charts/normalizeChartResult.ts`: duplicate rejection and deterministic ring/point/house/aspect identities.
- Create `src/renderer-react/features/charts/chartBoundary.test.ts`: request/reference/result parser and identity tests.
- Create `src/renderer-react/features/charts/catalog.test.ts`: exact 20-token mapping assertions.
- Modify `src/renderer-react/api/client.ts`: typed parsed catalog/reference/compute methods.
- Modify `src/renderer-react/api/client.test.ts`: malformed-envelope and malformed-chart rejection.
- Modify `src/renderer-react/types/myst-api.d.ts`: narrow existing preload declarations.
- Modify `tests/PreloadSubscriptions.test.js`: exact existing chart bridge forwarding and absence of generic invoke.
- Modify `tests/IpcRouterSecurity.test.js`: trusted chart handlers and untrusted-frame rejection.
- Create `tests/AstrologyCatalog.test.js`: authoritative catalog option mapping and all-token deterministic domain computation.
- Modify `src/core/astrology/AstrologyService.js`: reject equal relationship IDs and undeclared request option shapes.
- Modify `src/core/astrology/ephemeris/SwissEphConstants.js`: explicit tropical/sidereal flags and Lahiri constant.
- Modify `src/core/astrology/ephemeris/SwissEphCore.js`: zodiac-aware body/house calls with explicit sidereal mode.
- Modify `src/core/astrology/ephemeris/SwissephAdapter.js`: pass one zodiac mode to bodies and houses.
- Create `tests/fixtures/swisseph-lahiri-known-values.json`: independently recorded UTC/coordinate/version values.
- Create `tests/SwissephSidereal.test.js`: known values, offset, boundary, alternating isolation, return, and progression tests.

### Task 1: Define Exhaustive Chart Types, Requests, and Catalog Descriptors

**Files:**
- Create: `src/renderer-react/features/charts/contracts.ts`
- Create: `src/renderer-react/features/charts/catalog.ts`
- Create: `src/renderer-react/features/charts/catalog.test.ts`

- [ ] **Step 1: Write the failing exhaustive catalog tests**

Create `catalog.test.ts` with the authoritative expectation, including every token:

```ts
import { describe, expect, it } from 'vitest';
import { CHART_DESCRIPTORS, assertCatalogMatchesDescriptors } from './catalog';
import type { ChartCatalogDefinition, ChartType } from './contracts';

const expected = {
  natal: ['personal', []], transit: ['personal', ['targetDate']],
  tertiaryProgressed: ['personal', ['targetDate']], progressed: ['personal', ['targetDate']],
  lunarReturn: ['personal', ['targetDate']], solarReturn: ['personal', ['year']],
  solarArc: ['personal', ['targetDate']], firdaria: ['personal', ['targetDate']],
  profection: ['personal', ['targetDate']], relocation: ['personal', ['location']],
  synastry: ['relationship', []], composite: ['relationship', []],
  marx: ['relationship', []], davison: ['relationship', []],
  compositeSecondary: ['relationship', ['targetDate']], compositeTertiary: ['relationship', ['targetDate']],
  marxSecondary: ['relationship', ['targetDate']], marxTertiary: ['relationship', ['targetDate']],
  davisonSecondary: ['relationship', ['targetDate']], davisonTertiary: ['relationship', ['targetDate']],
} as const satisfies Record<ChartType, readonly ['personal' | 'relationship', readonly string[]]>;

describe('western chart catalog descriptors', () => {
  it.each(Object.entries(expected) as [ChartType, typeof expected[ChartType]][])(
    'maps %s to its exact route and declared options',
    (type, routeAndOptions) => {
      expect([CHART_DESCRIPTORS[type].route, CHART_DESCRIPTORS[type].serviceOptions])
        .toEqual(routeAndOptions);
    },
  );

  it('contains no token outside the 20 mapped cases', () => {
    expect(Object.keys(CHART_DESCRIPTORS)).toEqual(Object.keys(expected));
  });

  it('fails visibly for unknown tokens or mismatched service options', () => {
    const valid = Object.entries(CHART_DESCRIPTORS).map(([type, descriptor]) => ({
      type, nameZh: type, nameEn: type, category: descriptor.route,
      requiresSecondary: descriptor.route === 'relationship', options: [...descriptor.serviceOptions],
    })) as ChartCatalogDefinition[];
    expect(() => assertCatalogMatchesDescriptors(valid)).not.toThrow();
    expect(() => assertCatalogMatchesDescriptors([...valid, { ...valid[0], type: 'newChart' as ChartType }]))
      .toThrow('Unsupported chart catalog token: newChart');
    expect(() => assertCatalogMatchesDescriptors(valid.map((item) => item.type === 'solarReturn'
      ? { ...item, options: ['targetDate'] } : item))).toThrow('Catalog options mismatch for solarReturn');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm run test:renderer -- src/renderer-react/features/charts/catalog.test.ts`

Expected: FAIL with `Failed to resolve import "./catalog"`.

- [ ] **Step 3: Define the shared public types before any consumer uses them**

Create `contracts.ts` with these exact unions and interfaces. The later Zod task
exports schemas separately; this file remains free of Electron and React imports.

```ts
export const CHART_TYPES = [
  'natal', 'transit', 'tertiaryProgressed', 'progressed', 'lunarReturn',
  'solarReturn', 'solarArc', 'firdaria', 'profection', 'relocation',
  'synastry', 'composite', 'marx', 'davison', 'compositeSecondary',
  'compositeTertiary', 'marxSecondary', 'marxTertiary',
  'davisonSecondary', 'davisonTertiary',
] as const;
export type ChartType = typeof CHART_TYPES[number];
export type ChartRoute = 'personal' | 'relationship';
export type Zodiac = 'tropical' | 'sidereal';
export type AspectLevel = 'major' | 'minor';
export type ChartOptionName = 'targetDate' | 'year' | 'location';
export type DynamicControl = 'secondaryProfile' | 'targetDate' | 'returnYear' | 'relocationPlace';
export type ChartIdentity = `ring:${string}` | `${string}:${string}` | `house:${number}` | `aspect:${string}`;
export type AspectIdentity = `aspect:${string}:${string}:${string}:${string}:${string}`;

export interface ChartCatalogDefinition {
  type: ChartType; nameZh: string; nameEn: string; category: ChartRoute;
  requiresSecondary: boolean; options: ChartOptionName[];
}
export interface ChartDescriptor {
  route: ChartRoute; serviceOptions: readonly ChartOptionName[];
  controls: readonly DynamicControl[];
}
export interface ChartAspectSettings { enabled: string[]; orbOverrides: Record<string, number> }
export interface ChartSettings { houseSystem: string; zodiac: Zodiac; aspects: ChartAspectSettings }
export type ChartOptions = { targetDate?: string; year?: number; latitude?: number; longitude?: number; locationLabel?: string };
export interface ChartRequest { type: ChartType; primary: import('../../api/contracts').Profile; secondary?: import('../../api/contracts').Profile; settings: ChartSettings; options: ChartOptions }

export interface ChartPoint {
  id: `${string}:${string}`; ringId: string; key: string; kind: 'body' | 'point'; glyph: string;
  nameEn: string; nameZh: string; longitude: number; signKey: string; signGlyph: string;
  signNameZh: string; signIndex: number; degreeInSign: number;
  dms: { degrees: number; minutes: number; seconds: number }; retrograde: boolean; house: number | null;
}
export interface ChartRing { id: string; identity: `ring:${string}`; role: string; label: string; points: ChartPoint[] }
export interface ChartHouse { id: `house:${number}`; index: number; cuspLongitude: number; signKey: string; signGlyph: string; signNameZh: string; degreeInSign: number }
export interface ChartAngle { key: string; glyph: string; nameZh: string; longitude: number; signKey: string; signGlyph: string; signIndex: number; degreeInSign: number; dms: { degrees: number; minutes: number; seconds: number } }
export interface ChartAspect {
  id: AspectIdentity; ringA: string; ringB: string; point1: string; point2: string;
  aspectKey: string; glyph: string; nameZh: string; nameEn: string; level: AspectLevel;
  exactAngle: number; orb: number; orbUsed: number; strength: number; separation: number;
}
export interface ChartSubject { role: string; nameZh: string; nameEn: string; gender: string; birthLabel: string; location: { label: string; latitude: number; longitude: number } }
export interface ChartMeta { type: ChartType; typeNameZh: string; title: string; subtitle: string; settings: { houseSystem: string; zodiac: Zodiac }; generatedAt: string; instantUtc: string | null; [key: string]: unknown }
export interface ChartDistributions { elements: Record<string, number>; modalities: Record<string, number> }
export interface NormalizedChartResult { resultId: string; meta: ChartMeta; subjects: ChartSubject[]; houses: ChartHouse[]; angles: Record<string, ChartAngle>; rings: ChartRing[]; aspects: ChartAspect[]; distributions: ChartDistributions; identities: ChartIdentity[] }
export interface ChartReferenceData { signs: unknown[]; points: Record<string, unknown>; aspects: Record<string, { level: AspectLevel; defaultOrb: number; [key: string]: unknown }>; elements: Record<string, unknown>; modalities: Record<string, unknown>; houseSystems: Array<{ value: string; nameEn: string; nameZh: string }>; chartTypes: ChartCatalogDefinition[] }
```

- [ ] **Step 4: Implement the exhaustive descriptor map and assertion**

Create `catalog.ts`; `satisfies Record<ChartType, ChartDescriptor>` must be present
so adding/removing a token is a compile-time error:

```ts
import type { ChartCatalogDefinition, ChartDescriptor, ChartRoute, ChartType } from './contracts';

const personalDate = (controls: ChartDescriptor['controls']): ChartDescriptor => ({ route: 'personal', serviceOptions: ['targetDate'], controls });
const relationshipDate = { route: 'relationship', serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] } as const;
export const CHART_DESCRIPTORS = {
  natal: { route: 'personal', serviceOptions: [], controls: [] },
  transit: personalDate(['targetDate']), tertiaryProgressed: personalDate(['targetDate']),
  progressed: personalDate(['targetDate']), lunarReturn: personalDate(['targetDate']),
  solarReturn: { route: 'personal', serviceOptions: ['year'], controls: ['returnYear'] },
  solarArc: personalDate(['targetDate']), firdaria: personalDate(['targetDate']),
  profection: personalDate(['targetDate']),
  relocation: { route: 'personal', serviceOptions: ['location'], controls: ['relocationPlace'] },
  synastry: { route: 'relationship', serviceOptions: [], controls: ['secondaryProfile'] },
  composite: { route: 'relationship', serviceOptions: [], controls: ['secondaryProfile'] },
  marx: { route: 'relationship', serviceOptions: [], controls: ['secondaryProfile'] },
  davison: { route: 'relationship', serviceOptions: [], controls: ['secondaryProfile'] },
  compositeSecondary: relationshipDate, compositeTertiary: relationshipDate,
  marxSecondary: relationshipDate, marxTertiary: relationshipDate,
  davisonSecondary: relationshipDate, davisonTertiary: relationshipDate,
} as const satisfies Record<ChartType, ChartDescriptor>;

export const PERSONAL_CHART_TYPES = Object.keys(CHART_DESCRIPTORS).filter((type) => CHART_DESCRIPTORS[type as ChartType].route === 'personal') as ChartType[];
export const RELATIONSHIP_CHART_TYPES = Object.keys(CHART_DESCRIPTORS).filter((type) => CHART_DESCRIPTORS[type as ChartType].route === 'relationship') as ChartType[];

export function assertCatalogMatchesDescriptors(catalog: readonly ChartCatalogDefinition[]): void {
  const known = new Set(Object.keys(CHART_DESCRIPTORS));
  for (const definition of catalog) if (!known.has(definition.type)) throw new Error(`Unsupported chart catalog token: ${definition.type}`);
  if (catalog.length !== known.size) throw new Error(`Expected 20 chart catalog entries, received ${catalog.length}`);
  for (const [type, descriptor] of Object.entries(CHART_DESCRIPTORS) as [ChartType, ChartDescriptor][]) {
    const definition = catalog.find((entry) => entry.type === type);
    if (!definition) throw new Error(`Missing chart catalog token: ${type}`);
    if (definition.category !== descriptor.route || definition.requiresSecondary !== (descriptor.route === 'relationship')) throw new Error(`Catalog route mismatch for ${type}`);
    if (JSON.stringify(definition.options) !== JSON.stringify(descriptor.serviceOptions)) throw new Error(`Catalog options mismatch for ${type}`);
  }
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/catalog.test.ts
npm run typecheck
```

Expected: catalog tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/contracts.ts src/renderer-react/features/charts/catalog.ts src/renderer-react/features/charts/catalog.test.ts
git commit -m "feat(charts): define exhaustive chart catalog"
```

### Task 2: Add Strict Runtime Request, Reference, and Result Parsing

**Files:**
- Create: `src/renderer-react/features/charts/schemas.ts`
- Create: `src/renderer-react/features/charts/normalizeChartResult.ts`
- Create: `src/renderer-react/features/charts/chartBoundary.test.ts`

- [ ] **Step 1: Write failing parser and duplicate-identity tests**

Create `chartBoundary.test.ts` using local `makeRawResult()` and `makeProfile()`
fixtures with all fields required by `contracts.ts`, then assert these exact cases:

```ts
it('parses finite chart data and creates ring-qualified identities', () => {
  const result = normalizeChartResult(makeRawResult({
    rings: [ring('natal', [point('sun', 280)]), ring('transit', [point('sun', 90)])],
    aspects: [aspect('sun', 'opposition', 'sun')],
  }));
  expect(result.rings.flatMap((value) => value.points.map((point) => point.id)))
    .toEqual(['natal:sun', 'transit:sun']);
  expect(result.houses[0].id).toBe('house:1');
  expect(result.aspects[0].id).toBe('aspect:natal:sun:opposition:transit:sun');
  expect(result.identities).toContain('ring:natal');
});

it.each([
  ['ring', { rings: [ring('same', [point('sun', 1)]), ring('same', [point('moon', 2)])] }],
  ['point', { rings: [ring('natal', [point('sun', 1), point('sun', 2)])] }],
  ['house', { houses: [house(1), house(1)] }],
])('rejects duplicate %s identities', (_name, patch) => {
  expect(() => normalizeChartResult(makeRawResult(patch))).toThrow(/Duplicate/);
});

it.each([Number.NaN, Infinity, Number.NEGATIVE_INFINITY])('rejects non-finite numeric values: %s', (longitude) => {
  expect(() => normalizeChartResult(makeRawResult({ rings: [ring('natal', [point('sun', longitude)])] })))
    .toThrow('Chart response validation failed');
});

it('rejects an aspect whose unqualified endpoint is absent from its strategy rings', () => {
  expect(() => normalizeChartResult(makeRawResult({ aspects: [aspect('missing', 'trine', 'sun')] })))
    .toThrow('Aspect endpoint missing: missing');
});
```

Also assert `chartRequestSchema.safeParse` rejects an unknown chart token, equal
profile IDs, undeclared option keys, orb `0.09`, orb `15.01`, non-member house
system, malformed ISO instant, and out-of-range relocation coordinates.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:renderer -- src/renderer-react/features/charts/chartBoundary.test.ts`

Expected: FAIL because `schemas.ts` and `normalizeChartResult.ts` do not exist.

- [ ] **Step 3: Implement strict Zod schemas**

Create `schemas.ts` with strict Zod objects at every request/catalog/result
object boundary. Export these exact names and constraints:

```ts
import { z } from 'zod';
import { CHART_TYPES } from './contracts';

const finite = z.number().finite();
const longitude = finite.min(0).lt(360);
const isoInstant = z.string().datetime({ offset: true });
export const chartTypeSchema = z.enum(CHART_TYPES);
export const chartCatalogDefinitionSchema = z.object({
  type: chartTypeSchema, nameZh: z.string(), nameEn: z.string(),
  category: z.enum(['personal', 'relationship']), requiresSecondary: z.boolean(),
  options: z.array(z.enum(['targetDate', 'year', 'location'])),
}).strict();
export const chartOptionsSchema = z.object({
  targetDate: isoInstant.optional(), year: z.number().int().min(1).max(3000).optional(),
  latitude: finite.min(-90).max(90).optional(), longitude: finite.min(-180).max(180).optional(),
  locationLabel: z.string().min(1).optional(),
}).strict();
export const chartSettingsSchema = z.object({
  houseSystem: z.string().min(1), zodiac: z.enum(['tropical', 'sidereal']),
  aspects: z.object({ enabled: z.array(z.string()).max(10), orbOverrides: z.record(z.string(), finite.min(0.1).max(15)) }).strict(),
}).strict();
```

Build `profileSchema` from the existing `Profile` contract and export
`chartRequestSchema` with a `superRefine` that enforces distinct profiles,
descriptor route/options, required target/year/location tuple, known house and
aspect membership via a second exported function:

```ts
export function parseChartRequest(value: unknown, reference: ChartReferenceData): ChartRequest;
export function parseChartReferenceData(value: unknown): ChartReferenceData;
export function parseRawChartResult(value: unknown): RawChartResult;
export type RawChartResult = z.infer<typeof rawChartResultSchema>;
```

The result schemas must cover all fields in `ChartPoint`, `ChartHouse`,
`ChartAngle`, `ChartSubject`, `ChartAspect`, and distributions. Define metadata
as the required stable fields plus `.catchall(z.unknown())`; this deliberately
retains `firdaria`, `profection`, progression/return fields, and unknown
parser-approved strategy metadata. `instantUtc` accepts ISO string or `null`.

- [ ] **Step 4: Implement deterministic normalization**

Create `normalizeChartResult.ts` with these public signatures and aspect rules:

```ts
export function pointIdentity(ringId: string, pointKey: string): `${string}:${string}`;
export function houseIdentity(index: number): `house:${number}`;
export function aspectIdentity(ringA: string, point1: string, aspectKey: string, ringB: string, point2: string): AspectIdentity;
export function normalizeChartResult(value: unknown): NormalizedChartResult;
```

`normalizeChartResult` first calls `parseRawChartResult`. For one ring, qualify
both endpoints against that ring and lexical-sort intra-ring endpoint keys. For
two rings, retain service ring order and require `point1` in ring 0 and `point2`
in ring 1; do not fall back by key. Reject more than two rings. Use `Set`s to
reject duplicate ring IDs, point keys per ring, house indexes, and derived aspect
IDs. Set `resultId` to
`${raw.meta.type}:${raw.meta.generatedAt}:${raw.rings.map(r => r.id).join('+')}`
and build `identities` in ring, point, house, then aspect order.

- [ ] **Step 5: Run focused and full renderer tests**

Run:

```powershell
npm run test:renderer -- src/renderer-react/features/charts/chartBoundary.test.ts src/renderer-react/features/charts/catalog.test.ts
npm run test:renderer
npm run typecheck
```

Expected: focused and full renderer suites PASS; TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/features/charts/schemas.ts src/renderer-react/features/charts/normalizeChartResult.ts src/renderer-react/features/charts/chartBoundary.test.ts
git commit -m "feat(charts): validate and normalize chart contracts"
```

### Task 3: Connect the Existing Trusted IPC and Preload Boundary

**Files:**
- Modify: `src/renderer-react/api/client.ts`
- Modify: `src/renderer-react/api/client.test.ts`
- Modify: `src/renderer-react/types/myst-api.d.ts`
- Modify: `tests/PreloadSubscriptions.test.js`
- Modify: `tests/IpcRouterSecurity.test.js`

- [ ] **Step 1: Write failing preload and trusted-frame assertions**

Extend `PreloadSubscriptions.test.js`:

```js
test('preload forwards only narrow chart methods', async () => {
  const { api, invocations } = loadPreloadApi();
  const request = { type: 'natal', primary: { id: 'p1' } };
  await api.getReferenceData(); await api.getChartTypes(); await api.computeChart(request);
  assert.deepEqual(invocations.slice(-3), [
    ['reference:get'], ['chartTypes:get'], ['chart:compute', request],
  ]);
  assert.equal(api.invoke, undefined);
  assert.equal(api.ipcRenderer, undefined);
});
```

Extend `IpcRouterSecurity.test.js` with an injected `astrologyService`, assert
all three chart handlers return `{ ok: true, data }` for the exact trusted main
frame, and each returns `{ ok: false }` without invoking the service for a
foreign sender and trusted subframe.

- [ ] **Step 2: Run boundary tests and observe the typed-client gap**

Run:

```powershell
npm run test:preload
npm run test:security
npm run test:renderer -- src/renderer-react/api/client.test.ts
```

Expected: FAIL in the renderer client test after the Node bridge tests PASS,
because calls were added to missing `apiClient.getChartCatalog`,
`getChartReference`, and `computeChart`.

- [ ] **Step 3: Declare the existing preload methods exactly**

Add to `MystApi` in `myst-api.d.ts`:

```ts
getReferenceData(): Promise<IpcResult<unknown>>;
getChartTypes(): Promise<IpcResult<unknown>>;
computeChart(request: ChartRequest): Promise<IpcResult<unknown>>;
```

Import `ChartRequest`; retain `unknown` responses so only runtime parsers may
promote IPC data into trusted feature types.

- [ ] **Step 4: Add parsed client methods**

Add these methods to `apiClient`:

```ts
getChartCatalog: async (): Promise<ChartCatalogDefinition[]> => {
  const catalog = z.array(chartCatalogDefinitionSchema).parse(await invoke<unknown>((api) => api.getChartTypes()));
  assertCatalogMatchesDescriptors(catalog);
  return catalog;
},
getChartReference: async (): Promise<ChartReferenceData> => {
  const reference = parseChartReferenceData(await invoke<unknown>((api) => api.getReferenceData()));
  assertCatalogMatchesDescriptors(reference.chartTypes);
  return reference;
},
computeChart: async (request: ChartRequest): Promise<NormalizedChartResult> =>
  normalizeChartResult(await invoke<unknown>((api) => api.computeChart(request))),
```

Add and export this error classification before the methods:

```ts
export type ChartBoundaryFailureKind = 'ipc' | 'domain' | 'parser';
export class ChartBoundaryError extends Error {
  constructor(readonly kind: ChartBoundaryFailureKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChartBoundaryError';
  }
}
```

For chart methods only, wrap a rejected `window.mystApi` promise as `ipc`, an
`{ ok:false, error }` envelope as `domain`, and Zod/normalization rejection as
`parser`. Preserve the original error as `cause`. Do not alter profile/AI client
error behavior in this task.

In `client.test.ts`, assert a rejected invoke is `ChartBoundaryError.kind ===
'ipc'`, an error envelope is `domain`, and malformed envelopes, unknown catalog
tokens, `NaN` point longitude, and duplicate ring IDs are `parser` before any
returned value can be indexed as a chart.

- [ ] **Step 5: Run boundary, renderer, and type tests**

Run:

```powershell
npm run test:preload
npm run test:security
npm run test:renderer -- src/renderer-react/api/client.test.ts src/renderer-react/features/charts
npm run typecheck
```

Expected: all commands exit 0; untrusted events make zero astrology calls.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer-react/api/client.ts src/renderer-react/api/client.test.ts src/renderer-react/types/myst-api.d.ts tests/PreloadSubscriptions.test.js tests/IpcRouterSecurity.test.js
git commit -m "feat(charts): expose validated chart bridge"
```

### Task 4: Enforce the Domain Catalog and Compute Every Exact Token

**Files:**
- Create: `tests/AstrologyCatalog.test.js`
- Modify: `src/core/astrology/AstrologyService.js`

- [ ] **Step 1: Write the failing authoritative domain tests**

Create `AstrologyCatalog.test.js`. Configure `SwissEphCore` with
`assets/ephemeris`, construct the production Swiss factory, and define two
persisted profiles with IDs `primary` and `secondary`. Use this exact request
map:

```js
const requests = {
  natal: {}, transit: { targetDate: '2026-06-18T12:00:00.000Z' },
  tertiaryProgressed: { targetDate: '2026-06-18T12:00:00.000Z' },
  progressed: { targetDate: '2026-06-18T12:00:00.000Z' },
  lunarReturn: { targetDate: '2026-06-18T12:00:00.000Z' }, solarReturn: { year: 2026 },
  solarArc: { targetDate: '2026-06-18T12:00:00.000Z' }, firdaria: { targetDate: '2026-06-18T12:00:00.000Z' },
  profection: { targetDate: '2026-06-18T12:00:00.000Z' },
  relocation: { latitude: 40.7128, longitude: -74.006, locationLabel: 'New York' },
  synastry: {}, composite: {}, marx: {}, davison: {},
  compositeSecondary: { targetDate: '2026-06-18T12:00:00.000Z' },
  compositeTertiary: { targetDate: '2026-06-18T12:00:00.000Z' },
  marxSecondary: { targetDate: '2026-06-18T12:00:00.000Z' },
  marxTertiary: { targetDate: '2026-06-18T12:00:00.000Z' },
  davisonSecondary: { targetDate: '2026-06-18T12:00:00.000Z' },
  davisonTertiary: { targetDate: '2026-06-18T12:00:00.000Z' },
};
```

Assert catalog tokens are exactly `Object.keys(requests)`, options equal the
Section 4.2 map, every relationship definition requires secondary, and every
computed result has matching `meta.type`, expected ring count
`2` only for transit/progressed/tertiaryProgressed/solarArc/synastry/
davisonSecondary/davisonTertiary, 12 unique houses, unique ring IDs and point
keys, finite point/house/angle/aspect numbers, and object metadata. Assert equal
relationship IDs throw `/不同档案/`.

- [ ] **Step 2: Run the test and verify equal IDs currently pass**

Run: `node --test tests/AstrologyCatalog.test.js`

Expected: FAIL at `relationship subjects must be distinct` because
`AstrologyService.computeChart` currently accepts two profiles with the same ID.

- [ ] **Step 3: Add minimal service-boundary validation**

In `AstrologyService.computeChart`, after normalizing subjects, add:

```js
if (definition.requiresSecondary && primary.id && secondary.id && primary.id === secondary.id) {
  throw new Error('关系盘需要两个不同档案');
}
```

Validate that `request`, `settings`, and `options` are plain objects; reject an
option name not represented by the definition (`location` expands only to
`latitude`, `longitude`, `locationLabel`), and reject a provided secondary on a
personal chart. Preserve existing defaults and strategy algorithms.

- [ ] **Step 4: Run domain tests**

Run:

```powershell
node --test tests/AstrologyCatalog.test.js
npm test
```

Expected: all 20 subtests and the complete existing domain suite PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/astrology/AstrologyService.js tests/AstrologyCatalog.test.js
git commit -m "test(astrology): verify all western chart types"
```

### Task 5: Add a Zodiac-Aware Swiss Core Path

**Files:**
- Modify: `src/core/astrology/ephemeris/SwissEphConstants.js`
- Modify: `src/core/astrology/ephemeris/SwissEphCore.js`
- Modify: `src/core/astrology/ephemeris/SwissephAdapter.js`
- Create: `tests/SwissephSidereal.test.js`

- [ ] **Step 1: Write failing core-spy tests for Lahiri flags**

In `SwissephSidereal.test.js`, load `SwissEphCore` with an injected Swiss object
using a new test-only `createSwissEphCore(swiss, fsApi)` export. Assert:

```js
assert.deepEqual(calls, [
  ['setPath', ephePath], ['setSidMode', swiss.SE_SIDM_LAHIRI, 0, 0],
  ['calc', 2451545, swiss.SE_SUN, TROPICAL_FLAGS | swiss.SEFLG_SIDEREAL],
  ['housesEx', 2451545, swiss.SEFLG_SIDEREAL, 51.4779, 0, 'P'],
]);
```

Then call tropical body/houses and assert flags are exactly `TROPICAL_FLAGS`
and `0`, without relying on process-global sidereal mode. Assert an invalid
zodiac throws `Unknown zodiac mode: draconic`.

- [ ] **Step 2: Run the focused test and verify signature failure**

Run: `node --test tests/SwissephSidereal.test.js`

Expected: FAIL because `createSwissEphCore` and zodiac parameters do not exist.

- [ ] **Step 3: Define explicit flags and Lahiri mode**

Replace `FLAGS` in `SwissEphConstants.js` with:

```js
const TROPICAL_FLAGS = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
const SIDEREAL_FLAGS = TROPICAL_FLAGS | swisseph.SEFLG_SIDEREAL;
const SIDEREAL_HOUSE_FLAGS = swisseph.SEFLG_SIDEREAL;
const SIDEREAL_MODE = swisseph.SE_SIDM_LAHIRI;
```

Export all four names. Do not export a mutable active zodiac.

- [ ] **Step 4: Implement the auditable Swiss core methods**

Refactor `SwissEphCore.js` behind this exact factory and singleton export:

```js
function createSwissEphCore(swiss, fsApi) {
  let ephePath = null;
  let initialized = false;
  function prepare(zodiac) {
    if (zodiac !== 'tropical' && zodiac !== 'sidereal') throw new Error(`Unknown zodiac mode: ${zodiac}`);
    if (!initialized) {
      if (!ephePath) throw new Error('星历数据路径未配置（需由 Main 注入）');
      if (!fsApi.existsSync(ephePath)) throw new Error(`星历数据目录不存在: ${ephePath}`);
      swiss.swe_set_ephe_path(ephePath);
      initialized = true;
    }
    if (zodiac === 'sidereal') swiss.swe_set_sid_mode(SIDEREAL_MODE, 0, 0);
  }
  return {
    configure({ ephePath: nextPath } = {}) { ephePath = nextPath || null; },
    calcBody(jdUt, planetId, zodiac = 'tropical') {
      prepare(zodiac); return checked(swiss.swe_calc_ut(jdUt, planetId, zodiac === 'sidereal' ? SIDEREAL_FLAGS : TROPICAL_FLAGS), `星历计算失败 (planetId=${planetId})`);
    },
    houses(jdUt, lat, lng, hsysCode, zodiac = 'tropical') {
      prepare(zodiac); return checked(zodiac === 'sidereal'
        ? swiss.swe_houses_ex(jdUt, SIDEREAL_HOUSE_FLAGS, lat, lng, hsysCode)
        : swiss.swe_houses(jdUt, lat, lng, hsysCode), '宫位计算失败');
    },
    julDay(year, month, day, hour) { return swiss.swe_julday(year, month, day, hour, swiss.SE_GREG_CAL); },
    close() { if (initialized) swiss.swe_close(); initialized = false; },
  };
}
```

Keep the existing module methods by creating one singleton with the real
`swisseph` and `fs`; export the singleton plus `createSwissEphCore`. Define
`checked(result, label)` to throw `${label}: ${result.error}` when present.

- [ ] **Step 5: Pass zodiac through the adapter once**

In `SwissephAdapter._buildFrame`, change only these calls:

```js
const h = SwissEphCore.houses(jdUt, latitude, longitude, hsysCode, this.zodiac);
body = SwissEphCore.calcBody(jdUt, BODY_IDS[key], this.zodiac);
```

South node, sign index, degree-in-sign, houses, angles, and return/progression
frames continue deriving from these corrected normalized values.

- [ ] **Step 6: Run focused and existing domain tests**

Run:

```powershell
node --test tests/SwissephSidereal.test.js
npm test
```

Expected: spy tests PASS and all existing tropical calculations remain green.

- [ ] **Step 7: Commit**

```powershell
git add src/core/astrology/ephemeris/SwissEphConstants.js src/core/astrology/ephemeris/SwissEphCore.js src/core/astrology/ephemeris/SwissephAdapter.js tests/SwissephSidereal.test.js
git commit -m "fix(astrology): apply Lahiri sidereal calculations"
```

### Task 6: Pin Known Sidereal Values, Boundary Behavior, and Derived Strategies

**Files:**
- Create: `tests/fixtures/swisseph-lahiri-known-values.json`
- Modify: `tests/SwissephSidereal.test.js`

- [ ] **Step 1: Write the failing known-value, isolation, and derived-strategy tests**

Extend `SwissephSidereal.test.js` to load
`tests/fixtures/swisseph-lahiri-known-values.json`. Use
`SwissephAdapter.castFromInstant` at its coordinates, compare
Sun/Moon/Ascendant/MC with circular error `<= fixture.maximumAngularError`,
assert each tropical-minus-sidereal offset is `23.85322249 +/- 0.01`, and verify
the boundary sign indexes are `11` then `0`.

Add this alternating sequence:

```js
const tropicalA = cast('tropical');
const siderealA = cast('sidereal');
const tropicalB = cast('tropical');
const siderealB = cast('sidereal');
assert.deepEqual(tropicalB, tropicalA);
assert.deepEqual(siderealB, siderealA);
assert.notDeepEqual(siderealA, tropicalA);
```

Compute `solarReturn` and `progressed` with `settings.zodiac = 'sidereal'`; assert
their result metadata remains sidereal and their Sun longitudes differ from the
same tropical strategies by more than 20 degrees while return separation from
the sidereal natal Sun remains under `0.05` degrees.

- [ ] **Step 2: Run the tests and verify the pinned fixture is missing**

Run: `node --test tests/SwissephSidereal.test.js`

Expected: FAIL with `Cannot find module './fixtures/swisseph-lahiri-known-values.json'`.

- [ ] **Step 3: Add the independently generated fixture**

Create the JSON fixture with source metadata and these exact values (Swiss
Ephemeris 2.10.03, Lahiri, generated independently with `swetest` and rounded
only in assertions):

```json
{
  "ephemerisVersion": "2.10.03",
  "siderealMode": "SE_SIDM_LAHIRI",
  "instantUtc": "2000-01-01T12:00:00.000Z",
  "coordinates": { "latitude": 51.4779, "longitude": 0 },
  "maximumAngularError": 0.01,
  "tropical": { "sun": 280.36891867, "moon": 223.32375068, "ascendant": 24.26618920, "midheaven": 279.61108780 },
  "sidereal": { "sun": 256.51569618, "moon": 199.47052819, "ascendant": 0.41296672, "midheaven": 255.75786531 },
  "boundary": {
    "beforeUtc": "2026-04-14T00:00:00.000Z", "beforeSun": 359.83487266,
    "afterUtc": "2026-04-15T00:00:00.000Z", "afterSun": 0.81482742
  }
}
```

- [ ] **Step 4: Run complete domain verification**

Run:

```powershell
node --test tests/SwissephSidereal.test.js tests/AstrologyCatalog.test.js
npm test
```

Expected: known values, boundary, alternating isolation, all 20 types, and the
existing suite PASS with 0 failures.

- [ ] **Step 5: Commit**

```powershell
git add tests/fixtures/swisseph-lahiri-known-values.json tests/SwissephSidereal.test.js
git commit -m "test(astrology): pin Lahiri sidereal behavior"
```

### Task 7: Final Contract and Security Verification

**Files:**
- Test: `tests/AstrologyCatalog.test.js`
- Test: `tests/SwissephSidereal.test.js`
- Test: `tests/IpcRouterSecurity.test.js`
- Test: `tests/PreloadSubscriptions.test.js`
- Test: `src/renderer-react/features/charts/catalog.test.ts`
- Test: `src/renderer-react/features/charts/chartBoundary.test.ts`
- Test: `src/renderer-react/api/client.test.ts`

- [ ] **Step 1: Review the delivered boundary against plan 2 prerequisites**

Run:

```powershell
rg "export (type |interface |const |function ).*(ChartType|ChartRequest|NormalizedChartResult|ChartIdentity|CHART_DESCRIPTORS|normalizeChartResult)" src/renderer-react/features/charts
rg "ipcRenderer|require\(|process\." src/renderer-react/features/charts src/renderer-react/api
```

Expected: every handoff name appears once at its declared path; the second
command reports no renderer Node access (the declaration text `IpcResult` is not
a Node-access finding).

- [ ] **Step 2: Run complete verification for this increment**

Run:

```powershell
npm test
npm run test:security
npm run test:preload
npm run test:renderer
npm run typecheck
npm run build:renderer
git diff --check
```

Expected: every command exits 0; Vite builds the parser/catalog client; diff
check prints no whitespace errors.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review` and require the reviewer to check exact
20-token exhaustiveness, strict runtime parsing before feature use, duplicate
identity rejection, trusted-frame enforcement, explicit Lahiri flags on body
and house calls, tropical isolation, and absence of React page implementation.

- [ ] **Step 4: Commit review-only corrections**

When review changes are required, stage only files in this plan and commit:

```powershell
git add src/core/astrology src/renderer-react/features/charts src/renderer-react/api src/renderer-react/types tests
git commit -m "fix(charts): address contract boundary review"
```

Expected: no commit is created when review finds no corrections; otherwise the
commit contains only reviewed plan-1 files and all Step 2 commands are rerun.
