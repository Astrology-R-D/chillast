import { useEffect, useState } from 'react';
import type { AiMcpInfo, AiToolProviderDescriptor } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

interface ToolsAndMcpSectionProps {
  tools: AiToolProviderDescriptor[] | undefined;
  mcp: AiMcpInfo | undefined;
  onToolsChanged(): void;
  onMcpChanged(): void;
}

/** 工具开关 + MCP 增删改（行为对齐老 SettingsView：启用/保存均需 confirm）。 */
export function ToolsAndMcpSection({ tools, mcp, onToolsChanged, onMcpChanged }: ToolsAndMcpSectionProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, AiMcpInfo['servers'][string]>>({});
  const [name, setName] = useState('');
  const [transport, setTransport] = useState('stdio');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  async function saveLimits() {
    setError(''); setSaved(false);
    if (Object.values(limits).some(v => !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)))) {
      setError('调用次数须为非负整数，0 表示无限制'); return;
    }
    setSaving(true);
    try {
      await apiClient.setAiToolCallLimits(Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(v)])));
      setLimits({}); setSaved(true); onToolsChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }


  useEffect(() => {
    setDraft((mcp && mcp.servers) ? { ...mcp.servers } : {});
  }, [mcp]);

  const toolCount = mcp ? mcp.toolCount : 0;

  async function toggleProvider(id: string, enabled: boolean) {
    try {
      await apiClient.setAiToolProviderEnabled(id, enabled);
      onToolsChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function addServer() {
    const trimmedName = name.trim();
    const trimmedTarget = target.trim();
    if (!trimmedName || !trimmedTarget) { setError(t('settings.mcpAddInvalid')); return; }
    const config: AiMcpInfo['servers'][string] = { transport, enabled: false };
    if (transport === 'stdio') {
      const parts = trimmedTarget.split(/\s+/);
      config.command = parts[0];
      config.args = parts.slice(1);
    } else {
      config.url = trimmedTarget;
    }
    setDraft((current) => ({ ...current, [trimmedName]: config }));
    setName('');
    setTarget('');
    setError('');
  }

  function toggleServer(serverName: string, enabled: boolean) {
    if (enabled && !window.confirm(t('settings.mcpEnableConfirm', { name: serverName }))) return;
    setDraft((current) => ({ ...current, [serverName]: { ...current[serverName], enabled } }));
  }

  async function save() {
    if (Object.values(draft).some((c) => c && c.enabled) && !window.confirm(t('settings.mcpSaveConfirm'))) return;
    try {
      await apiClient.saveAiMcpServers(draft);
      onMcpChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-tools">
      <h2 id="settings-tools">{t('settings.toolsTitle')}</h2>
      <p className="settings-hint">{t('settings.toolsHint')}</p>
      <div className="settings-list">
        {(tools ?? []).map((provider) => (
          <div key={provider.id}>
            <label className="settings-list-item">
              <span>
                <input type="checkbox" checked={provider.enabled} disabled={provider.configurableEnabled === false}
                  onChange={event => { void toggleProvider(provider.id, event.target.checked); }} />
                <span className="settings-item-name">{provider.id}</span>
                <span className="settings-item-meta">{provider.tools.length}</span>
              </span>
            </label>
            {provider.tools.map(tool => {
              const value = limits[tool.name] ?? String(tool.callLimit ?? 32);
              const change = (next: string) => { setSaved(false); setLimits(current => ({ ...current, [tool.name]: next })); };
              return <div key={tool.name} className="tool-limit-row">
                <span title={tool.description}>{tool.name}</span>
                <label>每轮次数 <input type="number" min="0" step="1" value={value} disabled={saving || value === '0'}
                  aria-label={`${tool.name} 每轮次数`} onChange={event => change(event.target.value)} /></label>
                <label><input type="checkbox" checked={value === '0'} disabled={saving}
                  aria-label={`${tool.name} 无限制`} onChange={event => change(event.target.checked ? '0' : '32')} />无限制</label>
              </div>;
            })}
          </div>
        ))}
      </div>
      <p className="settings-hint">每个工具独立计数，默认每轮 32 次；0 表示无限制。分析与补充查证共用本轮额度，下一条用户消息重新计数。达到上限只关闭该工具；失败的执行也计数。保存后下一轮生效，新增工具自动出现在这里。</p>
      <button type="button" disabled={saving || !Object.keys(limits).length} onClick={() => { void saveLimits(); }}>{saving ? '保存中…' : '保存工具调用限制'}</button>
      {saved && <span role="status">已保存，下一轮问答生效</span>}
      <h3>{t('settings.mcpTitle')}</h3>
      <p className="settings-hint">{t('settings.mcpHint', { count: toolCount })}</p>
      <div className="settings-list">
        {Object.keys(draft).length === 0
          ? <span className="settings-hint">{t('settings.mcpEmpty')}</span>
          : Object.entries(draft).map(([serverName, config]) => (
            <div key={serverName} className="settings-list-item">
              <label>
                <input
                  type="checkbox" checked={!!config.enabled}
                  onChange={(event) => toggleServer(serverName, event.target.checked)}
                />
                <span className="settings-item-name">{serverName}</span>
              </label>
              <span className="settings-item-meta">
                {(config.transport || (config.url ? 'http' : 'stdio'))}
                {' · '}
                {config.url || [config.command, ...(config.args ?? [])].join(' ')}
              </span>
              <button type="button" onClick={() => setDraft((current) => {
                const next = { ...current }; delete next[serverName]; return next;
              })}>{t('settings.removeDoc')}</button>
            </div>
          ))}
      </div>
      <div className="settings-row">
        <input className="settings-input" placeholder={t('settings.mcpName')} value={name} onChange={(event) => setName(event.target.value)} />
        <select className="settings-select" value={transport} onChange={(event) => setTransport(event.target.value)}>
          <option value="stdio">stdio</option>
          <option value="sse">sse</option>
          <option value="http">http</option>
        </select>
        <input className="settings-input" placeholder={t('settings.mcpTargetHint')} value={target} onChange={(event) => setTarget(event.target.value)} />
        <button type="button" onClick={addServer}>{t('settings.mcpAdd')}</button>
        <button type="button" onClick={() => { void save(); }}>{t('settings.mcpSave')}</button>
      </div>
      {error ? <span className="settings-feedback" data-kind="error">{error}</span> : null}
    </section>
  );
}
