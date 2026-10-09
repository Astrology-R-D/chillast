import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { fuzzyMatch } from '@chillast/search';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import './chinese.css';

function savedYear() {
  try { const year = Number(localStorage.getItem('chillast.solarTermYear')); if (Number.isInteger(year) && year >= 1 && year <= 3000) return year; } catch { /* storage unavailable */ }
  return new Date().getFullYear();
}
export function SolarTermCalendarPage() {
  const { t } = useI18n();
  const [year, setYear] = useState(savedYear);
  const [draftYear, setDraftYear] = useState(String(year));
  const [month, setMonth] = useState(0);
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['chinese', 'solarTerms', year], queryFn: () => apiClient.getSolarTerms(year), retry: false, staleTime: Infinity });
  const valid = /^\d+$/.test(draftYear) && Number(draftYear) >= 1 && Number(draftYear) <= 3000;
  const selectYear = (value: number) => {
    setYear(value); setDraftYear(String(value));
    try { localStorage.setItem('chillast.solarTermYear', String(value)); } catch { /* keep in memory */ }
  };
  const terms = (query.data?.terms || []).filter((term) => (!month || Number(term.date.slice(5, 7)) === month) && fuzzyMatch(search, [term.name, term.lunarDate, term.date]));
  return <div className="chinese-page solar-calendar-page">
    <form className="chinese-toolbar" onSubmit={(e) => { e.preventDefault(); if (valid) { if (Number(draftYear) === year) void query.refetch(); else selectYear(Number(draftYear)); } }}>
      <button type="button" aria-label={t('tools.previousYear')} disabled={year <= 1} onClick={() => selectYear(year - 1)}><ChevronLeft size={17} /></button>
      <div><label htmlFor="solar-term-year">{t('tools.solarTermYear')}</label><input id="solar-term-year" type="number" min={1} max={3000} value={draftYear} aria-invalid={!valid} aria-describedby={!valid ? 'solar-term-year-error' : undefined} onChange={(e) => setDraftYear(e.target.value)} /></div>
      <button type="button" aria-label={t('tools.nextYear')} disabled={year >= 3000} onClick={() => selectYear(year + 1)}><ChevronRight size={17} /></button>
      <button type="submit" className="chinese-primary" disabled={!valid || query.isFetching}>{t(query.isFetching ? 'tools.solarTermLoading' : 'tools.solarTermGenerate')}</button>
      <button type="button" onClick={() => selectYear(new Date().getFullYear())}>{t('tools.currentYear')}</button>
    </form>
    {!valid && <p role="alert" id="solar-term-year-error">{t('tools.yearRange')}</p>}
    <div className="solar-calendar-heading"><h2>{year} · {t('tools.solarTermTitle')}</h2>{query.data && <span>{query.data.lunarYear} · {query.data.zodiac}年</span>}<p>{t('tools.solarTermTimezone')}</p></div>
    <div className="chinese-toolbar"><div><label htmlFor="solar-term-search"><Search size={14} /> {t('tools.searchTerms')}</label><input id="solar-term-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('tools.searchTermsHint')} /></div><div><label htmlFor="solar-term-month">{t('tools.monthFilter')}</label><select id="solar-term-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}><option value={0}>{t('tools.allMonths')}</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}</select></div></div>
    {query.isPending && <div className="chinese-empty" role="status">{t('tools.solarTermLoading')}</div>}
    {query.error && <div role="alert"><p>{query.error.message}</p><button type="button" onClick={() => { void query.refetch(); }}>{t('chart.workbench.retry')}</button></div>}
    {query.data && <>{!terms.length && <p role="status">{t('tools.noMatchingTerms')}</p>}<div className="solar-months">{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
      const rows = terms.filter((term) => Number(term.date.slice(5, 7)) === m);
      return rows.length ? <section className="chinese-panel solar-month" key={m}><h3>{m}月</h3>{rows.map((term) => <article className="solar-term" key={term.date}><div><strong>{term.name}</strong><span>{term.lunarDate}</span></div><time dateTime={`${term.date}T${term.time}+08:00`}>{term.date}<span>{term.time}</span></time></article>)}</section> : null;
    })}</div></>}
  </div>;
}
