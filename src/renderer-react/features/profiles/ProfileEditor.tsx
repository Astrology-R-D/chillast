import { useEffect, useId, useRef, useState } from 'react';
import type { Gender, Profile, ProfileSaveInput } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { LocationPicker } from './LocationPicker';
import { emptyDraft, isProfileDraftDirty, parseTagText, profileToDraft, validateProfileDraft, type FieldErrors, type ProfileDraft } from './profileForm';

export interface ProfileFormRegistration { isDirty(): boolean }

export interface ProfileFormProps {
  profile?: Profile;
  onSave(input: ProfileSaveInput): Promise<Profile>;
  onCancel(): void;
  onSaved?(profile: Profile): void;
  onDirtyChange?(dirty: boolean): void;
  onRegistration?(registration: ProfileFormRegistration | null): void;
}

const genders: Gender[] = ['male', 'female', 'other'];
const numericFields = [
  ['year', 'form.placeholderYear', 1, 3000], ['month', 'form.placeholderMonth', 1, 12], ['day', 'form.placeholderDay', 1, 31],
  ['hour', 'form.placeholderHour', 0, 23], ['minute', 'form.placeholderMinute', 0, 59],
] as const;

export function ProfileForm({ profile, onSave, onCancel, onSaved, onDirtyChange, onRegistration }: ProfileFormProps) {
  const { t } = useI18n();
  const id = useId();
  const initialRef = useRef<ProfileDraft>(profile ? profileToDraft(profile) : emptyDraft());
  const formRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState(initialRef.current);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [backendError, setBackendError] = useState('');
  const [failedPayload, setFailedPayload] = useState<ProfileSaveInput | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const dirty = isProfileDraftDirty(draft, initialRef.current);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!profile || draft.id === profile.id) return;
    setDraft((current) => ({ ...current, id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt }));
  }, [draft.id, profile]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!onRegistration) return undefined;
    const registration = { isDirty: () => dirtyRef.current };
    onRegistration(registration);
    return () => onRegistration(null);
  }, [onRegistration]);

  const patch = (value: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
    setBackendError(''); setFailedPayload(null);
    for (const key of Object.keys(value) as (keyof ProfileDraft)[]) {
      setErrors((current) => current[key] ? { ...current, [key]: undefined } : current);
    }
  };
  const executeSave = async (payload: ProfileSaveInput) => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setBackendError('');
    try {
      const authoritative = await onSave(payload);
      setFailedPayload(null);
      onSaved?.(authoritative);
    } catch (error) {
      setFailedPayload(payload);
      setBackendError(error instanceof Error ? error.message : String(error));
    } finally {
      pendingRef.current = false; setPending(false);
    }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateProfileDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    void executeSave(result.value);
  };
  const errorFor = (field: keyof ProfileDraft) => errors[field] ? t(errors[field]!) : '';
  const describedBy = (field: keyof ProfileDraft) => errors[field] ? `${id}-${field}-error` : undefined;
  const fieldError = (field: keyof ProfileDraft) => errorFor(field) && <span id={`${id}-${field}-error`} className="profile-field__error">{errorFor(field)}</span>;
  const genderKeyDown = (event: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, genders.indexOf(draft.gender as Gender));
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    const next = genders[(current + direction + genders.length) % genders.length];
    patch({ gender: next });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${CSS.escape(id)} [data-gender="${next}"]`)?.focus());
  };

  return <form ref={formRef} id={id} className="profile-form" aria-label={t(profile ? 'profiles.editHeading' : 'profiles.createHeading')} onSubmit={submit} noValidate>
    <header className="profile-form__header"><h2>{t(profile ? 'profiles.editHeading' : 'profiles.createHeading')}</h2></header>
    <div className="profile-form__names">
      {([['nameZh', 'form.nameZh', 'form.placeholderZh'], ['nameEn', 'form.nameEn', 'form.placeholderEn']] as const).map(([field, label, placeholder]) => <div className="profile-field" key={field}>
        <label htmlFor={`${id}-${field}`}>{t(label)}</label><input id={`${id}-${field}`} name={field} data-profile-control value={draft[field]} placeholder={t(placeholder)} aria-invalid={Boolean(errors[field])} aria-describedby={describedBy(field)} onChange={(event) => patch({ [field]: event.target.value })} />{fieldError(field)}
      </div>)}
    </div>
    <div className="profile-field"><span className="profile-field__label">{t('form.gender')}</span>
      <div className="profile-segmented" role="radiogroup" aria-label={t('form.gender')} aria-describedby={describedBy('gender')} onKeyDown={genderKeyDown}>
        {genders.map((gender) => <button key={gender} name="gender" data-gender={gender} type="button" role="radio" aria-checked={draft.gender === gender} onClick={() => patch({ gender })}>{t(`profiles.gender${gender[0].toUpperCase()}${gender.slice(1)}`)}</button>)}
      </div>{fieldError('gender')}
    </div>
    <fieldset className="profile-form__datetime"><legend>{t('form.birthDateTime')}</legend><div className="profile-form__segments">
      {numericFields.map(([field, label, min, max]) => <div className="profile-field" key={field}><label htmlFor={`${id}-${field}`}>{t(label)}</label>
        <input id={`${id}-${field}`} name={field} data-profile-control type="number" inputMode="numeric" min={min} max={max} placeholder={t(label)} value={draft[field]} aria-invalid={Boolean(errors[field])} aria-describedby={describedBy(field)} onChange={(event) => patch({ [field]: event.target.value })} />{fieldError(field)}</div>)}
    </div></fieldset>
    <LocationPicker draft={draft} errors={errors} onChange={patch} />
    <div className="profile-field"><label htmlFor={`${id}-notes`}>{t('form.notes')}</label><textarea id={`${id}-notes`} name="notes" value={draft.notes} placeholder={t('form.placeholderNotes')} onChange={(event) => patch({ notes: event.target.value })} /></div>
    <div className="profile-field"><label htmlFor={`${id}-tags`}>{t('form.tags')}</label><textarea id={`${id}-tags`} name="tags" value={draft.tags} placeholder={t('form.tagsPlaceholder')} aria-invalid={Boolean(errors.tags)} aria-describedby={describedBy('tags')} onChange={(event) => patch({ tags: event.target.value })} />{fieldError('tags')}
      {parseTagText(draft.tags).length > 0 && <ul className="profile-form__tag-preview" aria-label={t('form.tagPreview')}>{parseTagText(draft.tags).map((tag) => <li key={tag}>{tag}</li>)}</ul>}
    </div>
    {pending && <p className="profile-form__status" role="status" aria-live="polite">{t('form.saving')}</p>}
    {backendError && <div className="profile-form__backend-error" role="alert"><span>{t('form.backendError', { message: backendError })}</span><button data-profile-control type="button" disabled={pending} onClick={() => failedPayload && void executeSave(failedPayload)}>{t('form.retrySave')}</button></div>}
    <div className="profile-form__actions"><button data-profile-control type="submit" disabled={pending}>{t(profile ? 'form.save' : 'form.create')}</button><button data-profile-control type="button" disabled={pending} onClick={onCancel}>{t('form.cancel')}</button></div>
  </form>;
}
