import { useEffect, useId, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { apiClient } from '../../../api/client';
import type { CitySearchResult } from '../../../api/contracts';
import { useI18n } from '../../../i18n/I18nProvider';

export interface RelocationPickerProps {
  value: CitySearchResult | null;
  error?: string;
  recents: readonly CitySearchResult[];
  onChange(value: CitySearchResult): void;
  onClearRecents(): void;
}

export function RelocationPicker({ value, error, recents, onChange, onClearRecents }: RelocationPickerProps) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState(value?.label ?? '');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const sequence = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const request = ++sequence.current;
    if (!trimmed || trimmed === value?.label) { setResults([]); setStatus('idle'); return undefined; }
    const timer = window.setTimeout(() => {
      setStatus('loading');
      void apiClient.searchCities(trimmed).then((cities) => {
        if (request !== sequence.current) return;
        setResults(cities); setStatus('idle');
      }, () => {
        if (request !== sequence.current) return;
        setResults([]); setStatus('error');
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, value?.label]);

  const select = (city: CitySearchResult) => {
    if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) return;
    sequence.current += 1; setQuery(city.label); setResults([]); setStatus('idle'); onChange(city);
  };
  const options = query.trim() ? results : [...recents];

  return <div className="chart-field relocation-picker" data-testid="chart-filter-control" data-control="relocationPlace">
    <label htmlFor={id}>{t('chart.workbench.relocation')}</label>
    <div className="chart-field__input-row">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={options.length > 0}
        aria-controls={`${id}-list`} aria-invalid={Boolean(error)} value={query}
        placeholder={t('chart.workbench.searchPlace')} onChange={(event) => setQuery(event.target.value)} />
      <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="icon-button" aria-label={t('chart.workbench.clearQuery')}
        onClick={() => { sequence.current += 1; setQuery(''); setResults([]); setStatus('idle'); }}><X size={15} /></button></Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Content>{t('chart.workbench.clearQuery')}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
      <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="icon-button" aria-label={t('chart.workbench.clearRecents')}
        onClick={onClearRecents}><Trash2 size={15} /></button></Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Content>{t('chart.workbench.clearRecents')}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    </div>
    {(options.length > 0 || status !== 'idle') && <div id={`${id}-list`} role="listbox" className="relocation-picker__list">
      {options.map((city) => <button key={city.key} type="button" role="option" aria-selected={value?.key === city.key}
        onClick={() => select(city)}><span>{city.label}</span><small>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</small></button>)}
      {status === 'loading' && <span role="status">{t('chart.workbench.searchingPlace')}</span>}
      {status === 'error' && <span role="alert">{t('chart.workbench.placeSearchFailed')}</span>}
    </div>}
    {error && <span className="chart-field__error">{error}</span>}
  </div>;
}
