import { useEffect, useId, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { apiClient } from '../../../api/client';
import type { CitySearchResult } from '../../../api/contracts';
import { useI18n } from '../../../i18n/I18nProvider';

export interface RelocationPickerProps {
  value: CitySearchResult | null;
  error?: string;
  disabled?: boolean;
  recents: readonly CitySearchResult[];
  onChange(value: CitySearchResult | null): void;
  onClearRecents(): void;
}

export function RelocationPicker({ value, error, disabled = false, recents, onChange, onClearRecents }: RelocationPickerProps) {
  const { t } = useI18n();
  const id = useId();
  const errorId = `${id}-error`;
  const [query, setQuery] = useState(value?.label ?? '');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sequence = useRef(0);

  useEffect(() => {
    if (!value) return;
    sequence.current += 1;
    setQuery(value.label);
    setResults([]);
    setStatus('idle');
    setOpen(false);
    setActiveIndex(-1);
  }, [value?.key, value?.label]);

  useEffect(() => {
    const trimmed = query.trim();
    const request = ++sequence.current;
    if (!trimmed || trimmed === value?.label) { setResults([]); setStatus('idle'); return undefined; }
    const timer = window.setTimeout(() => {
      setStatus('loading');
      void apiClient.searchCities(trimmed).then((cities) => {
        if (request !== sequence.current) return;
        setResults(cities); setActiveIndex(-1); setStatus('idle');
      }, () => {
        if (request !== sequence.current) return;
        setResults([]); setStatus('error');
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, value?.label]);

  const select = (city: CitySearchResult) => {
    if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) return;
    sequence.current += 1;
    setQuery(city.label);
    setResults([]);
    setStatus('idle');
    setOpen(false);
    setActiveIndex(-1);
    onChange(city);
  };
  const options = query.trim() ? results : [...recents];
  const visibleOptions = open ? options : [];
  const activeId = activeIndex >= 0 && activeIndex < visibleOptions.length
    ? `${id}-option-${activeIndex}`
    : undefined;

  const clearQuery = () => {
    sequence.current += 1;
    setQuery(value?.label ?? '');
    setResults([]);
    setStatus('idle');
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      sequence.current += 1;
      setResults([]);
      setStatus('idle');
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (event.key === 'ArrowDown') return current < options.length - 1 ? current + 1 : 0;
        return current > 0 ? current - 1 : options.length - 1;
      });
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < visibleOptions.length) {
      event.preventDefault();
      select(visibleOptions[activeIndex]);
    }
  };

  return <Tooltip.Provider delayDuration={250}><div className="chart-field relocation-picker" data-testid="chart-filter-control" data-control="relocationPlace">
    <label htmlFor={id}>{t('chart.workbench.relocation')}</label>
    <div className="chart-field__input-row">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`} aria-activedescendant={activeId} aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined} value={query} disabled={disabled}
        placeholder={t('chart.workbench.searchPlace')} onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)} onChange={(event) => {
          sequence.current += 1;
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
          onChange(null);
        }} />
      <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="icon-button" aria-label={t('chart.workbench.clearQuery')}
        disabled={disabled} onClick={clearQuery}><X size={15} /></button></Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Content>{t('chart.workbench.clearQuery')}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
      <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="icon-button"
        aria-label={`${t('chart.workbench.clear')}${t('chart.workbench.relocation')}${t('chart.workbench.recents')}`}
        disabled={disabled} onClick={onClearRecents}><Trash2 size={15} /></button></Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Content>{t('chart.workbench.clearRecents')}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    </div>
    {open && (options.length > 0 || status !== 'idle') && <div id={`${id}-list`} role="listbox"
      aria-label={t('chart.workbench.relocation')} className="relocation-picker__list">
      {options.map((city, index) => <button id={`${id}-option-${index}`} key={city.key} type="button" role="option"
        aria-selected={activeIndex === index}
        onClick={() => select(city)}><span>{city.label}</span><small>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</small></button>)}
      {status === 'loading' && <span role="status">{t('chart.workbench.searchingPlace')}</span>}
      {status === 'error' && <span role="alert">{t('chart.workbench.placeSearchFailed')}</span>}
    </div>}
    {error && <span id={errorId} className="chart-field__error">{error}</span>}
  </div></Tooltip.Provider>;
}
