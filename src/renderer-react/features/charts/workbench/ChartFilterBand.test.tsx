import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import type { Profile } from '../../../api/contracts';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore } from '../../../stores/chartWorkspace';
import { CHART_DESCRIPTORS } from '../catalog';
import { CHART_TYPES, type ChartReferenceData, type ChartType } from '../contracts';
import { DEFAULT_ASPECTS, createDefaultDraft, type ChartDraft } from './chartDraft';
import { ChartFilterBand } from './ChartFilterBand';

const profile = (id: string): Profile => ({
  id, nameZh: id, nameEn: id, gender: 'other', notes: '', tags: [],
  birthData: { year: 2000, month: 1, day: 1, hour: 0, minute: 0, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const profiles = [profile('p1'), profile('p2')];
const reference = {
  aspects: Object.fromEntries(DEFAULT_ASPECTS.map((key, index) => [key, { nameEn: key, nameZh: `相位${index}`, angle: 0, defaultOrb: 5, level: index < 5 ? 'major' : 'minor', glyph: '*' }])),
  houseSystems: [{ value: 'placidus', nameEn: 'Placidus', nameZh: '普拉西德' }],
  chartTypes: CHART_TYPES.map((type) => ({ type, nameZh: type, nameEn: type, category: CHART_DESCRIPTORS[type].route, requiresSecondary: CHART_DESCRIPTORS[type].requiresSecondary, options: [...CHART_DESCRIPTORS[type].serviceOptions] })),
  signs: [], points: {}, elements: {}, modalities: {},
} as unknown as ChartReferenceData;

function makeStorage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, clear: () => data.clear(), getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null, removeItem: (key) => data.delete(key), setItem: (key, value) => data.set(key, value) };
}

function draftFor(type: ChartType): ChartDraft {
  const route = CHART_DESCRIPTORS[type].route;
  return { ...createDefaultDraft(route, {
    now: new Date(2026, 7, 2, 12, 34), profiles, reference, persistedPrimaryId: 'p1', recentSecondaryIds: ['p2'], toInstant: String,
  }), type };
}

function renderBand(draft: ChartDraft, overrides: Partial<React.ComponentProps<typeof ChartFilterBand>> = {}) {
  const store = createChartWorkspaceStore(makeStorage());
  const props = {
    route: draft.route, draft, profiles, reference,
    validation: { valid: true, fieldErrors: {} }, status: 'idle' as const, equivalentInFlight: false,
    onPatch: vi.fn(), onCalculate: vi.fn(), onReset: vi.fn(), onCancel: vi.fn(), ...overrides,
  };
  render(<I18nProvider dictionary={dictionary}>
    <ChartWorkspaceProvider store={store}><ChartFilterBand {...props} /></ChartWorkspaceProvider>
  </I18nProvider>);
  return props;
}

describe('chart filter band', () => {
  test.each(CHART_TYPES)('renders descriptor controls for %s in stable order', (type) => {
    renderBand(draftFor(type));
    const band = screen.getByRole('group', { name: '星盘筛选' });
    const labels = within(band).getAllByTestId('chart-filter-control').map((node) => node.getAttribute('data-control'));
    const expected = ['primaryProfile', 'chartType', ...CHART_DESCRIPTORS[type].controls, 'houseSystem', 'zodiac', 'advanced', 'calculate'];
    expect(labels).toEqual(expected);
    expect(Boolean(screen.queryByLabelText('第二档案'))).toBe(CHART_DESCRIPTORS[type].requiresSecondary);
    expect(Boolean(screen.queryByLabelText('目标日期时间'))).toBe(CHART_DESCRIPTORS[type].controls.some((control) => control === 'targetDate'));
    expect(Boolean(screen.queryByLabelText('返照年份'))).toBe(CHART_DESCRIPTORS[type].controls.some((control) => control === 'returnYear'));
    expect(Boolean(screen.queryByLabelText('迁移地点'))).toBe(CHART_DESCRIPTORS[type].controls.some((control) => control === 'relocationPlace'));
  });

  test('requires two distinct relationship profiles and keeps field errors beside controls', () => {
    renderBand(draftFor('synastry'), {
      profiles: [profiles[0]],
      validation: { valid: false, fieldErrors: { secondaryProfileId: '关系盘需要两个不同档案' } },
    });
    expect(screen.getByRole('button', { name: '计算' })).toBeDisabled();
    expect(screen.getByText('关系盘需要两个不同档案')).toBeInTheDocument();
  });

  test('reset never calculates and edits only publish patches', async () => {
    const user = userEvent.setup();
    const props = renderBand(draftFor('natal'));
    await user.selectOptions(screen.getByLabelText('黄道'), 'sidereal');
    expect(props.onPatch).toHaveBeenCalledWith({ zodiac: 'sidereal' });
    await user.click(screen.getByRole('button', { name: '重置筛选' }));
    expect(props.onReset).toHaveBeenCalledOnce();
    expect(props.onCalculate).not.toHaveBeenCalled();
  });

  test('advanced shows ten aspects, toggles enabled values, resets, and surfaces orb errors', async () => {
    const user = userEvent.setup();
    const props = renderBand(draftFor('natal'), {
      validation: { valid: false, fieldErrors: { advancedAspects: '相位或容许度无效' } },
    });
    await user.click(screen.getByRole('button', { name: '高级相位' }));
    const dialog = screen.getByRole('dialog', { name: '高级相位' });
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(10);
    await user.click(within(dialog).getAllByRole('checkbox')[0]);
    expect(props.onPatch).toHaveBeenCalledWith({ enabledAspects: DEFAULT_ASPECTS.slice(1) });
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0], { target: { value: '16' } });
    expect(props.onPatch).toHaveBeenCalledWith({ orbOverrides: { conjunction: 16 } });
    expect(within(dialog).getByText('相位或容许度无效')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '重置相位' }));
    expect(props.onPatch).toHaveBeenCalledWith({ enabledAspects: [...DEFAULT_ASPECTS], orbOverrides: {} });
  });

  test('equivalent unresolved submission disables only Calculate while controls remain usable', () => {
    renderBand(draftFor('natal'), { status: 'loading', equivalentInFlight: true });
    expect(screen.getByRole('button', { name: '计算' })).toBeDisabled();
    expect(screen.getByLabelText('主档案')).toBeEnabled();
    expect(screen.getByLabelText('星盘类型')).toBeEnabled();
  });
});
