import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Profile } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { profileDisplayName, selectDirectoryProfiles, type ProfileRecents, type ProfileSort, type RecentFilter } from './directory';

interface ProfileDirectoryProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  primaryId: string | null;
  recents: ProfileRecents;
  onSelect(id: string): void;
  onCreate(): void;
}

function birth(profile: Profile): string {
  const value = profile.birthData;
  const pad = (part: number, width = 2) => String(part).padStart(width, '0');
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)} ${pad(value.hour)}:${pad(value.minute)}`;
}

export function ProfileDirectory({ profiles, selectedId, primaryId, recents, onSelect, onCreate }: ProfileDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<RecentFilter>('all');
  const [sort, setSort] = useState<ProfileSort>('updated-desc');
  const rows = useMemo(() => selectDirectoryProfiles(profiles, { search, recent, sort }, recents), [profiles, search, recent, sort, recents]);

  return (
    <aside className="profile-directory" aria-label={t('profiles.directory')}>
      <div className="profile-directory__heading">
        <strong>{t('profiles.panelHeading', { count: profiles.length })}</strong>
        <button data-profile-control className="profile-icon-button" type="button" onClick={onCreate} aria-label={t('profiles.create')} title={t('profiles.create')}>
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="profile-directory__controls" role="group" aria-label={t('profiles.filters')}>
        <label className="profile-search">
          <span>{t('profiles.search')}</span>
          <span className="profile-search__input"><Search size={15} aria-hidden="true" /><input data-profile-control type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></span>
        </label>
        <div className="profile-directory__selects">
          <label><span>{t('profiles.recentFilter')}</span><select data-profile-control value={recent} onChange={(event) => setRecent(event.target.value as RecentFilter)}>
            <option value="all">{t('profiles.allProfiles')}</option><option value="7d">{t('profiles.used7d')}</option><option value="30d">{t('profiles.used30d')}</option>
          </select></label>
          <label><span>{t('profiles.sort')}</span><select data-profile-control value={sort} onChange={(event) => setSort(event.target.value as ProfileSort)}>
            <option value="updated-desc">{t('profiles.sortUpdated')}</option><option value="name-asc">{t('profiles.sortName')}</option><option value="birth-asc">{t('profiles.sortBirth')}</option><option value="recent-desc">{t('profiles.sortRecent')}</option>
          </select></label>
        </div>
      </div>
      <div className="profile-directory__rows" role="group" aria-label={t('profiles.list')}>
        {rows.map((profile) => {
          const preferred = profileDisplayName(profile) || t('profiles.unnamed');
          const secondary = profile.nameZh.trim() ? profile.nameEn.trim() : '';
          const selected = profile.id === selectedId;
          const primary = profile.id === primaryId;
          const selectLabel = t('profiles.selectProfile', { name: preferred });
          const accessibleLabel = primary
            ? `${selectLabel}，${t('profiles.primary')}，${birth(profile)}，${profile.birthData.location.label}`
            : selectLabel;
          return <button key={profile.id} type="button" className="profile-row" data-selected={selected} aria-pressed={selected} aria-label={accessibleLabel} onClick={() => onSelect(profile.id)}>
            <span className="profile-row__identity"><span className="profile-row__name" title={preferred}>{preferred}</span>{primary && <span className="profile-row__marker">{t('profiles.primary')}</span>}</span>
            {secondary && <span className="profile-row__secondary" title={secondary}>{secondary}</span>}
            <span className="profile-row__meta"><span>{birth(profile)}</span><span className="profile-row__location" title={profile.birthData.location.label}>{profile.birthData.location.label}</span></span>
          </button>;
        })}
        {profiles.length === 0 && <p className="profile-directory__empty">{t('profiles.emptyLibrary')}</p>}
        {profiles.length > 0 && rows.length === 0 && <p className="profile-directory__empty">{t('profiles.noResults')}</p>}
      </div>
    </aside>
  );
}
