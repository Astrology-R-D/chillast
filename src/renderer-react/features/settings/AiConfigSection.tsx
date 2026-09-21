import { useEffect, useMemo, useState } from 'react';
import type { AiCatalogProvider, AiSettingsInput, AiStatus } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useAiCatalogModels } from './settingsQueries';
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
 * ai:configure（凭据由主进程 safeStorage 处理），成功后由父级 invalidate status。
 * 模型列表跟随【表单草稿】的 provider（不是持久化 status）——切换 provider 立即刷新。
 */
export function AiConfigSection({ status, providers, onSaved }: AiConfigSectionProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [modelIsCustom, setModelIsCustom] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'testing'>('idle');
  const [pendingAutoSelect, setPendingAutoSelect] = useState(false);

  const models = useAiCatalogModels(provider);

  // Initialize the form once status arrives; don't clobber user edits afterwards.
  useEffect(() => {
    if (!status) return;
    setProvider((current) => current || status.provider || 'openai');
    setModel((current) => current || status.model || '');
    setBaseUrl((current) => current || status.baseUrl || '');
    if (typeof status.temperature === 'number') setTemperature(status.temperature);
    if (typeof status.maxTokens === 'number') setMaxTokens(status.maxTokens);
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

  const modelList = models.data ?? [];
  const selectedModel = modelList.find((m) => m.id === model);
  const modelLimit = selectedModel ? selectedModel.limitOutput : FALLBACK_MAX_TOKENS;
  // 切到上限更小的模型时，已存值 clamp 到新上限（避免滑条/数字框上下文不一致）
  const effectiveMaxTokens = Math.min(maxTokens ?? modelLimit, modelLimit);

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
    };
    if (baseUrl) settings.baseUrl = baseUrl;
    if (apiKey) settings.apiKey = apiKey;
    return settings;
  }

  async function onSave() {
    setBusy('saving');
    setFeedback(null);
    try {
      await apiClient.configureAi(draft());
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
      await apiClient.testAiSettings(draft());
      setFeedback({ kind: 'success', text: t('settings.testSuccess') });
    } catch (error) {
      setFeedback({ kind: 'error', text: t('settings.testFailed', { message: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy('idle');
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-ai-config">
      <h2 id="settings-ai-config">{t('settings.aiConfig')}</h2>
      <p className="settings-hint">{t('settings.providerHint')}</p>
      <div className="settings-field">
        <label htmlFor="settings-provider">{t('settings.provider')}</label>
        <select
          id="settings-provider" className="settings-select" value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setModel('');
            setModelIsCustom(false);
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
            placeholder={t('settings.apiKeyPlaceholder')} value={apiKey}
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
      <MaxTokensControl
        value={effectiveMaxTokens}
        max={modelLimit}
        limitLabel={t('settings.maxTokensLimit', { count: modelLimit })}
        ariaLabel={t('settings.maxTokens')}
        onChange={setMaxTokens}
      />
      <div className="settings-row">
        <button type="button" disabled={busy !== 'idle'} onClick={() => { void onTest(); }}>
          {busy === 'testing' ? t('settings.testing') : t('settings.testConnection')}
        </button>
        <button type="button" disabled={busy !== 'idle' || !provider || !model} onClick={() => { void onSave(); }}>
          {busy === 'saving' ? t('settings.saving') : t('settings.save')}
        </button>
        {feedback ? <span className="settings-feedback" data-kind={feedback.kind}>{feedback.text}</span> : null}
      </div>
    </section>
  );
}
