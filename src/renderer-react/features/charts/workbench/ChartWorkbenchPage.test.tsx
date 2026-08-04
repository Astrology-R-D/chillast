import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { apiClient } from '../../../api/client';
import type { Profile } from '../../../api/contracts';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import { profileWorkspaceStore } from '../../../stores/profileWorkspace';
import { CHART_DESCRIPTORS } from '../catalog';
import { CHART_TYPES, type ChartReferenceData, type NormalizedChartResult } from '../contracts';
import { DEFAULT_ASPECTS } from './chartDraft';
import { ChartWorkbenchPage } from './ChartWorkbenchPage';

const profile = (id: string): Profile => ({
  id, nameZh: id, nameEn: id, gender: 'other', notes: '', tags: [],
  birthData: { year: 2000, month: 1, day: 1, hour: 0, minute: 0, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const profiles = [profile('p1'), profile('p2')];
const catalog = CHART_TYPES.map((type) => ({ type, nameZh: type, nameEn: type, category: CHART_DESCRIPTORS[type].route, requiresSecondary: CHART_DESCRIPTORS[type].requiresSecondary, options: [...CHART_DESCRIPTORS[type].serviceOptions] }));
const reference = {
  aspects: Object.fromEntries(DEFAULT_ASPECTS.map((key) => [key, { nameEn: key, nameZh: key, angle: 0, defaultOrb: 5, level: 'major', glyph: '*' }])),
  houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: '普拉西德' }], chartTypes: catalog,
  signs: [], points: {}, elements: {}, modalities: {},
} as unknown as ChartReferenceData;
const result = {
  resultId: 'result', identities: [], meta: { type: 'natal', typeNameZh: '本命盘', title: '计算成功', subtitle: '摘要', settings: { houseSystem: 'placidus', zodiac: 'tropical' }, generatedAt: '2026-01-01T00:00:00.000Z', instantUtc: null },
  subjects: [], houses: [], angles: {}, rings: [], aspects: [], distributions: { elements: {}, modalities: {} },
} as unknown as NormalizedChartResult;

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}

function setup(route: 'personal' | 'relationship', availableProfiles = profiles) {
  vi.spyOn(apiClient, 'listProfiles').mockResolvedValue(availableProfiles);
  vi.spyOn(apiClient, 'getChartCatalog').mockResolvedValue(catalog);
  vi.spyOn(apiClient, 'getChartReference').mockResolvedValue(reference);
  const compute = vi.spyOn(apiClient, 'computeChart').mockResolvedValue(result);
  const store = createChartWorkspaceStore(storage());
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

test('retains intent when the atomic draft application throws', async () => {
  profileWorkspaceStore.getState().openChart({ route: 'personal', chartType: 'natal', primaryProfileId: 'p1' });
  const { store, compute } = setup('personal');
  const original = store.getState().initializeRoute;
  store.setState({ initializeRoute: vi.fn(() => { throw new Error('write failed'); }) });
  await waitFor(() => expect(profileWorkspaceStore.getState().chartIntent).not.toBeNull());
  expect(compute).not.toHaveBeenCalled();
  store.setState({ initializeRoute: original });
});
