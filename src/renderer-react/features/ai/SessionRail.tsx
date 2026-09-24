import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import { aiStreamStore, useAiStreamStore } from '../../stores/aiStreamStore';

/** 会话侧栏（三模式共享，spec §2/§6）：搜索（渲染层过滤）/置顶/重命名/删除/新建。 */
export function SessionRail() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const activeSessionId = useAiStreamStore((state) => state.activeSessionId);
  const streamActive = useAiStreamStore((state) => state.active);
  const sessionsQuery = useQuery({ queryKey: ['ai-sessions'], queryFn: apiClient.listAiSessions });

  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['ai-sessions'] }); };
  const setPinned = useMutation({ mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => apiClient.setAiSessionPinned(id, pinned), onSuccess: invalidate });
  const rename = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => apiClient.renameAiSession(id, title), onSuccess: invalidate });
  // 删除当前会话时立即重选（老层 AiSidebar 同款语义）：悬空的 activeSessionId 会让主进程静默丢消息。
  const remove = useMutation({ mutationFn: (id: string) => apiClient.deleteAiSession(id), onSuccess: (_result, id) => {
    if (aiStreamStore.getState().activeSessionId !== id) { invalidate(); return; }
    const remaining = (sessionsQuery.data ?? []).filter((session) => session.id !== id);
    if (remaining.length > 0) {
      aiStreamStore.getState().setActiveSessionId(remaining[0].id);
      invalidate();
    } else {
      create.mutate();
    }
  } });
  const create = useMutation({ mutationFn: () => apiClient.createAiSession(), onSuccess: (session) => {
    aiStreamStore.getState().setActiveSessionId(session.id);
    invalidate();
  } });

  const sessions = (sessionsQuery.data ?? []).filter((session) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const label = session.title
      ?? session.messages.find((message) => message.role === 'user')?.content
      ?? '';
    return label.toLowerCase().includes(needle);
  });

  const label = (session: { title: string | null; messages: Array<{ role: string; content: string }> }): string =>
    session.title
    ?? (session.messages.find((message) => message.role === 'user')?.content ?? '').slice(0, 30)
    ?? t('ai.emptySession');

  const submitRename = (id: string) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    rename.mutate({ id, title });
  };

  return (
    <aside className="session-rail" aria-label={t('ai.history')}>
      <div className="session-rail__top">
        <input type="search" role="searchbox" className="session-rail__search"
          placeholder={t('ai.searchSessions')} value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="session-rail__new" disabled={streamActive}
          onClick={() => create.mutate()}>{t('ai.newChat')}</button>
      </div>
      <ul className="session-rail__list">
        {sessions.length === 0 && <li className="session-rail__empty">{t('ai.noSessions')}</li>}
        {sessions.map((session) => (
          <li key={session.id} className={`session-rail__item${session.id === activeSessionId ? ' is-active' : ''}`}
            data-pinned={session.pinned ? 'true' : undefined}
            data-forked={session.forkedFrom ? 'true' : undefined}>
            {renamingId === session.id ? (
              <input className="session-rail__rename" role="textbox" aria-label={t('ai.renameSession')}
                value={renameDraft} autoFocus
                onChange={(event) => setRenameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitRename(session.id);
                  if (event.key === 'Escape') setRenamingId(null);
                }}
                onBlur={() => submitRename(session.id)} />
            ) : (
              <button type="button" className="session-rail__select" disabled={streamActive}
                onClick={() => aiStreamStore.getState().setActiveSessionId(session.id)}>
                {/* 标记包在子 span 里： getNodeText 只拼接直接文本子节点，避免破坏对标签的精确文本查询。 */}
                <span className="session-rail__label">{session.pinned ? <span className="session-rail__pin-mark">📌 </span> : null}{session.forkedFrom ? <span className="session-rail__fork-mark">↩ </span> : null}{label(session)}</span>
              </button>
            )}
            <div className="session-rail__actions">
              {/* aria-label 与 title 同值：按钮可见文本是图标字形（内容优先于 title 参与可访问名计算）。 */}
              <button type="button" title={session.pinned ? t('ai.unpin') : t('ai.pin')} aria-label={session.pinned ? t('ai.unpin') : t('ai.pin')} disabled={streamActive}
                onClick={() => setPinned.mutate({ id: session.id, pinned: !session.pinned })}>{session.pinned ? '📌' : '🔖'}</button>
              <button type="button" title={t('ai.rename')} aria-label={t('ai.rename')} disabled={streamActive}
                onClick={() => { setRenamingId(session.id); setRenameDraft(session.title ?? ''); }}>✎</button>
              {confirmingDeleteId === session.id
                ? <button type="button" className="session-rail__confirm-delete" disabled={remove.isPending}
                    onClick={() => { setConfirmingDeleteId(null); remove.mutate(session.id); }}>{t('ai.deleteConfirm')}</button>
                : <button type="button" title={t('ai.deleteSession')} aria-label={t('ai.deleteSession')} disabled={streamActive}
                    onClick={() => setConfirmingDeleteId(session.id)}>✕</button>}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
