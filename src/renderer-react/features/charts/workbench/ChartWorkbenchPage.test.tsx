import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { apiClient } from '../../../api/client';
import type { Profile } from '../../../api/contracts';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import { defaultWesternWorkspace, writeWesternWorkspace } from '../../../stores/chartWorkspacePersistence';
import { profileWorkspaceStore } from '../../../stores/profileWorkspace';
import { CHART_DESCRIPTORS } from '../catalog';
import { CHART_TYPES, type ChartReferenceData, type NormalizedChartResult } from '../contracts';
import { chartReference } from '../svg/chartTestFixtures';
import { createDefaultDraft, DEFAULT_ASPECTS } from './chartDraft';
import { ChartWorkbenchPage } from './ChartWorkbenchPage';

const profile = (id: string): Profile => ({
  id, nameZh: id, nameEn: id, gender: 'other', notes: '', tags: [],
  birthData: { year: 2000, month: 1, day: 1, hour: 0, minute: 0, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const profiles = [profile('p1'), profile('p2')];
const catalog = CHART_TYPES.map((type) => ({ type, nameZh: type, nameEn: type, category: CHART_DESCRIPTORS[type].route, requiresSecondary: CHART_DESCRIPTORS[type].requiresSecondary, options: [...CHART_DESCRIPTORS[type].serviceOptions] }));
const reference = {
  ...chartReference,
  aspects: Object.fromEntries(DEFAULT_ASPECTS.map((key) => [key, { nameEn: key, nameZh: key, angle: 0, defaultOrb: 5, level: 'major', glyph: '*' }])),
  houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: '普拉西德' }], chartTypes: catalog,
} as unknown as ChartReferenceData;
const result = {
  resultId: 'result', identities: [], meta: { type: 'natal', typeNameZh: '本命盘', title: '计算成功', subtitle: '摘要', settings: { houseSystem: 'placidus', zodiac: 'tropical' }, generatedAt: '2026-01-01T00:00:00.000Z', instantUtc: null },
  subjects: [], houses: [], angles: {}, rings: [], aspects: [], distributions: { elements: {}, modalities: {} },
} as unknown as NormalizedChartResult;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

function setup(route: 'personal' | 'relationship', availableProfiles = profiles, memory = storage(), providedStore?: ReturnType<typeof createChartWorkspaceStore>) {
  vi.spyOn(apiClient, 'listProfiles').mockResolvedValue(availableProfiles);
  vi.spyOn(apiClient, 'getChartCatalog').mockResolvedValue(catalog);
  vi.spyOn(apiClient, 'getChartReference').mockResolvedValue(reference);
  const compute = vi.spyOn(apiClient, 'computeChart').mockResolvedValue(result);
  const store = providedStore ?? createChartWorkspaceStore(memory);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><I18nProvider dictionary={dictionary}>
    <ChartWorkspaceProvider store={store}><ChartWorkbenchPage route={route} /></ChartWorkspaceProvider>
  </I18nProvider></QueryClientProvider>);
  return { ...view, store, compute };
}

beforeEach(() => {
  vi.restoreAllMocks();
  profileWorkspaceStore.setState({ primaryProfileId: null, recentUses: {}, chartIntent: null });
});

test.each([['personal', 'natal'], ['relationship', 'synastry']] as const)('initializes %s with %s and computes only on command', async (route, type) => {
  const user = userEvent.setup();
  const { compute } = setup(route);
  expect(await screen.findByRole('combobox', { name: '星盘类型' })).toHaveValue(type);
  await user.selectOptions(screen.getByRole('combobox', { name: '黄道' }), 'sidereal');
  expect(compute).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '计算' }));
  await screen.findByText('计算成功');
  expect(compute).toHaveBeenCalledOnce();
});

test('marks a successful result stale after edit and clears stale after revert', async () => {
  const user = userEvent.setup();
  setup('personal');
  await screen.findByRole('combobox', { name: '星盘类型' });
  await user.click(screen.getByRole('button', { name: '计算' }));
  await screen.findByText('计算成功');
  await user.selectOptions(screen.getByRole('combobox', { name: '黄道' }), 'sidereal');
  expect(screen.getByText('筛选已更改，当前显示上次计算结果。')).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: '黄道' }), 'tropical');
  expect(screen.queryByText('筛选已更改，当前显示上次计算结果。')).not.toBeInTheDocument();
});

test('keeps filters visible when no profiles exist', async () => {
  setup('personal', []);
  expect(await screen.findByRole('group', { name: '星盘筛选' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('请先创建至少一个档案。'));
  expect(screen.getByRole('button', { name: '计算' })).toBeDisabled();
});

test('renders stable disabled filter controls during startup instead of an empty band', () => {
  const pending = deferred<ChartReferenceData>();
  vi.spyOn(apiClient, 'listProfiles').mockReturnValue(new Promise(() => {}));
  vi.spyOn(apiClient, 'getChartCatalog').mockReturnValue(new Promise(() => {}));
  vi.spyOn(apiClient, 'getChartReference').mockReturnValue(pending.promise);
  vi.spyOn(apiClient, 'computeChart').mockResolvedValue(result);
  const store = createChartWorkspaceStore(storage());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><I18nProvider dictionary={dictionary}>
    <ChartWorkspaceProvider store={store}><ChartWorkbenchPage route="personal" /></ChartWorkspaceProvider>
  </I18nProvider></QueryClientProvider>);
  expect(screen.getByRole('combobox', { name: '星盘类型' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: '主档案' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '计算' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('正在加载星盘筛选…');
});

test('keeps catalog failure result-local with stable controls and retries all startup queries', async () => {
  const user = userEvent.setup();
  vi.spyOn(apiClient, 'listProfiles').mockResolvedValue(profiles);
  vi.spyOn(apiClient, 'getChartCatalog').mockResolvedValue(catalog);
  const getReference = vi.spyOn(apiClient, 'getChartReference').mockRejectedValueOnce(new Error('broken')).mockResolvedValue(reference);
  vi.spyOn(apiClient, 'computeChart').mockResolvedValue(result);
  const store = createChartWorkspaceStore(storage());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><I18nProvider dictionary={dictionary}>
    <ChartWorkspaceProvider store={store}><ChartWorkbenchPage route="personal" /></ChartWorkspaceProvider>
  </I18nProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('星盘目录加载失败：broken'));
  expect(screen.getByRole('combobox', { name: '星盘类型' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: '星盘类型' })).toBeEnabled());
  expect(getReference).toHaveBeenCalledTimes(2);
});

test('production reload prunes deleted profiles but retains trusted search-city recents', async () => {
  const memory = storage();
  const workspace = defaultWesternWorkspace();
  workspace.recents.primaryProfileIds = ['deleted', 'p1'];
  workspace.recents.secondaryProfileIds = ['p2', 'deleted'];
  workspace.recents.relocationPlaces = [{ id: '31.230400:121.473700', label: '上海 / Shanghai', latitude: 31.2304, longitude: 121.4737 }];
  writeWesternWorkspace(memory, workspace);

  const first = setup('personal', profiles, memory);
  await waitFor(() => expect(first.store.getState().workspace.recents).toMatchObject({
    primaryProfileIds: ['p1'], secondaryProfileIds: ['p2'], relocationPlaces: workspace.recents.relocationPlaces,
  }));
  first.unmount();
  const second = setup('personal', profiles, memory);
  await waitFor(() => expect(second.store.getState().workspace.recents.relocationPlaces).toEqual(workspace.recents.relocationPlaces));
});

test('invalidates edited relocation text so old coordinates cannot be submitted', async () => {
  const user = userEvent.setup();
  const { compute } = setup('personal');
  const type = await screen.findByRole('combobox', { name: '星盘类型' });
  await waitFor(() => expect(type).toBeEnabled());
  await user.selectOptions(type, 'relocation');
  const relocation = await screen.findByRole('combobox', { name: '迁移地点' });
  expect(relocation).toHaveValue('北京');
  await user.click(screen.getByRole('button', { name: '清除搜索' }));
  expect(relocation).toHaveValue('北京');
  expect(screen.getByRole('button', { name: '计算' })).toBeEnabled();
  await user.type(relocation, 'x');
  expect(screen.getByRole('button', { name: '计算' })).toBeDisabled();
  expect(compute).not.toHaveBeenCalled();
  expect(screen.getByText('请选择已解析的迁移地点')).toBeInTheDocument();
});

test('keeps intent until matching route and profiles are available, then applies before consuming without compute', async () => {
  profileWorkspaceStore.getState().openChart({ route: 'relationship', chartType: 'synastry', primaryProfileId: 'p1' });
  const personal = setup('personal');
  await screen.findByRole('group', { name: '星盘筛选' });
  expect(profileWorkspaceStore.getState().chartIntent).not.toBeNull();
  personal.unmount();

  const relationship = setup('relationship');
  await waitFor(() => expect(relationship.store.getState().routes.relationship?.draft).toMatchObject({ type: 'synastry', primaryProfileId: 'p1' }));
  expect(profileWorkspaceStore.getState().chartIntent).toBeNull();
  expect(relationship.compute).not.toHaveBeenCalled();
});

test('relationship intent atomically selects a recent secondary distinct from its new primary', async () => {
  const available = [profile('p1'), profile('p2'), profile('p3')];
  profileWorkspaceStore.setState({ primaryProfileId: null, recentUses: {}, chartIntent: {
    route: 'relationship', chartType: 'synastry', primaryProfileId: 'p2',
  } });
  const store = createChartWorkspaceStore(storage());
  store.setState({ workspace: { ...store.getState().workspace, recents: {
    ...store.getState().workspace.recents, secondaryProfileIds: ['p3', 'p1'],
  } } });
  store.getState().initializeRoute('relationship', {
    ...createDefaultDraft('relationship', { now: new Date(), profiles: available, reference, persistedPrimaryId: 'p1', recentSecondaryIds: [], toInstant: (value) => value }),
    primaryProfileId: 'p1', secondaryProfileId: 'p2',
  });
  const view = setup('relationship', available, storage(), store);

  await waitFor(() => expect(store.getState().routes.relationship?.draft).toMatchObject({
    primaryProfileId: 'p2', secondaryProfileId: 'p3',
  }));
  expect(profileWorkspaceStore.getState().chartIntent).toBeNull();
  expect(view.compute).not.toHaveBeenCalled();
});

test('relationship intent clears secondary when no distinct profile exists and stays invalid', async () => {
  profileWorkspaceStore.getState().openChart({ route: 'relationship', chartType: 'synastry', primaryProfileId: 'p2' });
  const store = createChartWorkspaceStore(storage());
  store.getState().initializeRoute('relationship', {
    ...createDefaultDraft('relationship', { now: new Date(), profiles: [profile('p2')], reference, persistedPrimaryId: 'p2', recentSecondaryIds: [], toInstant: (value) => value }),
    secondaryProfileId: 'p2',
  });
  setup('relationship', [profile('p2')], storage(), store);

  await waitFor(() => expect(store.getState().routes.relationship?.draft.secondaryProfileId).toBeNull());
  expect(screen.getByText('关系盘需要两个不同档案')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '计算' })).toBeDisabled();
  expect(profileWorkspaceStore.getState().chartIntent).toBeNull();
});

test('retains intent when the atomic draft application throws', async () => {
  profileWorkspaceStore.getState().openChart({ route: 'personal', chartType: 'natal', primaryProfileId: 'p1' });
  const { store, compute } = setup('personal');
  const original = store.getState().initializeRoute;
  store.setState({ initializeRoute: vi.fn(() => { throw new Error('write failed'); }) });
  await waitFor(() => expect(profileWorkspaceStore.getState().chartIntent).not.toBeNull());
  expect(compute).not.toHaveBeenCalled();
  store.setState({ initializeRoute: original });
});
