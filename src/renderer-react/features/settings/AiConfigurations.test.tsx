import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { I18nProvider } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import { aiStreamStore, resetAiStreamStoreForTests } from '../../stores/aiStreamStore';
import type { AiSavedConfiguration } from '../../api/contracts';
import { AiConfigSection } from './AiConfigSection';
import { aiQueryKeys } from './settingsQueries';

const remote: AiSavedConfiguration = { id: 'remote', name: '日常分析', settings: { provider: 'deepseek', model: 'deepseek-flash', baseUrl: 'https://remote.example', temperature: 0.4, maxTokens: 0, maxTokensMode: 'context', contextWindow: 50000, maxOutputTokens: 12000 }, hasApiKey: true, createdAt: '', updatedAt: '' };
const local: AiSavedConfiguration = { id: 'local', name: '本地研究', settings: { provider: 'ollama', model: 'local-model', baseUrl: 'http://localhost:11434', temperature: 0.2, maxTokens: 1234 }, hasApiKey: false, createdAt: '', updatedAt: '' };
afterEach(() => { vi.restoreAllMocks(); resetAiStreamStoreForTests(); });
function setup() {
  let activeId = remote.id;
  let entries = [remote, local];
  const list = vi.spyOn(apiClient, 'listAiConfigurations').mockImplementation(async () => ({ activeId, configurations: entries }));
  vi.spyOn(apiClient, 'getAiCatalogModels').mockResolvedValue([]);
  const save = vi.spyOn(apiClient, 'saveAiConfiguration').mockImplementation(async (input) => {
    const { apiKey: _key, ...settings } = input.settings;
    const entry = { ...remote, id: input.id || 'new', name: input.name, settings };
    entries = [...entries.filter((c) => c.id !== entry.id), entry]; activeId = entry.id; return entry;
  });
  const activate = vi.spyOn(apiClient, 'activateAiConfiguration').mockImplementation(async (id) => { activeId = id; return entries.find((c) => c.id === id)!; });
  const remove = vi.spyOn(apiClient, 'removeAiConfiguration').mockImplementation(async (id) => { entries = entries.filter((c) => c.id !== id); return { activeId, configurations: entries }; });
  const testConnection = vi.spyOn(apiClient, 'testAiConfiguration').mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = () => { void client.invalidateQueries({ queryKey: aiQueryKeys.configurations }); };
  const renderView = () => render(<QueryClientProvider client={client}><I18nProvider dictionary={locale}><AiConfigSection status={undefined} providers={[{ key: 'deepseek', label: 'DeepSeek', catalogId: null, needsKey: true, modelCount: 0 }, { key: 'ollama', label: '本地', catalogId: null, needsKey: false, modelCount: 0 }]} onSaved={onSaved} /></I18nProvider></QueryClientProvider>);
  return { ...renderView(), list, save, activate, remove, testConnection, renderView };
}

test('switches saved configuration and restores all fields without exposing or re-entering keys', async () => {
  const f = setup();
  await waitFor(() => expect(screen.getByLabelText(locale.settings.configurationName)).toHaveValue(remote.name));
  expect(screen.getByLabelText(locale.settings.apiKey)).toHaveValue('');
  expect(screen.getByPlaceholderText(locale.settings.configurationKeySaved)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(locale.settings.savedConfigurations), { target: { value: local.id } });
  await waitFor(() => expect(screen.getByLabelText(locale.settings.configurationName)).toHaveValue(local.name));
  expect(f.activate).toHaveBeenCalledWith(local.id);
  expect(screen.getByLabelText(locale.settings.model)).toHaveValue('local-model');
  expect(screen.getByLabelText(locale.settings.baseUrl)).toHaveValue('http://localhost:11434');
  expect(screen.getByRole('spinbutton', { name: locale.settings.maxTokens })).toHaveValue(1234);
  f.unmount(); f.renderView();
  await waitFor(() => expect(screen.getByLabelText(locale.settings.configurationName)).toHaveValue(local.name));
});

test('requires a name and a new key for a new remote configuration, then saves and tests by configuration ID', async () => {
  const f = setup();
  await waitFor(() => expect(screen.getByLabelText(locale.settings.configurationName)).toHaveValue(remote.name));
  fireEvent.change(screen.getByLabelText(locale.settings.savedConfigurations), { target: { value: '' } });
  const save = screen.getByRole('button', { name: locale.settings.save });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText(locale.settings.configurationName), { target: { value: '备用服务' } });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText(locale.settings.apiKey), { target: { value: 'fixture-key' } });
  fireEvent.click(save);
  await waitFor(() => expect(f.save).toHaveBeenCalledWith(expect.objectContaining({ name: '备用服务', settings: expect.objectContaining({ apiKey: 'fixture-key', maxTokens: 0, contextWindow: 50000 }) })));
  await waitFor(() => expect(screen.getByLabelText(locale.settings.apiKey)).toHaveValue(''));
  fireEvent.click(screen.getByRole('button', { name: locale.settings.testConnection }));
  await waitFor(() => expect(f.testConnection).toHaveBeenCalledWith(expect.objectContaining({ id: 'new', settings: expect.not.objectContaining({ apiKey: expect.anything() }) })));
});

test('a failed switch retains the previous form and active streams prevent switching', async () => {
  const f = setup();
  await waitFor(() => expect(screen.getByLabelText(locale.settings.configurationName)).toHaveValue(remote.name));
  f.activate.mockRejectedValue(new Error('切换失败'));
  fireEvent.change(screen.getByLabelText(locale.settings.savedConfigurations), { target: { value: local.id } });
  await screen.findByText('切换失败');
  expect(screen.getByLabelText(locale.settings.configurationName)).toHaveValue(remote.name);
  aiStreamStore.setState({ active: true });
  await waitFor(() => expect(screen.getByLabelText(locale.settings.savedConfigurations)).toBeDisabled());
  expect(screen.getByText(locale.settings.configurationBusy)).toBeInTheDocument();
});
