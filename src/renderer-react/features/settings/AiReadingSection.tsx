import type { CSSProperties } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../preferences/preferences';
import { AI_READING_RANGES, aiReadingStyles, type AiReadingFont } from '../../preferences/aiReading';
import { MarkdownMessage } from '../ai/MarkdownMessage';
import type { AnalysisReport } from '../../api/contracts';

const PREVIEW_REPORT: AnalysisReport = { version: 1, contextKey: 'reading-preview', focus: '排版示例', sources: [], questions: [], claims: [
  { id: 'E1', statement: '这是一张用于查看字体和间距的示例卡片。', facts: [{ callId: 'preview', key: 'layout', text: '展开判据后，正文与卡片也使用当前阅读设置。' }], sourceIds: [], limitations: '', question: '' },
] };
const PREVIEW = '### 留一点空间，慢慢说\n\n不必急着为眼前的困扰下结论。我们可以先从最近的一次经历说起，看看你在意的是什么。[判据 1](evidence:E1)\n\n- **具体情境**：当时发生了什么？\n- **你的感受**：哪些部分让你特别在意？\n\n> 字体、行距和段落间距会立即应用到对话正文；原始消息与引用内容保持原样。';

export function AiReadingSection() {
  const { t } = useI18n();
  const reading = usePreferences((s) => s.aiReading);
  const setReading = usePreferences((s) => s.setAiReading);
  const reset = usePreferences((s) => s.resetAiReading);
  return <section className="settings-section" aria-labelledby="settings-ai-reading">
    <h2 id="settings-ai-reading">{t('settings.reading.title')}</h2>
    <p className="settings-hint">{t('settings.reading.hint')}</p>
    <div className="settings-field"><label htmlFor="settings-reading-font">{t('settings.reading.font')}</label>
      <select id="settings-reading-font" className="settings-select" value={reading.font} onChange={(event) => setReading({ font: event.target.value as AiReadingFont })}>
        {(['system', 'sans', 'serif', 'mono', 'custom'] as const).map((font) => <option key={font} value={font}>{t(`settings.reading.fonts.${font}`)}</option>)}
      </select>
    </div>
    {reading.font === 'custom' && <div className="settings-field"><label htmlFor="settings-reading-custom-font">{t('settings.reading.customFont')}</label>
      <input id="settings-reading-custom-font" className="settings-input" value={reading.customFont} maxLength={100} placeholder="Microsoft YaHei, Segoe UI" onChange={(event) => setReading({ customFont: event.target.value })} />
    </div>}
    {(reading.font === 'custom' || reading.font === 'serif') && <p className="settings-hint">{t('settings.reading.localFontHint')}</p>}
    {(Object.keys(AI_READING_RANGES) as Array<keyof typeof AI_READING_RANGES>).map((key) => {
      const [min, max, step] = AI_READING_RANGES[key];
      const unit = key === 'lineHeight' ? '×' : key === 'paragraphSpacing' ? 'em' : key === 'contentWidth' ? 'ch' : 'px';
      return <div className="settings-field" key={key}><label htmlFor={`settings-reading-${key}`}>{t(`settings.reading.${key}`)}</label>
        <div className="reading-range"><input id={`settings-reading-${key}`} type="range" min={min} max={max} step={step} value={reading[key]} aria-valuetext={`${reading[key]} ${unit}`} onChange={(event) => setReading({ [key]: Number(event.target.value) })} /><output htmlFor={`settings-reading-${key}`}>{reading[key]} {unit}</output></div>
      </div>;
    })}
    <div className="settings-row"><span>{t('settings.reading.presets')}</span>
      <button type="button" onClick={reset}>{t('settings.reading.comfortable')}</button>
      <button type="button" onClick={() => setReading({ font: 'serif', fontSize: 17, lineHeight: 1.9, paragraphSpacing: 1.1, letterSpacing: .1, contentWidth: 64 })}>{t('settings.reading.book')}</button>
      <button type="button" onClick={() => setReading({ font: 'sans', fontSize: 14, lineHeight: 1.55, paragraphSpacing: .6, letterSpacing: 0, contentWidth: 80 })}>{t('settings.reading.compact')}</button>
    </div>
    <div className="reading-preview" style={aiReadingStyles(reading) as CSSProperties}>
      <small className="reading-preview__label">{t('settings.reading.preview')}</small>
      <MarkdownMessage content={PREVIEW} report={PREVIEW_REPORT} />
    </div>
    <small className="settings-hint" role="status">{t('settings.reading.saved')}</small>
  </section>;
}
