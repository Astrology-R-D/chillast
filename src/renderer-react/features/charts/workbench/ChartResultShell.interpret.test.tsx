import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { resetAiStreamStoreForTests, aiStreamStore } from '../../../stores/aiStreamStore';
import type { ChartRouteState } from '../../../stores/chartWorkspace';
import { ChartResultShell } from './ChartResultShell';
import { twoRingResult, chartReference } from '../svg/chartTestFixtures';

const dictionary = {
  ai: { interpret: 'AI 解读' },
  chart: { workbench: { loading: '计算中', empty: '尚未计算', cancel: '取消计算', retry: '重试', profileRequired: '请先选择档案' } },
};

vi.mock('../svg/InteractiveChart', () => ({ InteractiveChart: () => null }));
vi.mock('../explorer/ChartDataExplorer', () => ({ ChartDataExplorer: () => null }));
vi.mock('./ChartResultSummary', () => ({ ChartResultSummary: () => null }));

function makeState(withResult: boolean): ChartRouteState {
  const snapshot = {
    route: 'personal', type: 'natal', primaryProfileId: 'p1', secondaryProfileId: null,
    request: { type: 'natal', settings: { houseSystem: 'placidus', zodiac: 'tropical', aspects: { enabled: [], orbOverrides: {} } }, options: {} },
  } as never;
  return {
    draft: {} as never, submitted: withResult ? snapshot : null, accepted: withResult ? snapshot : null,
    lastSuccessfulResult: withResult ? { ...twoRingResult, resultId: 'r-interpret' } as never : null,
    latestIssuedSequence: 1, activeSequence: null, requestStatus: 'success',
    requestFailureKind: null, requestMessage: null, isStale: false,
    submittedDraft: null, acceptedDraft: null,
  };
}

const props = (withResult: boolean) => ({
  route: 'personal' as const,
  state: makeState(withResult),
  reference: chartReference,
  profilesAvailable: true,
  validDraft: true,
  startupError: null,
  onRetry: vi.fn(),
  onCancel: vi.fn(),
});

beforeEach(() => {
  resetAiStreamStoreForTests();
  aiStreamStore.getState().setActiveSessionId('s-interpret');
  vi.stubGlobal('mystApi', {
    ai: {
      chat: vi.fn().mockResolvedValue({ ok: true }),
      interpret: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true }),
      removeAllListeners: vi.fn(),
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    },
  });
});

test('hidden before a chart is accepted; enabled after and triggers interpret + panel signal', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<I18nProvider dictionary={dictionary}><ChartResultShell {...props(false)} /></I18nProvider>);
  expect(screen.queryByRole('button', { name: 'AI 解读' })).not.toBeInTheDocument();

  rerender(<I18nProvider dictionary={dictionary}><ChartResultShell {...props(true)} /></I18nProvider>);
  const button = screen.getByRole('button', { name: 'AI 解读' });
  await user.click(button);
  const stream = aiStreamStore.getState();
  expect(stream.mode).toBe('chat');
  expect(stream.panelOpenSignal).toBe(1);
  expect(stream.active).toBe(true);
  expect(stream.streamKind).toBe('interpret');
});

test('disabled while a stream is active', () => {
  aiStreamStore.setState({ active: true });
  render(<I18nProvider dictionary={dictionary}><ChartResultShell {...props(true)} /></I18nProvider>);
  expect(screen.getByRole('button', { name: 'AI 解读' })).toBeDisabled();
});
