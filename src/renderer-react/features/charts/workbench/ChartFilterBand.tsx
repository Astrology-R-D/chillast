import { Clock3, RotateCcw, Trash2, X } from 'lucide-react';
import { useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { Profile } from '../../../api/contracts';
import { useI18n } from '../../../i18n/I18nProvider';
import { useChartWorkspace } from '../../../stores/chartWorkspace';
import { CHART_DESCRIPTORS, PERSONAL_CHART_TYPES, RELATIONSHIP_CHART_TYPES } from '../catalog';
import type { ChartReferenceData, ChartRoute } from '../contracts';
import type { RequestStatus } from '../../../stores/chartWorkspace';
import { DEFAULT_ASPECTS, type ChartDraft, type ChartDraftErrorCode, type DraftValidation } from './chartDraft';
import { RelocationPicker } from './RelocationPicker';

export interface ChartFilterBandProps {
  route: ChartRoute;
  draft: ChartDraft;
  profiles: readonly Profile[];
  reference: ChartReferenceData;
  validation: DraftValidation;
  status: RequestStatus;
  equivalentInFlight: boolean;
  disabled?: boolean;
  onPatch(patch: Partial<ChartDraft>): void;
  onCalculate(): void;
  onReset(): void;
  onCancel(): void;
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="chart-field__error">{message}</span> : null;
}

export function ChartFilterBand(props: ChartFilterBandProps) {
  const { t } = useI18n();
  const errorPrefix = useId();
  const { route, draft, profiles, reference, validation, equivalentInFlight, onPatch } = props;
  const recents = useChartWorkspace((state) => state.workspace.recents);
  const clearRecent = useChartWorkspace((state) => state.clearRecent);
  const types = route === 'personal' ? PERSONAL_CHART_TYPES : RELATIONSHIP_CHART_TYPES;
  const controls = CHART_DESCRIPTORS[draft.type].controls;
  const controlEnabled = (name: string) => controls.some((control) => control === name);
  const disabled = Boolean(props.disabled);
  const localizeError = (code?: ChartDraftErrorCode) => code ? t(`chart.workbench.${code}`) : undefined;
  const errorId = (key: keyof DraftValidation['fieldErrors']) => `${errorPrefix}-${String(key)}-error`;
  const errorAttributes = (key: keyof DraftValidation['fieldErrors']) => ({
    'aria-invalid': validation.fieldErrors[key] ? true : undefined,
    'aria-describedby': validation.fieldErrors[key] ? errorId(key) : undefined,
  });
  const field = (control: string, label: string, child: React.ReactNode, key: keyof DraftValidation['fieldErrors']) => <div
    className="chart-field" data-testid="chart-filter-control" data-control={control}>
    <label>{label}{child}</label><ErrorText id={errorId(key)} message={localizeError(validation.fieldErrors[key])} />
  </div>;

  const recentMenu = (
    label: string,
    key: keyof typeof recents,
    items: ReadonlyArray<{ value: string; label: string }>,
    onSelect: (value: string) => void,
  ) => <Popover.Root><Popover.Trigger asChild><button type="button" className="icon-button"
    disabled={disabled} aria-label={`${label}${t('chart.workbench.recents')}`}><Clock3 size={15} /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="chart-popover">{items.map((item) => <button key={item.value}
      type="button" onClick={() => onSelect(item.value)}>{item.label}</button>)}
      <button type="button" aria-label={`${t('chart.workbench.clear')}${label}${t('chart.workbench.recents')}`}
        onClick={() => clearRecent(key)}><Trash2 size={14} />{t('chart.workbench.clearRecents')}</button>
    </Popover.Content></Popover.Portal></Popover.Root>;

  const profileControl = (secondary: boolean) => {
    const key = secondary ? 'secondaryProfileId' : 'primaryProfileId';
    const label = secondary ? t('chart.workbench.secondaryProfile') : t('chart.workbench.primaryProfile');
    const recentIds = secondary ? recents.secondaryProfileIds : recents.primaryProfileIds;
    return <div className="chart-field" data-testid="chart-filter-control" data-control={secondary ? 'secondaryProfile' : 'primaryProfile'}>
      <label>{label}<span className="chart-field__input-row"><select aria-label={label} value={draft[key] ?? ''}
        disabled={disabled} {...errorAttributes(key)}
        onChange={(event) => onPatch({ [key]: event.target.value || null })}>
        <option value="">{t('chart.workbench.selectProfile')}</option>
        {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.nameZh || profile.nameEn}</option>)}
      </select>{recentMenu(label, secondary ? 'secondaryProfileIds' : 'primaryProfileIds', recentIds.map((id) => ({
        value: id, label: profiles.find((profile) => profile.id === id)?.nameZh ?? id,
      })), (id) => onPatch({ [key]: id }))}
      <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="icon-button" aria-label={`${t('chart.workbench.clear')} ${label}`}
        disabled={disabled} onClick={() => onPatch({ [key]: null })}><X size={15} /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content>{t('chart.workbench.clear')}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
      </span></label><ErrorText id={errorId(key)} message={localizeError(validation.fieldErrors[key])} />
    </div>;
  };

  const houseSystems = reference.houseSystems.length > 0
    ? reference.houseSystems
    : [{ value: draft.houseSystem, nameEn: draft.houseSystem, nameZh: draft.houseSystem }];

  return <Tooltip.Provider delayDuration={250}><section className="chart-filter-band" role="group" aria-label={t('chart.workbench.filters')}>
    {profileControl(false)}
    {field('chartType', t('chart.workbench.chartType'), <span className="chart-field__input-row"><select
      aria-label={t('chart.workbench.chartType')} value={draft.type} disabled={disabled} {...errorAttributes('type')}
      onChange={(event) => onPatch({ type: event.target.value as ChartDraft['type'] })}>
      {types.map((type) => <option key={type} value={type}>{reference.chartTypes.find((item) => item.type === type)?.nameZh ?? type}</option>)}
    </select>{recentMenu(t('chart.workbench.chartType'), 'chartTypes', recents.chartTypes
      .filter((type) => types.includes(type)).map((type) => ({ value: type, label: reference.chartTypes.find((item) => item.type === type)?.nameZh ?? type })),
    (type) => onPatch({ type: type as ChartDraft['type'] }))}</span>, 'type')}
    {controlEnabled('secondaryProfile') && profileControl(true)}
    {controlEnabled('targetDate') && field('targetDate', t('chart.workbench.targetDate'), <input aria-label={t('chart.workbench.targetDate')}
      type="datetime-local" value={draft.targetLocal} disabled={disabled} {...errorAttributes('targetLocal')}
      onChange={(event) => onPatch({ targetLocal: event.target.value })} />, 'targetLocal')}
    {controlEnabled('returnYear') && field('returnYear', t('chart.workbench.returnYear'), <input aria-label={t('chart.workbench.returnYear')}
      type="number" min={1} max={3000} value={draft.returnYear} disabled={disabled} {...errorAttributes('returnYear')}
      onChange={(event) => onPatch({ returnYear: Number(event.target.value) })} />, 'returnYear')}
    {controlEnabled('relocationPlace') && <RelocationPicker value={draft.relocationPlace}
      error={localizeError(validation.fieldErrors.relocationPlace)} disabled={disabled}
      recents={recents.relocationPlaces.map((place) => ({ ...place, key: place.id, nameZh: place.label, nameEn: '', region: '', country: '', source: 'western' }))}
      onChange={(relocationPlace) => onPatch({ relocationPlace })} onClearRecents={() => clearRecent('relocationPlaces')} />}
    {field('houseSystem', t('chart.workbench.houseSystem'), <span className="chart-field__input-row"><select
      aria-label={t('chart.workbench.houseSystem')} value={draft.houseSystem} disabled={disabled} {...errorAttributes('houseSystem')}
      onChange={(event) => onPatch({ houseSystem: event.target.value })}>{houseSystems.map((system) => <option key={system.value} value={system.value}>{system.nameZh}</option>)}</select>
      {recentMenu(t('chart.workbench.houseSystem'), 'houseSystems', recents.houseSystems.map((value) => ({ value,
        label: reference.houseSystems.find((item) => item.value === value)?.nameZh ?? value })), (houseSystem) => onPatch({ houseSystem }))}</span>, 'houseSystem')}
    {field('zodiac', t('chart.workbench.zodiac'), <span className="chart-field__input-row"><select aria-label={t('chart.workbench.zodiac')}
      value={draft.zodiac} disabled={disabled} {...errorAttributes('zodiac')}
      onChange={(event) => onPatch({ zodiac: event.target.value as ChartDraft['zodiac'] })}><option value="tropical">{t('chart.workbench.tropical')}</option><option value="sidereal">{t('chart.workbench.sidereal')}</option></select>
      {recentMenu(t('chart.workbench.zodiac'), 'zodiacs', recents.zodiacs.map((value) => ({ value,
        label: t(`chart.workbench.${value}`) })), (zodiac) => onPatch({ zodiac: zodiac as ChartDraft['zodiac'] }))}</span>, 'zodiac')}
    <div className="chart-filter-band__command" data-testid="chart-filter-control" data-control="advanced"><Dialog.Root>
       <Dialog.Trigger asChild><button type="button" disabled={disabled} {...errorAttributes('advancedAspects')}>{t('chart.workbench.advanced')}</button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="chart-dialog__overlay" /><Dialog.Content className="chart-dialog" aria-describedby={undefined}>
        <Dialog.Title>{t('chart.workbench.advanced')}</Dialog.Title>
        <div className="chart-aspects">{DEFAULT_ASPECTS.map((key) => {
          const enabled = draft.enabledAspects.includes(key);
          return <div key={key} className="chart-aspects__row"><label><input type="checkbox" checked={enabled} disabled={disabled} onChange={() => onPatch({
            enabledAspects: enabled ? draft.enabledAspects.filter((item) => item !== key) : [...draft.enabledAspects, key],
          })} />{reference.aspects[key]?.nameZh ?? key}</label><input type="number" aria-label={`${reference.aspects[key]?.nameZh ?? key}${t('chart.workbench.orb')}`}
            disabled={disabled} {...errorAttributes('advancedAspects')}
            min={0.1} max={15} step={0.1} value={draft.orbOverrides[key] ?? reference.aspects[key]?.defaultOrb ?? 5}
            onChange={(event) => onPatch({ orbOverrides: { ...draft.orbOverrides, [key]: Number(event.target.value) } })} /></div>;
        })}</div><ErrorText id={errorId('advancedAspects')} message={localizeError(validation.fieldErrors.advancedAspects)} />
        <div className="chart-dialog__actions"><button type="button" onClick={() => onPatch({ enabledAspects: [...DEFAULT_ASPECTS], orbOverrides: {} })}>{t('chart.workbench.resetAspects')}</button>
          <Dialog.Close asChild><button type="button">{t('chart.workbench.close')}</button></Dialog.Close></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root></div>
    <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="icon-button chart-filter-band__reset" aria-label={t('chart.workbench.reset')}
      disabled={disabled} onClick={props.onReset}><RotateCcw size={16} /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content>{t('chart.workbench.reset')}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    <div className="chart-filter-band__command" data-testid="chart-filter-control" data-control="calculate"><button type="button"
      disabled={disabled || !validation.valid || equivalentInFlight || (route === 'relationship' && profiles.length < 2)} onClick={props.onCalculate}>{t('chart.workbench.calculate')}</button></div>
  </section></Tooltip.Provider>;
}
