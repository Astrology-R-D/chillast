import { useEffect, useMemo, useRef, useState } from 'react';
import { modelTokenLimits } from '@chillast/token-budget';
import type { AiCatalogProvider, AiSavedConfiguration, AiSettingsInput, AiStatus } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useAiCatalogModels, useAiConfigurations } from './settingsQueries';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import { MaxTokensControl } from './MaxTokensControl';

const FALLBACK_MAX_TOKENS = 8192;

interface AiConfigSectionProps {
  status: AiStatus | undefined;
  providers: AiCatalogProvider[] | undefined;
  onSaved(): void;
}

const CUSTOM_MODEL = '__custom__';

/**
 * AI 配置区。未提交的表单值保留在本地 state（迁移设计 §11）；保存走
 * ai:configurations:save（凭据由主进程 safeStorage 处理），成功后刷新配置与 status。
 * 模型列表跟随【表单草稿】的 provider（不是持久化 status）——切换 provider 立即刷新。
 */
export function AiConfigSection({ status, providers, onSaved }: AiConfigSectionProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState('');
  const configurations = useAiConfigurations();
  const streamActive = useAiStreamStore((state) => state.active);
  const [selectedId, setSelectedId] = useState('');
  const [configurationName, setConfigurationName] = useState('');
  const configurationsInitialized = useRef(false);
  const draftTouched = useRef(false);
  const [model, setModel] = useState('');
  const [modelIsCustom, setModelIsCustom] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [maxTokensMode, setMaxTokensMode] = useState<'custom' | 'context'>('custom');
  const [contextWindow, setContextWindow] = useState(0);
  const [maxOutputTokens, setMaxOutputTokens] = useState(0);
  const initialized = useRef(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'testing' | 'switching' | 'deleting'>('idle');
  const [pendingAutoSelect, setPendingAutoSelect] = useState(false);

  const models = useAiCatalogModels(provider);

  function loadConfiguration(entry: AiSavedConfiguration) {
    initialized.current = true;
    setSelectedId(entry.id); setConfigurationName(entry.name);
    setProvider(entry.settings.provider); setModel(entry.settings.model); setModelIsCustom(false);
    setBaseUrl(entry.settings.baseUrl || ''); setTemperature(entry.settings.temperature ?? 0.7);
    setMaxTokens(entry.settings.maxTokens ?? 0); setMaxTokensMode(entry.settings.maxTokensMode ?? 'custom');
    setContextWindow(entry.settings.contextWindow ?? 0); setMaxOutputTokens(entry.settings.maxOutputTokens ?? 0);
    setApiKey(''); setPendingAutoSelect(false);
  }
  useEffect(() => {
    if (!configurations.data || configurationsInitialized.current) return;
    configurationsInitialized.current = true;
    const active = configurations.data.configurations.find((c) => c.id === configurations.data!.activeId);
    if (active && !draftTouched.current) loadConfiguration(active);
  }, [configurations.data]);

  // Initialize the form once status arrives; don't clobber user edits afterwards.
  useEffect(() => {
    if (!status || initialized.current || draftTouched.current) return;
    initialized.current = true;
    setProvider((current) => current || status.provider || 'openai');
    setModel((current) => current || status.model || '');
    setBaseUrl((current) => current || status.baseUrl || '');
    if (typeof status.temperature === 'number') setTemperature(status.temperature);
    if (typeof status.maxTokens === 'number') setMaxTokens(status.maxTokens);
    setMaxTokensMode(status.maxTokensMode ?? 'custom');
    setContextWindow(status.contextWindow ?? 0);
    setMaxOutputTokens(status.maxOutputTokens ?? 0);
  }, [status]);

  // 对齐老层 _onProviderChange：用户切换 provider 后，新目录到货即选中第一个模型
  // （程序化选中，不抢焦点）；空目录则保持自由输入。仅用户切换触发，不影响
  // 初次加载时已存的 model 选择。
  useEffect(() => {
    if (!pendingAutoSelect || !models.data) return;
    setPendingAutoSelect(false);
    if (models.data.length > 0) {
      setModel(models.data[0].id);
      setModelIsCustom(false);
    }
  }, [pendingAutoSelect, models.data]);

  const providerNeedsKey = useMemo(
    () => !(providers ?? []).some((p) => p.key === provider && !p.needsKey),
    [providers, provider],
  );
  const saved = configurations.data?.configurations.find((c) => c.id === selectedId);
  const hasStoredKey = Boolean(saved?.hasApiKey && saved.settings.provider === provider && (saved.settings.baseUrl || '') === baseUrl.trim());
  const keyValid = !providerNeedsKey || Boolean(apiKey.trim()) || hasStoredKey;

  const modelList = models.data ?? [];
  const selectedModel = modelList.find((m) => m.id === model);
  const limits = modelTokenLimits({ provider, model, contextWindow, maxOutputTokens }, selectedModel);
  const modelLimit = limits.output || Math.max(FALLBACK_MAX_TOKENS, maxTokens ?? 0);
  // 切到上限更小的模型时，已存值 clamp 到新上限（避免滑条/数字框上下文不一致）
  const effectiveMaxTokens = Math.min(maxTokens ?? modelLimit, modelLimit);
  const budgetValid = maxTokensMode !== 'context' || limits.context > 1024;

  const modelOptions = modelList.map((m) => ({
    value: m.id,
    label: `${m.name} · ${m.limitContext} ctx · ${m.costInput}/${m.costOutput} $/M`,
  }));

  function draft(): AiSettingsInput {
    const settings: AiSettingsInput = {
      provider,
      model,
      temperature,
      maxTokens: effectiveMaxTokens,
      maxTokensMode,
      contextWindow,
      maxOutputTokens,
    };
    settings.baseUrl = baseUrl; // 显式带上空值——否则主进程合并会保留旧地址，无法真正清空
    if (apiKey) settings.apiKey = apiKey;
    return settings;
  }

  async function onSave() {
    setBusy('saving');
    setFeedback(null);
    try {
      const entry = await apiClient.saveAiConfiguration({ ...(selectedId ? { id: selectedId } : {}), name: configurationName.trim(), settings: draft() });
      loadConfiguration(entry);
      setFeedback({ kind: 'success', text: t('settings.saved') });
      setApiKey('');
      onSaved();
    } catch (error) {
      setFeedback({ kind: 'error', text: t('settings.saveFailed', { message: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy('idle');
    }
  }

  async function onTest() {
    setBusy('testing');
    setFeedback(null);
    try {
      await apiClient.testAiConfiguration({ ...(selectedId ? { id: selectedId } : {}), name: configurationName || '连接测试', settings: draft() });
      setFeedback({ kind: 'success', text: t('settings.testSuccess') });
    } catch (error) {
      setFeedback({ kind: 'error', text: t('settings.testFailed', { message: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy('idle');
    }
  }

  async function switchConfiguration(id: string) {
    if (!id) {
      setSelectedId(''); setConfigurationName(''); setApiKey(''); setFeedback(null);
      draftTouched.current = true;
      return;
    }
    setBusy('switching'); setFeedback(null);
    try {
      const entry = await apiClient.activateAiConfiguration(id);
      loadConfiguration(entry); onSaved();
      setFeedback({ kind: 'success', text: t('settings.configurationSwitched', { name: entry.name }) });
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy('idle'); }
  }
  async function removeConfiguration(id: string) {
    setBusy('deleting'); setFeedback(null);
    try { await apiClient.removeAiConfiguration(id); onSaved(); }
    catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy('idle'); }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-ai-config">
      <h2 id="settings-ai-config">{t('settings.aiConfig')}</h2>
      <p className="settings-hint">{t('settings.providerHint')}</p>
      {streamActive && <p role="status" className="settings-hint">{t('settings.configurationBusy')}</p>}
      {configurations.error && <p role="alert">{String(configurations.error.message)}</p>}
      <fieldset className="settings-configuration-form" disabled={busy !== 'idle' || streamActive} onChangeCapture={() => { draftTouched.current = true; }}>
      <div className="settings-field">
        <label htmlFor="settings-saved-configuration">{t('settings.savedConfigurations')}</label>
        <select id="settings-saved-configuration" className="settings-select" value={selectedId} onChange={(event) => { void switchConfiguration(event.target.value); }}>
          <option value="">{t('settings.newConfiguration')}</option>
          {(configurations.data?.configurations ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.settings.model}</option>)}
        </select>
      </div>
      <div className="settings-field"><label htmlFor="settings-configuration-name">{t('settings.configurationName')}</label>
        <input id="settings-configuration-name" className="settings-input" value={configurationName} maxLength={64} placeholder={t('settings.configurationNamePlaceholder')} onChange={(event) => setConfigurationName(event.target.value)} />
      </div>
      <div className="settings-field">
        <label htmlFor="settings-provider">{t('settings.provider')}</label>
        <select
          id="settings-provider" className="settings-select" value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setApiKey(''); setBaseUrl('');
            setModel('');
            setModelIsCustom(false);
            setContextWindow(0); setMaxOutputTokens(0);
            setPendingAutoSelect(true); // 目录到货后选中第一个模型（对齐老层）
          }}
        >
          {(providers ?? []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div className="settings-field">
        <label htmlFor="settings-model">{t('settings.model')}</label>
        {modelList.length > 0 ? (
          <select
            id="settings-model" className="settings-select"
            value={modelIsCustom ? CUSTOM_MODEL : model}
            onChange={(event) => {
              if (event.target.value === CUSTOM_MODEL) { setModelIsCustom(true); setModel(''); return; }
              setModelIsCustom(false);
              setModel(event.target.value);
            }}
          >
            {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            {model && !modelList.some((item) => item.id === model) && !modelIsCustom && <option value={model}>{model}</option>}
            <option value={CUSTOM_MODEL}>{t('settings.catalogCustom')}</option>
          </select>
        ) : (
          <input
            id="settings-model" className="settings-input" value={model}
            placeholder={t('settings.customModelPlaceholder')}
            onChange={(event) => setModel(event.target.value)}
          />
        )}
      </div>
      {modelIsCustom ? (
        <div className="settings-field">
          <label htmlFor="settings-model-custom">{t('settings.customModelPlaceholder')}</label>
          <input
            id="settings-model-custom" className="settings-input" value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>
      ) : null}
      {providerNeedsKey ? (
        <div className="settings-field">
          <label htmlFor="settings-api-key">{t('settings.apiKey')}</label>
          <input
            id="settings-api-key" className="settings-input" type="password"
            placeholder={t(hasStoredKey ? 'settings.configurationKeySaved' : 'settings.apiKeyPlaceholder')} value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>
      ) : null}
      <div className="settings-field">
        <label htmlFor="settings-base-url">{t('settings.baseUrl')}</label>
        <input
          id="settings-base-url" className="settings-input" value={baseUrl}
          placeholder={t('settings.baseUrlPlaceholder')}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </div>
      <div className="settings-field">
        <label htmlFor="settings-temperature">{t('settings.temperature')}</label>
        <span className="settings-field-control">
          <input
            id="settings-temperature" type="range" min={0} max={1} step={0.1} value={temperature}
            onChange={(event) => setTemperature(Number(event.target.value))}
          />
          <span className="maxtokens__value">{temperature}</span>
        </span>
      </div>
      <div className="settings-field">
        <label htmlFor="settings-token-mode">{t('settings.tokenMode')}</label>
        <select id="settings-token-mode" className="settings-select" value={maxTokensMode} onChange={(event) => {
          const next = event.target.value as 'custom' | 'context';
          setMaxTokensMode(next); if (next === 'context') setMaxTokens(0);
        }}><option value="custom">{t('settings.tokenCustom')}</option><option value="context">{t('settings.tokenContext')}</option></select>
      </div>
      <MaxTokensControl
        value={effectiveMaxTokens}
        max={modelLimit}
        min={0}
        unbounded={!limits.output}
        limitLabel={limits.output ? t('settings.maxTokensLimit', { count: limits.output }) : t('settings.tokenUnknown')}
        ariaLabel={t('settings.maxTokens')}
        onChange={setMaxTokens}
      />
      <p className="settings-hint">{t('settings.tokenZeroHint')}</p>
      <details className="settings-token-parameters" open={maxTokensMode === 'context' || undefined}>
        <summary>{t('settings.tokenParameters')}</summary>
        <p className="settings-hint">{t('settings.tokenParametersHint', { context: limits.context || '—', output: limits.output || '—' })}</p>
        <div className="settings-field"><label htmlFor="settings-context-window">{t('settings.contextWindow')}</label><input id="settings-context-window" className="settings-input" type="number" min={0} step={1} value={contextWindow} onChange={(event) => setContextWindow(Math.max(0, Math.floor(Number(event.target.value) || 0)))} /></div>
        <div className="settings-field"><label htmlFor="settings-output-limit">{t('settings.outputLimit')}</label><input id="settings-output-limit" className="settings-input" type="number" min={0} step={1} value={maxOutputTokens} onChange={(event) => setMaxOutputTokens(Math.max(0, Math.floor(Number(event.target.value) || 0)))} /></div>
      </details>
      {maxTokensMode === 'context' && <p className="settings-hint" role={budgetValid ? undefined : 'alert'}>{t(budgetValid ? 'settings.tokenContextHint' : 'settings.tokenContextRequired')}</p>}
      <div className="settings-row">
        <button type="button" disabled={busy !== 'idle' || !budgetValid || !keyValid} onClick={() => { void onTest(); }}>
          {busy === 'testing' ? t('settings.testing') : t('settings.testConnection')}
        </button>
        <button type="button" disabled={busy !== 'idle' || !provider || !model || !budgetValid || !configurationName.trim() || !keyValid} onClick={() => { void onSave(); }}>
          {busy === 'saving' ? t('settings.saving') : t('settings.save')}
        </button>
        {feedback ? <span className="settings-feedback" data-kind={feedback.kind}>{feedback.text}</span> : null}
      </div>
      <details className="settings-configuration-list"><summary>{t('settings.manageConfigurations')}</summary>
        {(configurations.data?.configurations ?? []).map((c) => <div className="settings-configuration-item" key={c.id}>
          <span><strong>{c.name}</strong><small>{c.settings.provider} · {c.settings.model}{c.id === configurations.data?.activeId ? ` · ${t('settings.configurationActive')}` : ''}</small></span>
          <button type="button" disabled={c.id === configurations.data?.activeId} onClick={() => { void switchConfiguration(c.id); }}>{t('settings.configurationUse')}</button>
          <button type="button" disabled={c.id === configurations.data?.activeId} onClick={() => { void removeConfiguration(c.id); }}>{t('settings.configurationDelete')}</button>
        </div>)}
      </details>
      </fieldset>
    </section>
  );
}
