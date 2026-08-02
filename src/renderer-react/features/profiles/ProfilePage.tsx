import { useStore } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Profile, ProfileSaveInput } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { profileWorkspaceStore, type ProfileWorkspaceState } from '../../stores/profileWorkspace';
import type { RouteKey } from '../../shell/routes';
import { useDirtyNavigation } from '../../shell/DirtyNavigationProvider';
import { ProfileDetail } from './ProfileDetail';
import { ProfileDirectory } from './ProfileDirectory';
import { ProfileForm, type DraftRegistration } from './ProfileEditor';
import { profileQueryKeys, refreshProfiles, useProfiles, useRemoveProfile, useSaveProfile } from './profileQueries';
import './profiles.css';

interface ProfilePageProps {
  workspaceStore?: StoreApi<ProfileWorkspaceState>;
  onNavigate(route: RouteKey, beforeNavigate?: () => void): void;
  onCreate?: () => void;
  onEdit?: (profile: Profile) => void;
  onFormRegistration?: (registration: DraftRegistration) => void;
}

type DuplicatePhase = 'idle' | 'saving' | 'refreshing';
type EditorCommit = { profile: Profile; fingerprint: string };

function editableProfile(value: Profile | ProfileSaveInput, fallbackId = ''): unknown {
  return {
    id: value.id ?? fallbackId,
    nameZh: value.nameZh.trim(),
    nameEn: value.nameEn.trim(),
    gender: value.gender,
    birthData: value.birthData,
    notes: value.notes,
    tags: value.tags.map((tag) => tag.normalize('NFC').trim()),
  };
}

const profileFingerprint = (value: Profile | ProfileSaveInput, fallbackId = '') => JSON.stringify(editableProfile(value, fallbackId));
const profilesEquivalent = (left: Profile, right: Profile) => profileFingerprint(left) === profileFingerprint(right);

export function ProfilePage({ workspaceStore = profileWorkspaceStore, onNavigate, onCreate, onEdit, onFormRegistration }: ProfilePageProps) {
  const { t } = useI18n();
  const dirtyNavigation = useDirtyNavigation();
  const queryClient = useQueryClient();
  const profiles = useProfiles();
  const save = useSaveProfile();
  const remove = useRemoveProfile();
  const primaryId = useStore(workspaceStore, (state) => state.primaryProfileId);
  const recents = useStore(workspaceStore, (state) => state.recentUses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; profile?: Profile } | null>(null);
  const [editorCommit, setEditorCommit] = useState<EditorCommit | null>(null);
  const [committedOverlays, setCommittedOverlays] = useState<Record<string, Profile>>({});
  const [editorFocusReturn, setEditorFocusReturn] = useState<{ origin: HTMLElement | null; selectedId: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [duplicatePayload, setDuplicatePayload] = useState<ProfileSaveInput | null>(null);
  const [duplicateSavedId, setDuplicateSavedId] = useState<string | null>(null);
  const [duplicatePhase, setDuplicatePhase] = useState<DuplicatePhase>('idle');
  const [deleteSyncId, setDeleteSyncId] = useState<string | null>(null);
  const [deleteRefreshing, setDeleteRefreshing] = useState(false);
  const [focusAfterDelete, setFocusAfterDelete] = useState<string | 'create' | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const duplicateBusyRef = useRef(false);
  const duplicateTokenRef = useRef(0);
  const editorCommitRef = useRef<EditorCommit | null>(null);
  const editorGenerationRef = useRef(0);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const deleteStatusRef = useRef<HTMLParagraphElement | null>(null);
  const deletePending = remove.isPending || deleteRefreshing;

  const visibleProfiles = profiles.data && [
    ...profiles.data.map((profile) => committedOverlays[profile.id] ?? profile),
    ...Object.values(committedOverlays).filter((overlay) => !profiles.data.some(({ id }) => id === overlay.id)),
  ];

  useEffect(() => {
    if (!profiles.data) return;
    setCommittedOverlays((current) => {
      let changed = false;
      const next = { ...current };
      for (const canonical of profiles.data) {
        if (next[canonical.id] && profilesEquivalent(next[canonical.id], canonical)) { delete next[canonical.id]; changed = true; }
      }
      return changed ? next : current;
    });
    const ids = visibleProfiles?.map(({ id }) => id) ?? [];
    workspaceStore.getState().reconcileProfiles(ids);
    setSelectedId((current) => current && ids.includes(current)
      ? current
      : workspaceStore.getState().primaryProfileId ?? ids[0] ?? null);
  }, [profiles.data, workspaceStore]);

  useLayoutEffect(() => {
    if (editor) {
      pageRef.current?.querySelector<HTMLElement>('.profile-form [name="nameZh"]')?.focus();
      return;
    }
    if (!editorFocusReturn) return;
    const { origin, selectedId: returnId } = editorFocusReturn;
    const selectedRow = returnId ? [...(pageRef.current?.querySelectorAll<HTMLElement>('[data-profile-id]') ?? [])].find((element) => element.dataset.profileId === returnId) : undefined;
    const detailEdit = pageRef.current?.querySelector<HTMLElement>('.profile-detail__actions button');
    (origin?.isConnected ? origin : selectedRow ?? detailEdit ?? pageRef.current?.querySelector<HTMLElement>('[data-profile-create]'))?.focus();
    setEditorFocusReturn(null);
  }, [editor, editorFocusReturn]);

  useLayoutEffect(() => {
    if (!deleteTarget) return;
    if (deletePending) deleteStatusRef.current?.focus();
    else if (deleteError) confirmRef.current?.focus();
    else cancelRef.current?.focus();
  }, [deleteError, deletePending, deleteTarget]);

  useEffect(() => {
    if (!focusAfterDelete || deleteTarget) return undefined;
    const frame = requestAnimationFrame(() => {
      const target = focusAfterDelete === 'create'
        ? pageRef.current?.querySelector<HTMLElement>('[data-profile-create]')
        : [...(pageRef.current?.querySelectorAll<HTMLElement>('[data-profile-id]') ?? [])]
          .find((element) => element.dataset.profileId === focusAfterDelete && element.getAttribute('aria-pressed') === 'true');
      (target ?? pageRef.current?.querySelector<HTMLElement>('[data-profile-create]'))?.focus();
      setFocusAfterDelete(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [deleteTarget, focusAfterDelete]);

  const commitSelection = (id: string) => {
    editorGenerationRef.current += 1;
    setSelectedId(id);
    setEditor(null); setEditorCommit(null); editorCommitRef.current = null;
    workspaceStore.getState().recordRecentUse(id);
  };
  const select = (id: string) => { void dirtyNavigation.requestTransition(() => commitSelection(id)); };
  const selected = visibleProfiles?.find(({ id }) => id === selectedId) ?? null;
  const beginEditor = () => {
    editorGenerationRef.current += 1;
    editorTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    editorCommitRef.current = null; setEditorCommit(null); setEditorFocusReturn(null);
  };
  const openCreate = () => { void dirtyNavigation.requestTransition(() => { beginEditor(); setEditor({ mode: 'create' }); onCreate?.(); }); };
  const openEdit = (profile: Profile) => { beginEditor(); setEditor({ mode: 'edit', profile }); onEdit?.(profile); };
  const closeEditor = () => {
    editorGenerationRef.current += 1;
    const committed = editorCommitRef.current;
    if (committed) setCommittedOverlays((current) => ({ ...current, [committed.profile.id]: committed.profile }));
    setEditorFocusReturn({ origin: editorTriggerRef.current, selectedId });
    setEditor(null); setEditorCommit(null); editorCommitRef.current = null;
  };
  const requestCloseEditor = () => { void dirtyNavigation.requestTransition(closeEditor); };
  const saveEditor = async (payload: ProfileSaveInput): Promise<void> => {
    const generation = editorGenerationRef.current;
    let committed = editorCommitRef.current;
    const fingerprint = profileFingerprint(payload, committed?.profile.id);
    if (!committed || committed.fingerprint !== fingerprint) {
      const authoritative = await save.mutateAsync(payload);
      if (generation !== editorGenerationRef.current) return;
      committed = { profile: authoritative, fingerprint: profileFingerprint(payload, authoritative.id) };
      editorCommitRef.current = committed; setEditorCommit(committed);
      setCommittedOverlays((current) => ({ ...current, [authoritative.id]: authoritative }));
      setSelectedId(authoritative.id);
      setEditor({ mode: 'edit', profile: authoritative });
    }
    try {
      await refreshProfiles(queryClient);
    } catch (error) {
      if (generation !== editorGenerationRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(t('profiles.savedRefreshFailed', { message }));
    }
    if (generation !== editorGenerationRef.current) return;
    const refreshed = queryClient.getQueryData<Profile[]>(profileQueryKeys.all) ?? [];
    const canonical = refreshed.find(({ id }) => id === committed.profile.id);
    if (!canonical || !profilesEquivalent(canonical, committed.profile)) throw new Error(t('profiles.savedProfileMissing'));
    setCommittedOverlays((current) => { const next = { ...current }; delete next[committed.profile.id]; return next; });
    setSelectedId(committed.profile.id);
    workspaceStore.getState().recordRecentUse(committed.profile.id);
    setEditorFocusReturn({ origin: null, selectedId: committed.profile.id });
    setEditor(null); setEditorCommit(null); editorCommitRef.current = null;
  };
  const beginDuplicate = (phase: Exclude<DuplicatePhase, 'idle'>): number | null => {
    if (duplicateBusyRef.current) return null;
    duplicateBusyRef.current = true;
    const token = ++duplicateTokenRef.current;
    setDuplicatePhase(phase);
    return token;
  };
  const finishDuplicate = (token: number) => {
    if (token !== duplicateTokenRef.current) return;
    duplicateBusyRef.current = false;
    setDuplicatePhase('idle');
  };
  const runDuplicateRefresh = async (savedId: string, token: number) => {
    try {
      await refreshProfiles(queryClient);
      if (token !== duplicateTokenRef.current) return;
      const refreshed = queryClient.getQueryData<Profile[]>(profileQueryKeys.all) ?? [];
      if (!refreshed.some(({ id }) => id === savedId)) {
        setDuplicateError(t('profiles.savedProfileMissing'));
        return;
      }
      setSelectedId(savedId);
      workspaceStore.getState().recordRecentUse(savedId);
      setDuplicateError('');
      setDuplicatePayload(null);
      setDuplicateSavedId(null);
    } catch (error) {
      if (token !== duplicateTokenRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setDuplicateError(t('profiles.savedRefreshFailed', { message }));
    } finally {
      finishDuplicate(token);
    }
  };
  const refreshDuplicate = (savedId: string) => {
    const token = beginDuplicate('refreshing');
    if (token === null) return;
    void runDuplicateRefresh(savedId, token);
  };
  const runDuplicate = async (payload: ProfileSaveInput) => {
    const token = beginDuplicate('saving');
    if (token === null) return;
    setDuplicateError('');
    setDuplicatePayload(payload);
    setDuplicateSavedId(null);
    try {
      const result = await save.mutateAsync(payload);
      if (token !== duplicateTokenRef.current) return;
      setDuplicateSavedId(result.id);
      setDuplicatePhase('refreshing');
      await runDuplicateRefresh(result.id, token);
    } catch (error) {
      if (token !== duplicateTokenRef.current) return;
      setDuplicateError(error instanceof Error ? error.message : String(error));
      finishDuplicate(token);
    }
  };
  const duplicate = (profile: Profile) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = profile;
    const payload: ProfileSaveInput = {
      ...input,
      nameZh: input.nameZh.trim() ? `${input.nameZh}${t('profiles.copySuffixZh')}` : '',
      nameEn: input.nameEn.trim() ? `${input.nameEn}${t('profiles.copySuffixEn')}` : '',
    };
    if (!payload.nameZh && !payload.nameEn) payload.nameZh = t('profiles.unnamedCopy');
    void runDuplicate(payload);
  };
  const requestDuplicate = (profile: Profile) => { void dirtyNavigation.requestTransition(() => duplicate(profile)); };
  const openChart = (profile: Profile, chartType: 'natal' | 'transit' | 'synastry') => {
    const intent = chartType === 'synastry'
      ? { route: 'relationship' as const, chartType, primaryProfileId: profile.id }
      : { route: 'personal' as const, chartType, primaryProfileId: profile.id };
    onNavigate(intent.route, () => {
      workspaceStore.getState().openChart(intent);
    });
  };
  const refreshDelete = async (deletedId: string) => {
    setDeleteError('');
    setDeleteRefreshing(true);
    try {
      await refreshProfiles(queryClient);
      const refreshed = queryClient.getQueryData<Profile[]>(profileQueryKeys.all) ?? [];
      if (refreshed.some(({ id }) => id === deletedId)) {
        setDeleteError(t('profiles.deletedProfilePresent'));
        return;
      }
      const nextId = refreshed.some(({ id }) => id === selectedId)
        ? selectedId
        : workspaceStore.getState().primaryProfileId ?? refreshed[0]?.id ?? null;
      setSelectedId(nextId);
      setFocusAfterDelete(nextId ?? 'create');
      setDeleteSyncId(null);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeleteError(t('profiles.deletedRefreshFailed', { message }));
    } finally {
      setDeleteRefreshing(false);
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteSyncId) {
      await refreshDelete(deleteSyncId);
      return;
    }
    setDeleteError('');
    try {
      await remove.mutateAsync(deleteTarget.id);
      setCommittedOverlays((current) => {
        if (!current[deleteTarget.id]) return current;
        const next = { ...current };
        delete next[deleteTarget.id];
        return next;
      });
      workspaceStore.getState().removeProfile(deleteTarget.id);
      setDeleteSyncId(deleteTarget.id);
      await refreshDelete(deleteTarget.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    }
  };
  const closeDelete = () => {
    if (deletePending || deleteSyncId) return;
    setDeleteTarget(null); setDeleteError(''); deleteTrigger.current?.focus();
  };
  const requestDelete = (profile: Profile) => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void dirtyNavigation.requestTransition(() => { deleteTrigger.current = origin; setDeleteTarget(profile); });
  };
  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); closeDelete(); return; }
    if (event.key !== 'Tab') return;
    if (deletePending) {
      event.preventDefault();
      deleteStatusRef.current?.focus();
      return;
    }
    const first = cancelRef.current?.disabled ? confirmRef.current : cancelRef.current;
    const last = confirmRef.current;
    if (first && first === last) { event.preventDefault(); first.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  if (profiles.isPending) return <div className="profile-state" role="status">{t('profiles.loading')}</div>;
  if (profiles.isError && !profiles.data) return <div className="profile-state" role="alert"><p>{t('profiles.loadFailed', { message: profiles.error.message })}</p><button data-profile-control type="button" onClick={() => profiles.refetch()}>{t('profiles.retry')}</button></div>;
  return <div ref={pageRef} className="profile-page">
    <div className="profile-page__background" inert={Boolean(deleteTarget)} aria-hidden={deleteTarget ? true : undefined}>
      <ProfileDirectory profiles={visibleProfiles ?? []} selectedId={selectedId} primaryId={primaryId} recents={recents} onSelect={select} onCreate={openCreate} />
      <section className="profile-page__surface">
        {editor ? <ProfileForm key="profile-editor" profile={editorCommit?.profile ?? editor.profile ?? null} onSave={saveEditor} onCancel={requestCloseEditor} onDraftStateChange={(registration) => onFormRegistration?.(registration)} />
          : selected ? <ProfileDetail key={selected.id} profile={selected} primary={selected.id === primaryId} pending={duplicatePhase !== 'idle'} onEdit={() => openEdit(selected)} onCopy={() => requestDuplicate(selected)}
          onDelete={() => requestDelete(selected)}
          onSetPrimary={() => workspaceStore.getState().setPrimaryProfile(selected.id)} onChart={(type) => openChart(selected, type)} />
          : <div className="profile-page__blank">{t('profiles.selectPrompt')}</div>}
        {duplicateError && <div className="profile-duplicate-error" role="alert"><span>{duplicateError}</span><button data-profile-control type="button" disabled={duplicatePhase !== 'idle'} onClick={() => duplicateSavedId ? refreshDuplicate(duplicateSavedId) : duplicatePayload && void runDuplicate(duplicatePayload)}>{t(duplicateSavedId ? 'profiles.retryRefresh' : 'profiles.retry')}</button></div>}
      </section>
    </div>
    {deleteTarget && <div className="profile-dialog-backdrop"><div className="profile-dialog" role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-title" aria-describedby="profile-delete-description" onKeyDown={trapFocus}>
      <h2 id="profile-delete-title">{t('profiles.deleteTitle')}</h2><p id="profile-delete-description">{t('profiles.deleteConfirm', { name: deleteTarget.nameZh || deleteTarget.nameEn })}</p>
      {deletePending && <p ref={deleteStatusRef} role="status" tabIndex={-1} aria-busy="true">{t('profiles.deletePending')}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}
      <div className="profile-dialog__actions"><button data-profile-control ref={cancelRef} type="button" onClick={closeDelete} disabled={deletePending || Boolean(deleteSyncId)}>{t('form.cancel')}</button><button data-profile-control ref={confirmRef} type="button" onClick={() => void confirmDelete()} disabled={deletePending}>{deleteSyncId ? t('profiles.retryRefresh') : deleteError ? t('profiles.retryDelete') : t('profiles.confirmDelete')}</button></div>
    </div></div>}
  </div>;
}
