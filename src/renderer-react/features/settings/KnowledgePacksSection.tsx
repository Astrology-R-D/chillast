import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { AiInitProgress, KnowledgePackPreview } from '../../api/contracts';

const packKey = ['ai', 'knowledge-packs'] as const;
export function KnowledgePacksSection({ onChanged }: { onChanged(): void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: packKey, queryFn: apiClient.listKnowledgePacks });
  const [preview, setPreview] = useState<KnowledgePackPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AiInitProgress | null>(null);
  useEffect(() => apiClient.onKnowledgeProgress(setProgress), []);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setProgress(null); setError(''); setMessage('正在准备知识库，请稍候…');
    try { await operation(); setMessage(success); await client.invalidateQueries({ queryKey: packKey }); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setMessage(''); }
    finally { setBusy(false); }
  }
  const groups = new Map<string, NonNullable<typeof query.data>['packs']>();
  for (const pack of query.data?.packs || []) groups.set(pack.id, [...(groups.get(pack.id) || []), pack]);
  return <section className="settings-section" aria-labelledby="settings-knowledge-packs">
    <h2 id="settings-knowledge-packs">可插拔知识库</h2>
    <p className="settings-hint">导入预准备器导出的 .kbpack。安装后选择版本并启用；可同时使用多个知识包，也可切回旧版本。</p>
    {query.data && <label className="settings-row"><input type="checkbox" checked={query.data.builtinEnabled} disabled={busy} onChange={(event) => { void action(() => apiClient.setBuiltinKnowledgeEnabled(event.target.checked), '默认知识库状态已更新'); }} />使用原有内建知识库（保留旧索引中的资料）</label>}
    <div className="settings-row"><button type="button" disabled={busy} onClick={() => { void action(async () => setPreview(await apiClient.chooseKnowledgePack()), '请选择是否安装所选知识包'); }}>导入知识包</button></div>
    {preview && <div className="knowledge-pack-preview">
      <strong>{preview.manifest.name} · v{preview.manifest.version}</strong>
      <p>{preview.manifest.description}</p><p>{preview.manifest.documentCount} 份文档 · {preview.manifest.corpora.join('、')} · ID：{preview.manifest.id}</p>
      <button type="button" disabled={busy} onClick={() => { void action(async () => { await apiClient.installKnowledgePack(preview.token); setPreview(null); }, '知识包已安装，请选择版本并启用'); }}>安装知识包</button>
      <button type="button" disabled={busy} onClick={() => setPreview(null)}>取消</button>
    </div>}
    <div className="knowledge-pack-list">{[...groups].map(([id, versions]) => {
      const active = versions.find((v) => v.active);
      const version = selected[id] && versions.some((v) => v.version === selected[id]) ? selected[id] : active?.version || versions.at(-1)!.version;
      const chosen = versions.find((v) => v.version === version)!;
      return <div className="knowledge-pack-item" key={id}>
        <div><strong>{chosen.name}</strong><span className="settings-item-meta">{active ? `已启用 v${active.version}` : '未启用'} · {chosen.documentCount} 份文档 · {chosen.corpora.join('、')}</span><p className="settings-hint">{chosen.description}</p></div>
        <div className="settings-row"><label>版本<select aria-label={`${chosen.name}版本`} value={version} disabled={busy} onChange={(event) => setSelected((s) => ({ ...s, [id]: event.target.value }))}>{versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.active ? '（当前）' : ''}</option>)}</select></label>
          <button type="button" disabled={busy || chosen.active} onClick={() => { void action(() => apiClient.activateKnowledgePack(id, version), `已启用 ${chosen.name} v${version}`); }}>{active ? '切换版本' : '启用此版本'}</button>
          <button type="button" disabled={busy || !active} onClick={() => { void action(() => apiClient.disableKnowledgePack(id), '知识包已停用，历史引用仍保留'); }}>停用</button>
          <button type="button" disabled={busy || chosen.active} onClick={() => { void action(() => apiClient.removeKnowledgePack(id, version), '知识包版本已移除'); }}>移除此版本</button>
        </div>{chosen.error && <p className="settings-feedback" data-kind="error">{chosen.error}</p>}
      </div>;
    })}</div>
    {query.error && <p className="settings-feedback" data-kind="error">知识包管理不可用，请重启软件后重试。</p>}
    {(error || message) && <p role="status" className="settings-feedback" data-kind={error ? 'error' : 'success'}>{error || message}</p>}
    {busy && progress?.phase === 'indexing' && <div className="knowledge-pack-progress"><progress aria-label="知识包索引进度" value={progress.done} max={progress.total} /><span>正在建立检索索引：{progress.done} / {progress.total}</span></div>}
    {busy && progress?.phase === 'model' && <p className="settings-hint">正在加载嵌入模型{progress.percent !== undefined ? `：${progress.percent}%` : '…'}</p>}
  </section>;
}
