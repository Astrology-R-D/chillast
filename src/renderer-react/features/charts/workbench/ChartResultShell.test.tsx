import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import dictionary from '../../../../../locale/zh.json';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ChartWorkspaceProvider, createChartWorkspaceStore, type ChartRouteState } from '../../../stores/chartWorkspace';
import { setObservedSize } from '../../../test/setup';
import type { NormalizedChartResult } from '../contracts';
import { chartReference, twoRingResult } from '../svg/chartTestFixtures';
import type { ChartDraft, SubmittedChartSnapshot } from './chartDraft';
import { ChartResultShell, resultPaneMinimumPercent } from './ChartResultShell';

const draft = {
  route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
  targetLocal: '2026-08-02T12:34', returnYear: 2026, relocationPlace: null,
  houseSystem: 'placidus', zodiac: 'tropical', enabledAspects: [], orbOverrides: {},
} satisfies ChartDraft;
const submitted = {
  route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
  request: { type: 'natal', primary: { id: 'p1' }, settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
} as unknown as SubmittedChartSnapshot;
const result = {
  ...twoRingResult, resultId: 'result-1',
  meta: { type: 'natal', typeNameZh: '本命盘', title: '林岚本命盘', subtitle: '测试摘要', settings: { houseSystem: 'placidus', zodiac: 'tropical' }, generatedAt: '2026-08-02T12:35:00.000Z', instantUtc: '2026-08-02T04:34:00.000Z', firdaria: { ruler: 'Sun' }, unknown: { retained: true } },
  subjects: [{ role: 'primary', nameZh: '林岚', nameEn: 'Lan', gender: 'other', birthLabel: '2000', location: { label: '北京', latitude: 39.9, longitude: 116.4 } }],
} as unknown as NormalizedChartResult;

function routeState(patch: Partial<ChartRouteState> = {}): ChartRouteState {
  return {
    draft, submitted: null, accepted: null, lastSuccessfulResult: null, latestIssuedSequence: 0,
    activeSequence: null, requestStatus: 'idle', requestFailureKind: null, requestMessage: null,
    isStale: false, submittedDraft: null, acceptedDraft: null, ...patch,
  };
}
function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };
}
function renderShell(state: ChartRouteState, props: Partial<React.ComponentProps<typeof ChartResultShell>> = {}) {
  const store = createChartWorkspaceStore(storage());
  store.setState({ routes: { personal: state } });
  const retry = vi.fn();
  const view = render(<I18nProvider dictionary={dictionary}><ChartWorkspaceProvider store={store}>
    <div className="chart-workbench"><div className="chart-filter-band">filters</div><ChartResultShell route="personal"
      state={state} reference={chartReference} profilesAvailable validDraft onRetry={retry} onCancel={vi.fn()} {...props} /></div>
  </ChartWorkspaceProvider></I18nProvider>);
  return { ...view, store, retry, resultElement: view.container.querySelector('.chart-result')! };
}

describe('chart result shell', () => {
  test('reserves the six pixel divider when deriving exact pane minima', () => {
    const minimum = resultPaneMinimumPercent(760);
    expect(minimum).toBeCloseTo((360 / 754) * 100, 8);
    expect(((760 - 6) * minimum) / 100).toBeCloseTo(360, 8);
  });

  test('uses measured 760px boundary and pixel-derived horizontal minima', () => {
    const view = renderShell(routeState({ accepted: submitted, lastSuccessfulResult: result, requestStatus: 'success' }));
    act(() => setObservedSize(view.resultElement, { width: 760, height: 700 }));
    expect(view.resultElement).toHaveAttribute('data-orientation', 'horizontal');
    expect(view.container.querySelector('[data-panel-group-direction]')).toHaveAttribute('data-panel-group-direction', 'horizontal');
    expect(view.container.querySelector('.chart-result__chart-pane')).toHaveAttribute('data-min-percent', '47.745');
    expect(screen.getByRole('separator')).toHaveAttribute('aria-label', '调整星盘与数据区域');
    act(() => setObservedSize(view.resultElement, { width: 759, height: 700 }));
    expect(view.resultElement).toHaveAttribute('data-orientation', 'vertical');
  });

  test('preserves two 360px vertical panes plus divider and delegates overflow to the result', () => {
    const view = renderShell(routeState({ accepted: submitted, lastSuccessfulResult: result, requestStatus: 'success' }));
    act(() => setObservedSize(view.resultElement, { width: 759, height: 600 }));
    expect(view.resultElement).toHaveAttribute('data-required-extent', '726');
    expect(view.container.querySelector('.chart-result__split')).toHaveStyle({ minHeight: '726px' });
    expect(view.container.querySelector('.chart-result__chart-pane')).toHaveAttribute('data-min-percent', '50.000');
  });

  test('uses 55/45 vertical defaults with 360px chart minimum and separate persisted ratios', () => {
    const view = renderShell(routeState({ accepted: submitted, lastSuccessfulResult: result, requestStatus: 'success' }));
    act(() => setObservedSize(view.resultElement, { width: 759, height: 800 }));
    expect(view.container.querySelector('.chart-result__chart-pane')).toHaveAttribute('data-panel-size', '54.7');
    expect(view.container.querySelector('.chart-result__chart-pane')).toHaveAttribute('data-min-percent', '45.340');
    view.store.getState().setSplit('personal', 'vertical', [60, 40]);
    act(() => setObservedSize(view.resultElement, { width: 800, height: 800 }));
    view.store.getState().setSplit('personal', 'horizontal', [52, 48]);
    act(() => setObservedSize(view.resultElement, { width: 759, height: 800 }));
    expect(view.store.getState().workspace.split.personal).toEqual({ horizontal: [52, 48], vertical: [60, 40] });
  });

  test.each([
    ['empty', routeState(), '选择参数后点击“计算”查看星盘。'],
    ['profile required', routeState(), '请先创建至少一个档案。'],
    ['loading', routeState({ requestStatus: 'loading', activeSequence: 1 }), '正在计算星盘…'],
    ['parser', routeState({ requestStatus: 'error', requestFailureKind: 'parser' }), '星盘返回数据无法解析。'],
    ['ipc', routeState({ requestStatus: 'error', requestFailureKind: 'ipc' }), '无法连接星盘计算服务。'],
    ['domain', routeState({ requestStatus: 'error', requestFailureKind: 'domain' }), '当前参数无法完成星盘计算。'],
    ['cancelled', routeState({ requestStatus: 'cancelled' }), '已取消本次计算。'],
  ])('renders %s status in a polite live region', (_name, state, message) => {
    renderShell(state, { profilesAvailable: _name !== 'profile required' });
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  test('retains summary on stale loading, failure, and cancellation and exposes retry only when valid', async () => {
    const user = userEvent.setup();
    const state = routeState({ accepted: submitted, lastSuccessfulResult: result, requestStatus: 'error', requestFailureKind: 'domain', isStale: true });
    const { retry, container } = renderShell(state);
    expect(screen.getByText('林岚本命盘')).toBeInTheDocument();
    expect(screen.getByText('筛选已更改，当前显示上次计算结果。')).toBeInTheDocument();
    expect(screen.getByText(/Sun/)).toBeInTheDocument();
    expect(screen.getByText(/retained/)).toBeInTheDocument();
    expect(container.querySelector('.chart-filter-band')?.closest('.chart-result')).toBeNull();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  test('renders the successful wheel and five-tab data explorer', () => {
    const { container } = renderShell(routeState({ accepted: submitted, lastSuccessfulResult: result, requestStatus: 'success' }));
    expect(container.querySelector('.chart-result__chart-pane svg')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  test('publishes an exact outer-ring selection to the pre-Plan-4 linkage state and callback', async () => {
    const user = userEvent.setup();
    const onRevealSelection = vi.fn();
    const { container, store } = renderShell(
      routeState({ accepted: submitted, lastSuccessfulResult: result, requestStatus: 'success' }),
      { onRevealSelection },
    );
    store.getState().setActiveTab('houses');
    await user.click(container.querySelector('[data-chart-identity="transit:saturn"]')!);
    expect(store.getState()).toMatchObject({ focusedIdentity: 'transit:saturn', activeTab: 'planets' });
    expect(onRevealSelection).toHaveBeenCalledWith({ identity: 'transit:saturn', tab: 'planets' });
    expect(container.querySelector('.chart-result__data-pane')).toHaveAttribute('data-active-tab', 'planets');
  });
});
