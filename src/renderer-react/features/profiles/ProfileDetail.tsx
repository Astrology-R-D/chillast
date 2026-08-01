import { Copy, Edit3, Orbit, Star, Trash2, UsersRound } from 'lucide-react';
import type { Profile } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { profileDisplayName } from './directory';

interface ProfileDetailProps {
  profile: Profile;
  primary: boolean;
  pending: boolean;
  onEdit(): void;
  onCopy(): void;
  onDelete(): void;
  onSetPrimary(): void;
  onChart(type: 'natal' | 'transit' | 'synastry'): void;
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export function ProfileDetail({ profile, primary, pending, onEdit, onCopy, onDelete, onSetPrimary, onChart }: ProfileDetailProps) {
  const { t } = useI18n();
  const name = profileDisplayName(profile) || t('profiles.unnamed');
  const birth = profile.birthData;
  const iconAction = (label: string, action: () => void, icon: React.ReactNode, disabled = false) =>
    <button data-profile-control className="profile-icon-button" type="button" aria-label={label} title={label} onClick={action} disabled={disabled}>{icon}</button>;
  return <article className="profile-detail" aria-label={t('profiles.detail')}>
    <header className="profile-detail__header">
      <div><div className="profile-detail__title-line"><h2>{name}</h2>{primary && <span className="profile-detail__primary">{t('profiles.primary')}</span>}</div>
        {profile.nameZh.trim() && profile.nameEn.trim() && <p className="profile-detail__secondary" title={profile.nameEn}>{profile.nameEn}</p>}
      </div>
      <div className="profile-detail__actions" role="group" aria-label={t('profiles.actions')}>
        {iconAction(t('profiles.edit'), onEdit, <Edit3 size={17} aria-hidden="true" />)}
        {iconAction(t('profiles.duplicate'), onCopy, <Copy size={17} aria-hidden="true" />, pending)}
        {!primary && iconAction(t('profiles.setPrimary'), onSetPrimary, <Star size={17} aria-hidden="true" />)}
        {iconAction(t('profiles.deleteTitle'), onDelete, <Trash2 size={17} aria-hidden="true" />)}
      </div>
    </header>
    <dl className="profile-detail__facts">
      <div><dt>{t('form.gender')}</dt><dd>{t(`profiles.gender${profile.gender[0].toUpperCase()}${profile.gender.slice(1)}`)}</dd></div>
      <div><dt>{t('form.birthDateTime')}</dt><dd>{pad(birth.year, 4)}-{pad(birth.month)}-{pad(birth.day)} {pad(birth.hour)}:{pad(birth.minute)}</dd></div>
      <div><dt>{t('form.birthPlace')}</dt><dd title={birth.location.label}>{birth.location.label}</dd></div>
      <div><dt>{t('profiles.coordinates')}</dt><dd>{birth.location.latitude}, {birth.location.longitude}</dd></div>
    </dl>
    <section className="profile-detail__section"><h3>{t('profiles.tags')}</h3>{profile.tags.length ? <ul aria-label={t('profiles.tags')}>{profile.tags.map((tag) => <li key={tag} title={tag}>{tag}</li>)}</ul> : <p>{t('profiles.noTags')}</p>}</section>
    <section className="profile-detail__section"><h3>{t('form.notes')}</h3><p className="profile-detail__notes">{profile.notes || t('profiles.noNotes')}</p></section>
    <dl className="profile-detail__timestamps"><div><dt>{t('profiles.createdAt')}</dt><dd>{profile.createdAt}</dd></div><div><dt>{t('profiles.updatedAt')}</dt><dd>{profile.updatedAt}</dd></div></dl>
    <div className="profile-detail__commands" role="group" aria-label={t('profiles.chartCommands')}>
      <button data-profile-control type="button" onClick={() => onChart('natal')}><Orbit size={16} aria-hidden="true" />{t('profiles.openNatal')}</button>
      <button data-profile-control type="button" onClick={() => onChart('transit')}><Orbit size={16} aria-hidden="true" />{t('profiles.openTransit')}</button>
      <button data-profile-control type="button" onClick={() => onChart('synastry')}><UsersRound size={16} aria-hidden="true" />{t('profiles.openRelationship')}</button>
    </div>
  </article>;
}
