import { useEffect, useId, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { CitySearchResult, LocationResolution, ResolveLocationInput } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { daysInMonth, type ProfileDraft, type ProfileFieldErrors } from './profileForm';

export type LocationPickerValue = Pick<ProfileDraft, 'locationLabel' | 'latitude' | 'longitude'>;
export type BirthMomentValue = Pick<ProfileDraft, 'year' | 'month' | 'day' | 'hour' | 'minute'>;

export interface LocationPickerProps {
  value: LocationPickerValue;
  birthMoment: BirthMomentValue;
  errors: Pick<ProfileFieldErrors, 'locationLabel' | 'latitude' | 'longitude'>;
  onChange(value: LocationPickerValue): void;
  disabled?: boolean;
}

function resolutionInput(value: LocationPickerValue, birthMoment: BirthMomentValue): ResolveLocationInput | null {
  const fields = [birthMoment.year, birthMoment.month, birthMoment.day, birthMoment.hour, birthMoment.minute].map((part) => part.trim());
  if (fields.some((part) => !/^\d+$/.test(part))) return null;
  const [year, month, day, hour, minute] = fields.map(Number);
  const latitude = value.latitude.trim() ? Number(value.latitude) : Number.NaN;
  const longitude = value.longitude.trim() ? Number(value.longitude) : Number.NaN;
  if (!Number.isInteger(year) || year < 1 || year > 3000 || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)
    || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { year, month, day, hour, minute, latitude, longitude };
}

export function LocationPicker({ value, birthMoment, errors, onChange, disabled = false }: LocationPickerProps) {
  const { t } = useI18n();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const [resolution, setResolution] = useState<{ key: string; generation: number; value: LocationResolution } | null>(null);
  const [resolveStatus, setResolveStatus] = useState<{ key: string; generation: number; state: 'loading' | 'error'; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const searchSequence = useRef(0);
  const resolveSequence = useRef(0);
  const skipSearch = useRef(false);
  const searchWidgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return undefined; }
    const trimmed = query.trim();
    const sequence = searchSequence.current;
    if (!trimmed) { setOpen(false); setSearchState('idle'); setSearchError(''); return undefined; }
    const timer = window.setTimeout(async () => {
      if (sequence !== searchSequence.current) return;
      setSearchState('loading'); setSearchError(''); setOpen(true);
      try {
        const next = await apiClient.searchCities(trimmed);
        if (sequence !== searchSequence.current) return;
        setResults(next); setActive(-1); setSearchState('idle');
      } catch (error) {
        if (sequence !== searchSequence.current) return;
        setSearchState('error'); setSearchError(error instanceof Error ? error.message : String(error));
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const resolveInput = resolutionInput(value, birthMoment);
  const dependency = resolveInput ? JSON.stringify(resolveInput) : '';
  const resolutionRequestRef = useRef({ key: dependency, generation: 1 });
  if (resolutionRequestRef.current.key !== dependency) {
    resolutionRequestRef.current = { key: dependency, generation: resolutionRequestRef.current.generation + 1 };
  }
  const resolutionRequest = resolutionRequestRef.current;
  useEffect(() => {
    const sequence = ++resolveSequence.current;
    if (!resolveInput) return;
    const { key, generation } = resolutionRequest;
    setResolveStatus({ key, generation, state: 'loading' });
    void (async () => {
      try {
        const next = await apiClient.resolveLocation(resolveInput);
        if (sequence !== resolveSequence.current || generation !== resolutionRequestRef.current.generation) return;
        setResolution({ key, generation, value: next }); setResolveStatus(null);
      } catch (error) {
        if (sequence !== resolveSequence.current || generation !== resolutionRequestRef.current.generation) return;
        setResolveStatus({ key, generation, state: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    })();
  }, [dependency, retry]);

  const changeQuery = (next: string) => {
    skipSearch.current = false;
    searchSequence.current += 1;
    setQuery(next); setResults([]); setActive(-1); setOpen(false); setSearchState('idle'); setSearchError('');
  };
  const select = (city: CitySearchResult) => {
    onChange({ locationLabel: city.label, latitude: String(city.latitude), longitude: String(city.longitude) });
    searchSequence.current += 1; skipSearch.current = true; setQuery(city.label); setResults([]); setOpen(false); setActive(-1);
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); return; }
    if (!results.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') { setOpen(true); setActive((current) => current < results.length - 1 ? current + 1 : 0); }
    else if (event.key === 'ArrowUp') { setOpen(true); setActive((current) => current > 0 ? current - 1 : results.length - 1); }
    else if (active >= 0) select(results[active]);
  };

  return <fieldset className="location-picker" disabled={disabled}>
    <legend>{t('form.birthPlace')}</legend>
    <div ref={searchWidgetRef} className="profile-field location-picker__search" onBlurCapture={(event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && searchWidgetRef.current?.contains(next)) return;
      setOpen(false); setActive(-1);
    }}>
      <label htmlFor={`${listId}-search`}>{t('form.locationSearch')}</label>
      <input id={`${listId}-search`} data-profile-control role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} value={query} placeholder={t('form.citySearch')}
        onChange={(event) => changeQuery(event.target.value)} onFocus={() => results.length && setOpen(true)} onKeyDown={keyDown} />
      {open && <div id={listId} role="listbox" className="location-picker__results">
        {results.map((city, index) => <button id={`${listId}-${index}`} key={city.key} type="button" role="option" tabIndex={-1} aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()} onClick={() => select(city)}>{city.label}</button>)}
        {searchState === 'loading' && <span role="status">{t('form.locationSearching')}</span>}
        {searchState === 'error' && <span role="alert">{t('form.locationSearchFailed', { message: searchError })}</span>}
        {searchState === 'idle' && !results.length && <span>{t('form.locationNoResults')}</span>}
      </div>}
    </div>
    <div className="location-picker__manual">
      <div className="profile-field"><label htmlFor={`${listId}-locationLabel`}>{t('form.locationLabel')}</label>
        <input id={`${listId}-locationLabel`} name="locationLabel" data-profile-control value={value.locationLabel} aria-invalid={Boolean(errors.locationLabel)} aria-describedby={errors.locationLabel ? `${listId}-locationLabel-error` : undefined} onChange={(event) => onChange({ ...value, locationLabel: event.target.value })} />
        {errors.locationLabel && <span id={`${listId}-locationLabel-error`} className="profile-field__error">{errors.locationLabel}</span>}
      </div>
      <div className="location-picker__coordinates">
        {([['latitude', 'form.latitude'], ['longitude', 'form.longitude']] as const).map(([field, label]) => <div className="profile-field" key={field}><label htmlFor={`${listId}-${field}`}>{t(label)}</label>
          <input id={`${listId}-${field}`} name={field} data-profile-control type="number" step="any" value={value[field]} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${listId}-${field}-error` : undefined} onChange={(event) => onChange({ ...value, [field]: event.target.value })} />
          {errors[field] && <span id={`${listId}-${field}-error`} className="profile-field__error">{errors[field]}</span>}
        </div>)}
      </div>
    </div>
    <div className="location-picker__timezone" aria-live="polite">
      {resolveStatus?.key === resolutionRequest.key && resolveStatus.generation === resolutionRequest.generation && resolveStatus.state === 'loading' && <span role="status">{t('form.timezoneResolving')}</span>}
      {resolution?.key === resolutionRequest.key && resolution.generation === resolutionRequest.generation && <span>{resolution.value.timeZone} · {resolution.value.utcOffsetLabel}</span>}
      {resolveStatus?.key === resolutionRequest.key && resolveStatus.generation === resolutionRequest.generation && resolveStatus.state === 'error' && <span role="alert">{t('form.timezoneFailed', { message: resolveStatus.error ?? '' })} <button type="button" disabled={disabled} onClick={() => { resolutionRequestRef.current = { key: dependency, generation: resolutionRequestRef.current.generation + 1 }; setRetry((current) => current + 1); }}>{t('form.retryTimezone')}</button></span>}
    </div>
  </fieldset>;
}
