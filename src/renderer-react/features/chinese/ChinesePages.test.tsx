import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../../tests/fixtures/chinese-ui-results.json';
import locale from '../../../../locale/zh.json';
import { I18nProvider } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import { profileWorkspaceStore } from '../../stores/profileWorkspace';
import { resetChartAiContextPublisherForTests } from '../charts/context/chartAiContextPublisher';
import { ChineseAstrologyPage } from './ChineseAstrologyPage';
import { SolarTermCalendarPage } from './SolarTermCalendarPage';
import type { Profile } from '../../api/contracts';

afterEach(() => { vi.restoreAllMocks(); resetAiStreamStoreForTests(); resetChartAiContextPublisherForTests(); localStorage.removeItem('chillast.solarTermYear'); });
function setup(kind: 'bazi' | 'calendar', people = [fixture.profile as Profile]) {
  const list = vi.spyOn(apiClient, 'listProfiles').mockResolvedValue(people);
  const compute = vi.spyOn(apiClient, 'computeBazi').mockResolvedValue(fixture.bazi as never);
  const calendar = vi.spyOn(apiClient, 'getSolarTerms').mockImplementation(async (year) => ({ ...fixture.calendar, year, terms: fixture.calendar.terms.map((t) => ({ ...t, date: t.date.replace('2026', String(year).padStart(4, '0')) })) }));
  const context = vi.spyOn(apiClient, 'setAiChartContext').mockResolvedValue({});
  const onNavigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><I18nProvider dictionary={locale}>{kind === 'bazi' ? <ChineseAstrologyPage onNavigate={onNavigate} /> : <SolarTermCalendarPage />}</I18nProvider></QueryClientProvider>);
  return { ...view, list, compute, calendar, context, onNavigate };
}

test('renders all legacy Bazi panels, the correct current hour, and preserves result/profile identity', async () => {
  profileWorkspaceStore.getState().setPrimaryProfile(fixture.profile.id);
  const second = { ...fixture.profile, id: 'second', nameZh: '第二档案' } as Profile;
  const f = setup('bazi', [fixture.profile as Profile, second]);
  const generate = await screen.findByRole('button', { name: locale.chinese.generate });
  fireEvent.click(generate);
  await screen.findByRole('heading', { name: locale.chinese.tenGodsTitle });
  expect(screen.getByText('10:09:26')).toBeInTheDocument();
  expect(screen.getByText(/巳时 · 当前/)).toBeInTheDocument();
  expect(screen.getAllByRole('meter')).toHaveLength(5);
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect(screen.getByRole('heading', { name: locale.chinese.lunarTitle })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: locale.chinese.allShichen })).toBeInTheDocument();
  await waitFor(() => expect(f.context).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'chinese-chart', activeProfile: expect.objectContaining({ id: fixture.profile.id }), lastBaziData: fixture.bazi })));
  fireEvent.change(screen.getByLabelText(locale.chinese.labelProfile), { target: { value: second.id } });
  expect(screen.queryByText('10:09:26')).not.toBeInTheDocument();
  expect(screen.getByText(locale.chinese.emptyResult)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(locale.chinese.labelProfile), { target: { value: fixture.profile.id } });
  expect(screen.getByText('10:09:26')).toBeInTheDocument();
});

test('empty profiles and failed calculations show usable states without stale results', async () => {
  const f = setup('bazi', []);
  fireEvent.click(await screen.findByRole('button', { name: locale.nav.profiles }));
  expect(f.onNavigate).toHaveBeenCalledWith('profiles');
  f.unmount();
  const second = setup('bazi'); second.compute.mockRejectedValue(new Error('出生数据缺失'));
  fireEvent.click(await screen.findByRole('button', { name: locale.chinese.generate }));
  expect(await screen.findByRole('alert')).toHaveTextContent('出生数据缺失');
});

test('Bazi AI action publishes the current result and creates a session when needed', async () => {
  resetAiStreamStoreForTests();
  const chat = vi.fn().mockResolvedValue({ ok: true, data: {} });
  vi.stubGlobal('mystApi', { ai: { chat, removeAllListeners: vi.fn(), onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() } });
  vi.spyOn(apiClient, 'createAiSession').mockResolvedValue({ id: 'bazi-chat', title: null, messages: [] });
  const f = setup('bazi');
  fireEvent.click(await screen.findByRole('button', { name: locale.chinese.generate }));
  await screen.findByText('10:09:26');
  fireEvent.click(screen.getByRole('button', { name: locale.ai.interpret }));
  await waitFor(() => expect(chat).toHaveBeenCalled());
  expect(aiStreamStore.getState().activeSessionId).toBe('bazi-chat');
  expect(f.context).toHaveBeenLastCalledWith(expect.objectContaining({ chartType: 'bazi', lastBaziData: fixture.bazi }));
});

test('calendar displays all 24 terms, supports fuzzy search, month filtering, year navigation and range errors', async () => {
  localStorage.setItem('chillast.solarTermYear', '2026');
  const f = setup('calendar');
  await screen.findByText('冬至');
  expect(screen.getAllByRole('article')).toHaveLength(24);
  expect(screen.getByText(locale.tools.solarTermTimezone)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(locale.tools.searchTerms), { target: { value: 'lichun' } });
  expect(screen.getAllByRole('article')).toHaveLength(1); expect(screen.getByText('立春')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(locale.tools.searchTerms), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText(locale.tools.monthFilter), { target: { value: '10' } });
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByText('寒露')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: locale.tools.nextYear }));
  await waitFor(() => expect(f.calendar).toHaveBeenCalledWith(2027));
  expect(localStorage.getItem('chillast.solarTermYear')).toBe('2027');
  fireEvent.change(screen.getByLabelText(locale.tools.solarTermYear), { target: { value: '3001' } });
  expect(screen.getByRole('alert')).toHaveTextContent(locale.tools.yearRange);
  expect(screen.getByRole('button', { name: locale.tools.solarTermGenerate })).toBeDisabled();
});
