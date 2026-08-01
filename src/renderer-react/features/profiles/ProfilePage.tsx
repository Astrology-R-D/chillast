import { useStore } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';
import { useEffect, useRef, useState } from 'react';
import type { Profile, ProfileSaveInput } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { profileWorkspaceStore, type ProfileWorkspaceState } from '../../stores/profileWorkspace';
import type { RouteKey } from '../../shell/routes';
import { ProfileDetail } from './ProfileDetail';
import { ProfileDirectory } from './ProfileDirectory';
import { profileQueryKeys, useProfiles, useRemoveProfile, useSaveProfile } from './profileQueries';
import './profiles.css';

interface ProfilePageProps {
  workspaceStore?: StoreApi<ProfileWorkspaceState>;
  onNavigate(route: RouteKey): void;
  onCreate?: () => void;
  onEdit?: (profile: Profile) => void;
}

export function ProfilePage({ workspaceStore = profileWorkspaceStore, onNavigate, onCreate, onEdit }: ProfilePageProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const profiles = useProfiles();
  const save = useSaveProfile();
  const remove = useRemoveProfile();
  const primaryId = useStore(workspaceStore, (state) => state.primaryProfileId);
  const recents = useStore(workspaceStore, (state) => state.recentUses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!profiles.data) return;
    const ids = profiles.data.map(({ id }) => id);
    workspaceStore.getState().reconcileProfiles(ids);
    setSelectedId((current) => current && ids.includes(current) ? current : ids[0] ?? null);
  }, [profiles.data, workspaceStore]);

  useEffect(() => {
    if (deleteTarget) cancelRef.current?.focus();
  }, [deleteTarget]);

  const select = (id: string) => {
    setSelectedId(id);
    workspaceStore.getState().recordRecentUse(id);
  };
  const selected = profiles.data?.find(({ id }) => id === selectedId) ?? null;
  const duplicate = async (profile: Profile) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = profile;
    const suffix = t('profiles.copySuffix');
    const payload: ProfileSaveInput = {
      ...input,
      nameZh: input.nameZh.trim() ? `${input.nameZh}${suffix}` : '',
      nameEn: input.nameEn.trim() ? `${input.nameEn}${suffix}` : '',
    };
    if (!payload.nameZh && !payload.nameEn) payload.nameZh = t('profiles.unnamedCopy');
    const result = await save.mutateAsync(payload);
    const refreshed = queryClient.getQueryData<Profile[]>(profileQueryKeys.all) ?? [];
    const canonical = refreshed.find(({ id }) => id === result.id)
      ?? refreshed.find((candidate) => candidate.nameZh === payload.nameZh
        && candidate.nameEn === payload.nameEn
        && candidate.birthData.year === payload.birthData.year
        && candidate.birthData.month === payload.birthData.month
        && candidate.birthData.day === payload.birthData.day
        && candidate.birthData.hour === payload.birthData.hour
        && candidate.birthData.minute === payload.birthData.minute
        && candidate.birthData.location.latitude === payload.birthData.location.latitude
        && candidate.birthData.location.longitude === payload.birthData.location.longitude);
    if (canonical) {
      setSelectedId(canonical.id);
      workspaceStore.getState().recordRecentUse(canonical.id);
    }
  };
  const openChart = (profile: Profile, chartType: 'natal' | 'transit' | 'synastry') => {
    const intent = chartType === 'synastry'
      ? { route: 'relationship' as const, chartType, primaryProfileId: profile.id }
      : { route: 'personal' as const, chartType, primaryProfileId: profile.id };
    workspaceStore.getState().openChart(intent);
    if (workspaceStore.getState().chartIntent) onNavigate(intent.route);
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await remove.mutateAsync(deleteTarget.id);
      workspaceStore.getState().removeProfile(deleteTarget.id);
      setDeleteTarget(null);
      deleteTrigger.current?.focus();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    }
  };
  const closeDelete = () => {
    if (remove.isPending) return;
    setDeleteTarget(null); setDeleteError(''); deleteTrigger.current?.focus();
  };
  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); closeDelete(); return; }
    if (event.key !== 'Tab') return;
    const first = cancelRef.current; const last = confirmRef.current;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  if (profiles.isPending) return <div className="profile-state" role="status">{t('profiles.loading')}</div>;
  if (profiles.isError) return <div className="profile-state" role="alert"><p>{t('profiles.loadError', { message: profiles.error.message })}</p><button data-profile-control type="button" onClick={() => profiles.refetch()}>{t('profiles.retryLoad')}</button></div>;
  return <div className="profile-page">
    <ProfileDirectory profiles={profiles.data} selectedId={selectedId} primaryId={primaryId} recents={recents} onSelect={select} onCreate={() => onCreate?.()} />
    <main className="profile-page__surface">
      {selected ? <ProfileDetail profile={selected} primary={selected.id === primaryId} pending={save.isPending} onEdit={() => onEdit?.(selected)} onCopy={() => void duplicate(selected)}
        onDelete={() => { deleteTrigger.current = document.activeElement as HTMLElement; setDeleteTarget(selected); }}
        onSetPrimary={() => workspaceStore.getState().setPrimaryProfile(selected.id)} onChart={(type) => openChart(selected, type)} />
        : <div className="profile-page__blank">{t('profiles.selectPrompt')}</div>}
    </main>
    {deleteTarget && <div className="profile-dialog-backdrop"><div className="profile-dialog" role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-title" aria-describedby="profile-delete-description" onKeyDown={trapFocus}>
      <h2 id="profile-delete-title">{t('profiles.deleteTitle')}</h2><p id="profile-delete-description">{t('profiles.deleteConfirm', { name: deleteTarget.nameZh || deleteTarget.nameEn })}</p>
      {deleteError && <p role="alert">{deleteError}</p>}
      <div className="profile-dialog__actions"><button data-profile-control ref={cancelRef} type="button" onClick={closeDelete} disabled={remove.isPending}>{t('profiles.cancelDelete')}</button><button data-profile-control ref={confirmRef} type="button" onClick={() => void confirmDelete()} disabled={remove.isPending}>{deleteError ? t('profiles.retryDelete') : t('profiles.confirmDelete')}</button></div>
    </div></div>}
  </div>;
}
