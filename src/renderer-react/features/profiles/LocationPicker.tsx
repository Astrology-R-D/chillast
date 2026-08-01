import { useEffect, useId, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { CitySearchResult, LocationResolution, ResolveLocationInput } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import type { ProfileDraft } from './profileForm';

interface LocationPickerProps {
  draft: ProfileDraft;
  onChange(patch: Partial<ProfileDraft>): void;
  errors?: Partial<Record<keyof ProfileDraft, string>>;
}

function resolutionInput(draft: ProfileDraft): ResolveLocationInput | null {
  const values = [draft.year, draft.month, draft.day, draft.hour, draft.minute].map((value) => value.trim());
  if (values.some((value) => !/^\d+$/.test(value))) return null;
  const [year, month, day, hour, minute] = values.map(Number);
  const latitude = draft.latitude.trim() ? Number(draft.latitude) : Number.NaN;
  const longitude = draft.longitude.trim() ? Number(draft.longitude) : Number.NaN;
  if (!Number.isInteger(year) || year < 1 || year > 3000 || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(day) || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { year, month, day, hour, minute, latitude, longitude };
}

export function LocationPicker({ draft, onChange, errors = {} }: LocationPickerProps) {
  const { t } = useI18n();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const [resolution, setResolution] = useState<LocationResolution | null>(null);
  const [resolveState, setResolveState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [resolveError, setResolveError] = useState('');
  const [retry, setRetry] = useState(0);
  const searchSequence = useRef(0);
  const resolveSequence = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const sequence = ++searchSequence.current;
    if (!trimmed) { setResults([]); setOpen(false); setSearchState('idle'); setSearchError(''); return undefined; }
    const timer = window.setTimeout(async () => {
      setSearchState('loading'); setSearchError(''); setOpen(true);
      try {
        const value = await apiClient.searchCities(trimmed);
        if (sequence !== searchSequence.current) return;
        setResults(value); setActive(-1); setOpen(true); setSearchState('idle');
      } catch (error) {
        if (sequence !== searchSequence.current) return;
        setResults([]); setOpen(true); setSearchState('error'); setSearchError(error instanceof Error ? error.message : String(error));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const input = resolutionInput(draft);
  const dependency = input ? JSON.stringify(input) : '';
  useEffect(() => {
    const sequence = ++resolveSequence.current;
    setResolution(null); setResolveError('');
    if (!input) { setResolveState('idle'); return undefined; }
    const timer = window.setTimeout(async () => {
      setResolveState('loading');
      try {
        const value = await apiClient.resolveLocation(input);
        if (sequence !== resolveSequence.current) return;
        setResolution(value); setResolveState('idle');
      } catch (error) {
        if (sequence !== resolveSequence.current) return;
        setResolveState('error'); setResolveError(error instanceof Error ? error.message : String(error));
      }
    }, 350);
    return () => window.clearTimeout(timer);
  // dependency is a stable primitive representation of all resolution inputs.
  }, [dependency, retry]);

  const select = (city: CitySearchResult) => {
    onChange({ locationLabel: city.label, latitude: String(city.latitude), longitude: String(city.longitude) });
    setQuery(city.label); setOpen(false); setActive(-1);
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (!results.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') { setOpen(true); setActive((value) => value < results.length - 1 ? value + 1 : 0); }
    else if (event.key === 'ArrowUp') { setOpen(true); setActive((value) => value > 0 ? value - 1 : results.length - 1); }
    else if (active >= 0) select(results[active]);
  };
  const fieldError = (field: 'locationLabel' | 'latitude' | 'longitude') => errors[field] ? t(errors[field]!) : '';

  return <fieldset className="location-picker">
    <legend>{t('form.birthPlace')}</legend>
    <div className="profile-field location-picker__search">
      <label htmlFor={`${listId}-search`}>{t('form.locationSearch')}</label>
      <input id={`${listId}-search`} data-profile-control role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} value={query} placeholder={t('form.citySearch')}
        onChange={(event) => setQuery(event.target.value)} onFocus={() => results.length && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 0)} onKeyDown={keyDown} />
      {open && <div id={listId} role="listbox" className="location-picker__results">
        {results.map((city, index) => <button id={`${listId}-${index}`} key={city.key} type="button" role="option" aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()} onClick={() => select(city)}>{city.label}</button>)}
        {searchState === 'loading' && <span role="status">{t('form.locationSearching')}</span>}
        {searchState === 'error' && <span role="alert">{t('form.locationSearchFailed', { message: searchError })}</span>}
        {searchState === 'idle' && !results.length && <span>{t('form.locationNoResults')}</span>}
      </div>}
    </div>
    <div className="location-picker__manual">
      {([['locationLabel', 'form.locationLabel', 'text'], ['latitude', 'form.latitude', 'number'], ['longitude', 'form.longitude', 'number']] as const).map(([field, label, type]) => {
        const error = fieldError(field);
        return <div className="profile-field" key={field}><label htmlFor={`${listId}-${field}`}>{t(label)}</label>
          <input id={`${listId}-${field}`} name={field} data-profile-control type={type} step="any" value={draft[field]} aria-invalid={Boolean(error)} aria-describedby={error ? `${listId}-${field}-error` : undefined}
            onChange={(event) => onChange({ [field]: event.target.value })} />
          {error && <span id={`${listId}-${field}-error`} className="profile-field__error">{error}</span>}
        </div>;
      })}
    </div>
    <div className="location-picker__timezone" aria-live="polite">
      {resolveState === 'loading' && <span role="status">{t('form.timezoneResolving')}</span>}
      {resolution && <span>{t('form.timezoneDerived', { zone: resolution.timeZone, offset: resolution.utcOffsetLabel, instant: resolution.instantUtc })}</span>}
      {resolveState === 'error' && <span role="alert">{t('form.timezoneFailed', { message: resolveError })} <button type="button" onClick={() => setRetry((value) => value + 1)}>{t('form.retryTimezone')}</button></span>}
    </div>
  </fieldset>;
}
