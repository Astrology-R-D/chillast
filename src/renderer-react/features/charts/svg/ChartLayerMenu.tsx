import { Layers } from 'lucide-react';
import { useState } from 'react';
import { useChartWorkspace } from '../../../stores/chartWorkspace';
import type { NormalizedChartResult } from '../contracts';
import { useI18n } from '../../../i18n/I18nProvider';

export function ChartLayerMenu({ result }: { result: NormalizedChartResult }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const layers = useChartWorkspace((state) => state.layers);
  const setLayers = useChartWorkspace((state) => state.setLayers);
  const resetLayers = useChartWorkspace((state) => state.resetLayers);
  const toggle = (key: 'majorAspects' | 'minorAspects' | 'houses' | 'labels') =>
    setLayers({ [key]: !layers[key] });
  return <div className="chart-layer-menu" data-export-exclude="true">
    <button type="button" className="chart-toolbar__button" aria-label={t('chart.svg.layers')} title={t('chart.svg.layers')} aria-expanded={open}
      onClick={() => setOpen((value) => !value)}><Layers size={17} /></button>
    {open && <div className="chart-layer-menu__popover" role="menu" aria-label={t('chart.svg.layers')}>
      {([['majorAspects', 'majorAspects'], ['minorAspects', 'minorAspects'], ['houses', 'houses'], ['labels', 'labels']] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />{t(`chart.svg.${label}`)}</label>)}
      {result.rings.map((ring, index) => <label key={ring.id}>
        <input type="checkbox" checked={layers.rings[ring.id] ?? true}
          onChange={() => setLayers({ rings: { ...layers.rings, [ring.id]: !(layers.rings[ring.id] ?? true) } })} />
        <span className={`chart-layer-menu__sample chart-layer-menu__sample--${index % 3}`} aria-hidden="true" />{t('chart.svg.ringVisibility', { ring: ring.label })}
      </label>)}
      <button type="button" onClick={() => resetLayers(result)}>{t('chart.svg.resetLayers')}</button>
    </div>}
  </div>;
}
