import { useRef } from 'react';
import type { KnowledgeDoc } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

interface KnowledgeSectionProps {
  docs: KnowledgeDoc[] | undefined;
  onChanged(): void;
}

/** 知识库：内置 + 用户文档。导入用 HTML file input + Electron File.path（老层机制）。 */
export function KnowledgeSection({ docs, onChanged }: KnowledgeSectionProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const builtin = (docs ?? []).filter((d) => d.source === 'builtin');
  const user = (docs ?? []).filter((d) => d.source === 'user');

  async function onImport(files: FileList | null) {
    if (!files || !files.length) return;
    // Electron extends File with `path` (absolute filesystem path). If a future
    // Electron drops it, switch the preload to expose webUtils.getPathForFile.
    const paths = Array.from(files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((p): p is string => !!p);
    if (!paths.length) return;
    try {
      await apiClient.importKnowledgeDocs(paths);
      onChanged();
    } catch { /* 主进程信封错误经 apiClient 抛出；静默避免打断列表操作 */ }
  }

  async function onRemove(doc: KnowledgeDoc) {
    if (!window.confirm(t('settings.removeConfirm', { name: doc.name }))) return;
    try {
      await apiClient.removeKnowledgeDoc(doc.id);
      onChanged();
    } catch { /* best-effort */ }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-knowledge">
      <h2 id="settings-knowledge">{t('settings.knowledge')}</h2>
      <p className="settings-hint">{t('settings.builtinDocs', { count: builtin.length })}</p>
      <div className="settings-list">
        {builtin.map((doc) => (
          <div key={doc.id} className="settings-list-item">
            <span><span className="settings-item-name">{doc.name}</span><span className="settings-item-meta">builtin</span></span>
          </div>
        ))}
      </div>
      <p className="settings-hint">{t('settings.userDocs', { count: user.length })}</p>
      <div className="settings-list">
        {user.map((doc) => (
          <div key={doc.id} className="settings-list-item">
            <span><span className="settings-item-name">{doc.name}</span><span className="settings-item-meta">user</span></span>
            <button type="button" onClick={() => { void onRemove(doc); }}>{t('settings.removeDoc')}</button>
          </div>
        ))}
      </div>
      <input
        ref={fileInputRef} type="file" accept=".md,.txt,.pdf" multiple hidden
        onChange={(event) => { void onImport(event.target.files); event.target.value = ''; }}
      />
      <div className="settings-row">
        <button type="button" onClick={() => fileInputRef.current?.click()}>{t('settings.importDocs')}</button>
      </div>
    </section>
  );
}
