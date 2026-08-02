import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Gender, Profile, ProfileSaveInput } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { useOptionalDirtyNavigation, type DraftRegistration } from '../../shell/DirtyNavigationProvider';
import { LocationPicker } from './LocationPicker';
import { createDraft, daysInMonth, isProfileDraftDirty, parseTagText, toSaveInput, validateProfileDraft, type ProfileDraft, type ProfileFieldErrors } from './profileForm';

export type { DraftRegistration } from '../../shell/DirtyNavigationProvider';

export interface ProfileFormProps {
  profile: Profile | null;
  onSave(input: ProfileSaveInput): Promise<void>;
  onCancel(): void;
  onDraftStateChange(registration: DraftRegistration): void;
  onDirtyChange?(dirty: boolean): void;
}

const genders: Gender[] = ['male', 'female', 'other'];
const numericFields = [
  ['year', 'form.placeholderYear', 1, 3000], ['month', 'form.placeholderMonth', 1, 12], ['day', 'form.placeholderDay', 1, 31],
  ['hour', 'form.placeholderHour', 0, 23], ['minute', 'form.placeholderMinute', 0, 59],
] as const;
type NumericField = typeof numericFields[number][0];

const padded = (field: NumericField, value: number) => field === 'year' ? String(value) : String(value).padStart(2, '0');

export function ProfileForm({ profile, onSave, onCancel, onDraftStateChange, onDirtyChange }: ProfileFormProps) {
  const { t } = useI18n();
  const dirtyNavigation = useOptionalDirtyNavigation();
  const id = useId();
  const initial = createDraft(profile);
  const baselineRef = useRef(initial);
  const draftRef = useRef(initial);
  const saveHandlerRef = useRef(onSave);
  const draftStateHandlerRef = useRef(onDraftStateChange);
  const dirtyHandlerRef = useRef(onDirtyChange);
  const formRef = useRef<HTMLFormElement | null>(null);
  const pendingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const [draft, setDraftState] = useState(initial);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [pending, setPending] = useState(false);
  const dirty = isProfileDraftDirty(draft, baselineRef.current);
  saveHandlerRef.current = onSave;
  draftStateHandlerRef.current = onDraftStateChange;
  dirtyHandlerRef.current = onDirtyChange;
  draftRef.current = draft;

  const setDraft = (next: ProfileDraft | ((current: ProfileDraft) => ProfileDraft)) => {
    setDraftState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      draftRef.current = value;
      return value;
    });
  };
  const focusFirstError = (nextErrors: ProfileFieldErrors) => {
    const first = Object.keys(nextErrors)[0];
    const field = first === 'names' ? 'nameZh' : first;
    formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  };

  const saveRef = useRef<() => Promise<boolean>>(null!);
  if (!saveRef.current) saveRef.current = () => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const submitted = { ...draftRef.current };
    const nextErrors = validateProfileDraft(submitted);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors); focusFirstError(nextErrors);
      return Promise.resolve(false);
    }
    pendingRef.current = true; setPending(true); setErrors({});
    const saving = (async () => {
      try {
        await saveHandlerRef.current(toSaveInput(submitted));
        baselineRef.current = submitted;
        setDraft({ ...submitted });
        return true;
      } catch (error) {
        setErrors({ save: error instanceof Error ? error.message : String(error) });
        return false;
      } finally {
        savePromiseRef.current = null;
        pendingRef.current = false; setPending(false);
      }
    })();
    savePromiseRef.current = saving;
    return saving;
  };
  const discardRef = useRef<() => void>(null!);
  if (!discardRef.current) discardRef.current = () => {
    setDraft({ ...baselineRef.current }); setErrors({});
  };

  useEffect(() => {
    const next = createDraft(profile);
    baselineRef.current = next; setDraft(next); setErrors((current) => current.save ? { save: current.save } : {});
  }, [profile]);
  useEffect(() => {
    const registration: DraftRegistration = { dirty, get busy() { return pendingRef.current; }, save: saveRef.current, discard: discardRef.current };
    dirtyNavigation?.register(registration);
    draftStateHandlerRef.current(registration);
    dirtyHandlerRef.current?.(dirty);
    return () => dirtyNavigation?.register(null);
  }, [dirty, dirtyNavigation]);

  const patch = (value: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
    setErrors((current) => {
      let changed = false;
      const next = { ...current };
      for (const key of Object.keys(value) as (keyof ProfileDraft)[]) if (next[key]) { delete next[key]; changed = true; }
      if ((value.nameZh !== undefined || value.nameEn !== undefined) && next.names) { delete next.names; changed = true; }
      return changed ? next : current;
    });
  };
  const bounds = (field: NumericField): [number, number] => {
    if (field === 'year') return [1, 3000];
    if (field === 'month') return [1, 12];
    if (field === 'day') {
      const year = Math.min(3000, Math.max(1, Number(draftRef.current.year) || 1));
      const month = Math.min(12, Math.max(1, Number(draftRef.current.month) || 1));
      return [1, daysInMonth(year, month)];
    }
    return field === 'hour' ? [0, 23] : [0, 59];
  };
  const normalizeSegment = (field: NumericField, delta = 0) => {
    const [minimum, maximum] = bounds(field);
    const raw = draftRef.current[field].trim();
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value = Math.min(maximum, Math.max(minimum, Math.trunc(parsed) + delta));
    const next: Partial<ProfileDraft> = { [field]: padded(field, value) };
    if (field === 'year' || field === 'month') {
      const year = field === 'year' ? value : Number(draftRef.current.year);
      const month = field === 'month' ? value : Number(draftRef.current.month);
      const day = Number(draftRef.current.day);
      if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) next.day = padded('day', Math.min(day, daysInMonth(year, month)));
    }
    patch(next);
  };
  const fieldError = (field: keyof ProfileDraft) => errors[field] && <span id={`${id}-${field}-error`} className="profile-field__error">{errors[field]}</span>;
  const describedBy = (field: keyof ProfileDraft) => errors[field] ? `${id}-${field}-error` : undefined;

  return <form ref={formRef} id={id} className="profile-form" aria-label={t(profile ? 'profiles.editHeading' : 'profiles.createHeading')} aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void saveRef.current(); }} noValidate>
    <header className="profile-form__header"><h2>{t(profile ? 'profiles.editHeading' : 'profiles.createHeading')}</h2></header>
    <fieldset className="profile-form__controls" disabled={pending}>
      <fieldset className="profile-form__names" aria-describedby={errors.names ? `${id}-names-error` : undefined}>
        <legend>{t('form.names')}</legend>
        {([['nameZh', 'form.nameZh', 'form.placeholderZh'], ['nameEn', 'form.nameEn', 'form.placeholderEn']] as const).map(([field, label, placeholder]) => <div className="profile-field" key={field}>
          <label htmlFor={`${id}-${field}`}>{t(label)}</label><input id={`${id}-${field}`} name={field} data-profile-control value={draft[field]} placeholder={t(placeholder)} aria-invalid={Boolean(errors.names || errors[field])} aria-describedby={describedBy(field)} onChange={(event) => patch({ [field]: event.target.value })} />{fieldError(field)}
        </div>)}
        {errors.names && <span id={`${id}-names-error`} className="profile-field__error">{errors.names}</span>}
      </fieldset>
      <div className="profile-field"><label htmlFor={`${id}-gender`}>{t('form.gender')}</label>
        <select id={`${id}-gender`} name="gender" data-profile-control value={draft.gender} aria-invalid={Boolean(errors.gender)} aria-describedby={describedBy('gender')} onChange={(event) => patch({ gender: event.target.value as Gender })}>
          {genders.map((gender) => <option key={gender} value={gender}>{t(`profiles.gender${gender[0].toUpperCase()}${gender.slice(1)}`)}</option>)}
        </select>{fieldError('gender')}
      </div>
      <fieldset className="profile-form__datetime"><legend>{t('form.birthDateTime')}</legend><div className="profile-form__segments">
        {numericFields.map(([field, label, minimum, maximum]) => <div className="profile-field profile-segment" key={field}><label htmlFor={`${id}-${field}`}>{t(label)}</label>
          <div className="profile-segment__control"><input id={`${id}-${field}`} name={field} data-profile-control type="number" inputMode="numeric" min={minimum} max={maximum} placeholder={t(label)} value={draft[field]} aria-valuetext={draft[field]} aria-invalid={Boolean(errors[field])} aria-describedby={describedBy(field)} onChange={(event) => patch({ [field]: event.target.value })} />
            <span className="profile-segment__steppers"><button type="button" aria-label={t('form.increment', { field: t(label) })} onClick={() => normalizeSegment(field, 1)}><ChevronUp aria-hidden="true" size={13} /></button><button type="button" aria-label={t('form.decrement', { field: t(label) })} onClick={() => normalizeSegment(field, -1)}><ChevronDown aria-hidden="true" size={13} /></button></span>
          </div>{fieldError(field)}</div>)}
      </div></fieldset>
      <LocationPicker value={{ locationLabel: draft.locationLabel, latitude: draft.latitude, longitude: draft.longitude }} birthMoment={{ year: draft.year, month: draft.month, day: draft.day, hour: draft.hour, minute: draft.minute }} errors={{ locationLabel: errors.locationLabel, latitude: errors.latitude, longitude: errors.longitude }} onChange={(location) => patch(location)} disabled={pending} />
      <div className="profile-field"><label htmlFor={`${id}-notes`}>{t('form.notes')}</label><textarea id={`${id}-notes`} name="notes" value={draft.notes} placeholder={t('form.placeholderNotes')} onChange={(event) => patch({ notes: event.target.value })} /></div>
      <div className="profile-field"><label htmlFor={`${id}-tags`}>{t('form.tags')}</label><textarea id={`${id}-tags`} name="tags" value={draft.tags} placeholder={t('form.tagsPlaceholder')} aria-invalid={Boolean(errors.tags)} aria-describedby={describedBy('tags')} onChange={(event) => patch({ tags: event.target.value })} />{fieldError('tags')}
        {parseTagText(draft.tags).length > 0 && <ul className="profile-form__tag-preview" aria-label={t('form.tagPreview')}>{parseTagText(draft.tags).map((tag) => <li key={tag}>{tag}</li>)}</ul>}
      </div>
    </fieldset>
    {pending && <p className="profile-form__status" role="status" aria-live="polite">{t('form.saving')}</p>}
    {errors.save && <div className="profile-form__backend-error" role="alert"><span>{t('form.backendError', { message: errors.save })}</span><button data-profile-control type="button" disabled={pending} onClick={() => void saveRef.current()}>{t('form.retrySave')}</button></div>}
    <div className="profile-form__actions"><button data-profile-control type="submit" disabled={pending}>{t(profile ? 'form.save' : 'form.create')}</button><button data-profile-control type="button" disabled={pending} onClick={onCancel}>{t('form.cancel')}</button></div>
  </form>;
}
