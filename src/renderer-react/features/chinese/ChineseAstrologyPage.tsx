import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, LoaderCircle } from 'lucide-react';
import { fuzzyMatch } from '@chillast/search';
import { apiClient } from '../../api/client';
import type { ChineseChartAiContext } from '../../api/contracts';
import { useI18n } from '../../i18n/I18nProvider';
import { useProfileWorkspace } from '../../stores/profileWorkspace';
import { aiStreamStore, useAiStreamStore } from '../../stores/aiStreamStore';
import { useProfiles } from '../profiles/profileQueries';
import { deactivateChartAiContextOwner, publishLatestChartAiContext } from '../charts/context/chartAiContextPublisher';
import type { RouteKey } from '../../shell/routes';
import type { BaziResult } from './contracts';
import './chinese.css';

const pillars = ['year', 'month', 'day', 'hour'] as const;
const elements = ['wood', 'fire', 'earth', 'metal', 'water'] as const;
const elementKeys = { wood: 'chinese.elementWood', fire: 'chinese.elementFire', earth: 'chinese.elementEarth', metal: 'chinese.elementMetal', water: 'chinese.elementWater', unknown: 'chinese.unknownElement' };
function Panel({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return <section className={`chinese-panel${wide ? ' chinese-panel--wide' : ''}`}><h2>{title}</h2>{children}</section>;
}

export function BaziResultPanels({ result }: { result: BaziResult }) {
  const { t } = useI18n();
  const { bazi, lunar, analysis } = result;
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const key of pillars) for (const part of [bazi.pillars[key].stem, bazi.pillars[key].branch]) if (part.element !== 'unknown') counts[part.element]++;
  const distribution = analysis?.elementCounts || counts;
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
  const lunarRows = [
    [t('chinese.lunarBirthday'), `${lunar.lunarYear}年 ${lunar.isLeapMonth ? '闰' : ''}${lunar.lunarMonth}月 ${lunar.lunarDay}`],
    [t('chinese.zodiacAnimal'), lunar.zodiacAnimal], [t('chinese.huangdiYear'), String(lunar.huangdiYear)],
    [t('chinese.eraName'), lunar.eraName], [t('chinese.solarTerm'), lunar.solarTerm],
    [t('chinese.moonPhase'), `${lunar.moonPhase.name} ${lunar.moonPhase.time}`.trim()],
    [t('chinese.festival'), lunar.festivals.major], [t('chinese.festivalImportant'), lunar.festivals.important],
    [t('chinese.festivalMinor'), lunar.festivals.minor],
  ].filter((row) => row[1]);
  return <div className="chinese-result-grid">
    <Panel title={t('chinese.pillarDetail')} wide>
      <div className="bazi-pillars">{pillars.map((key) => {
        const p = bazi.pillars[key];
        const a = analysis?.pillars.find((entry) => entry.key === key);
        return <article className="bazi-pillar" key={key} aria-label={`${t(`chinese.pillar${key[0].toUpperCase()}${key.slice(1)}`)} ${p.full}`}>
          <h3>{t(`chinese.pillar${key[0].toUpperCase()}${key.slice(1)}`)}</h3>
          <span className={`bazi-character element-${p.stem.element}`}>{p.stem.char}</span><span className="bazi-pillar__relation">{a?.stemTenGod || ''}</span>
          <span className={`bazi-character element-${p.branch.element}`}>{p.branch.char}</span>
          <small>{p.branch.animal} · {t(elementKeys[p.stem.element])}/{t(elementKeys[p.branch.element])}</small>
          <small>{t(p.stem.yinYang === 'yang' ? 'chinese.yang' : 'chinese.yin')} / {t(p.branch.yinYang === 'yang' ? 'chinese.yang' : 'chinese.yin')}</small>
        </article>;
      })}</div>
    </Panel>
    <Panel title={t('chinese.dayMasterAnalysis')}>
      <div className="bazi-day-master"><span className={`bazi-character element-${bazi.dayMaster.element}`}>{bazi.dayMaster.char}</span><div><strong>{t('chinese.dayMasterIs', { element: t(elementKeys[bazi.dayMaster.element]) })}</strong><p>{t(bazi.dayMaster.yinYang === 'yang' ? 'chinese.yang' : 'chinese.yin')}</p></div></div>
      <p>{t('chinese.trueSolarTime')} <strong>{bazi.localTrueSolarTime}</strong></p>
      {analysis && <><p>{t('chinese.dayMasterStrength', { label: analysis.strength.label, n: analysis.strength.supportive, total: analysis.strength.total })}</p><p className="chinese-muted">{t('chinese.strengthHint')}</p></>}
    </Panel>
    <Panel title={t('chinese.fiveElementsDist')}>
      <p className="chinese-muted">{t(analysis ? 'chinese.distributionHidden' : 'chinese.distributionVisible')}</p>
      {elements.map((key) => <div className="bazi-element-row" key={key}><span>{t(elementKeys[key])}</span><div role="meter" aria-label={t(elementKeys[key])} aria-valuenow={distribution[key]} aria-valuemin={0} aria-valuemax={total}><span className={`element-fill-${key}`} style={{ width: `${distribution[key] / total * 100}%` }} /></div><output>{distribution[key]}</output></div>)}
    </Panel>
    {analysis && <Panel title={t('chinese.tenGodsTitle')} wide><div className="chinese-table-wrap" tabIndex={0}><table><thead><tr><th>{t('chinese.colPillar')}</th><th>{t('chinese.colStem')}</th><th>{t('chinese.colBranch')}</th><th>{t('chinese.colHidden')}</th></tr></thead><tbody>{analysis.pillars.map((p) => <tr key={p.key}>
      <th scope="row">{t(`chinese.pillar${p.key[0].toUpperCase()}${p.key.slice(1)}`)}</th><td><strong className={`element-${p.stemElement}`}>{p.stemChar}</strong> {p.stemTenGod}</td><td><strong className={`element-${p.branchElement}`}>{p.branchChar}</strong> {p.branchAnimal}</td><td>{p.hidden.map((h) => <span className="bazi-hidden-stem" key={h.char}><strong className={`element-${h.element}`}>{h.char}</strong> · {h.tenGod}</span>)}</td>
    </tr>)}</tbody></table></div></Panel>}
    <Panel title={t('chinese.lunarTitle')}><dl className="chinese-definition-list">{lunarRows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></Panel>
    <Panel title={t('chinese.allShichen')}><div className="chinese-table-wrap" tabIndex={0}><table><thead><tr><th>{t('chinese.shichen')}</th><th>{t('chinese.hourRange')}</th><th>{t('chinese.pillarPair')}</th></tr></thead><tbody>{bazi.allHourPillars.map((h) => <tr key={h.shichen} data-current={h.isCurrent || undefined}><th scope="row">{h.shichen}时{h.isCurrent ? ` · ${t('chinese.currentHour')}` : ''}</th><td>{h.hours}</td><td><span className={`element-${h.stem.element}`}>{h.stem.char}</span><span className={`element-${h.branch.element}`}>{h.branch.char}</span></td></tr>)}</tbody></table></div></Panel>
  </div>;
}

export function ChineseAstrologyPage({ onNavigate }: { onNavigate(route: RouteKey): void }) {
  const { t } = useI18n();
  const profiles = useProfiles();
  const primaryId = useProfileWorkspace((state) => state.primaryProfileId);
  const setPrimary = useProfileWorkspace((state) => state.setPrimaryProfile);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [openingAi, setOpeningAi] = useState(false);
  const streamActive = useAiStreamStore((state) => state.active);
  const owner = useRef(Symbol('chinese-chart'));
  const alive = useRef(true);
  const profile = profiles.data?.find((p) => p.id === primaryId) || profiles.data?.[0];
  const signature = profile ? JSON.stringify(profile.birthData) : '';
  const query = useQuery({ queryKey: ['chinese', 'bazi', profile?.id, signature], queryFn: () => apiClient.computeBazi(profile!), enabled: false, retry: false });
  const result = profile ? query.data : undefined;
  const context = useMemo<ChineseChartAiContext | null>(() => profile ? {
    kind: 'chinese-chart', route: 'chinese', chartType: 'bazi', resultId: result ? `bazi:${profile.id}:${query.dataUpdatedAt}` : null,
    activeProfile: { id: profile.id, nameZh: profile.nameZh, nameEn: profile.nameEn, displayName: profile.nameZh || profile.nameEn, gender: profile.gender, birthData: profile.birthData }, lastBaziData: result || null,
  } : null, [profile, result, query.dataUpdatedAt]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; deactivateChartAiContextOwner(owner.current, apiClient.setAiChartContext, () => {}); };
  }, []);
  useEffect(() => { if (context) publishLatestChartAiContext(owner.current, context, apiClient.setAiChartContext, (error) => { if (alive.current) setFeedback(error ? String(error) : null); }); }, [context]);
  const filtered = (profiles.data || []).filter((p) => p.id === profile?.id || fuzzyMatch(search, [p.nameZh, p.nameEn, ...p.tags]));
  async function interpret() {
    if (!context || streamActive) return;
    setOpeningAi(true); setFeedback(null);
    try {
      const store = aiStreamStore.getState();
      if (!store.activeSessionId) { const session = await apiClient.createAiSession(); if (!alive.current) return; store.setActiveSessionId(session.id); }
      await apiClient.setAiChartContext(context);
      if (!alive.current) return;
      store.requestPanelOpen(); store.startChat({ role: 'user', content: `请结合当前档案 ${context.activeProfile.displayName} 的八字命盘，分析五行、十神与藏干，用自然语言回应并保留可展开的判据。` });
    } catch (e) { if (alive.current) setFeedback(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current) setOpeningAi(false); }
  }
  if (profiles.isPending) return <div className="chinese-page" role="status">{t('shell.loading')}</div>;
  if (profiles.error) return <div className="chinese-page" role="alert">{profiles.error.message}<button type="button" onClick={() => { void profiles.refetch(); }}>{t('chart.workbench.retry')}</button></div>;
  if (!profiles.data?.length) return <div className="chinese-page chinese-empty"><p>{t('chinese.needProfile')}</p><button type="button" onClick={() => onNavigate('profiles')}>{t('nav.profiles')}</button></div>;
  return <div className="chinese-page">
    <div className="chinese-toolbar"><div><label htmlFor="bazi-profile-search">{t('chinese.profileSearch')}</label><input id="bazi-profile-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('chinese.profileSearchHint')} /></div>
      <div><label htmlFor="bazi-profile">{t('chinese.labelProfile')}</label><select id="bazi-profile" value={profile?.id || ''} disabled={query.isFetching || openingAi} onChange={(e) => setPrimary(e.target.value)}>{filtered.map((p) => <option key={p.id} value={p.id}>{p.nameZh || p.nameEn} · {p.birthData.year}-{p.birthData.month}-{p.birthData.day}</option>)}</select></div>
      <button type="button" className="chinese-primary" disabled={!profile || query.isFetching} onClick={() => { setFeedback(null); void query.refetch(); }}>{query.isFetching ? <LoaderCircle className="chinese-spinner" size={16} /> : null}{t(query.isFetching ? 'chinese.loading' : 'chinese.generate')}</button>
      <button type="button" disabled={!profile || streamActive || query.isFetching || openingAi} onClick={() => { void interpret(); }}><Bot size={16} />{t('ai.interpret')}</button>
    </div>
    {query.error && <p role="alert">{query.error.message}</p>}{feedback && <p role="alert">{feedback}</p>}
    {result ? <><div className="chinese-result-heading"><strong>{profile?.nameZh || profile?.nameEn}</strong><span>{profile?.birthData.year}-{profile?.birthData.month}-{profile?.birthData.day} {String(profile?.birthData.hour).padStart(2, '0')}:{String(profile?.birthData.minute).padStart(2, '0')} · {profile?.birthData.location.label}</span></div><BaziResultPanels result={result} /></>
      : <div className="chinese-empty" role="status"><span aria-hidden="true">☯</span><p>{t(query.isFetching ? 'chinese.loading' : 'chinese.emptyResult')}</p></div>}
  </div>;
}
