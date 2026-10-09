export type AiReadingFont = 'system' | 'sans' | 'serif' | 'mono' | 'custom';
export interface AiReadingPreferences {
  font: AiReadingFont;
  customFont: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  letterSpacing: number;
  contentWidth: number;
}

export const DEFAULT_AI_READING: AiReadingPreferences = {
  font: 'system', customFont: '', fontSize: 16, lineHeight: 1.8,
  paragraphSpacing: .9, letterSpacing: 0, contentWidth: 68,
};
export const AI_READING_RANGES = {
  fontSize: [12, 24, 1], lineHeight: [1.3, 2.4, .05], paragraphSpacing: [.4, 1.8, .1],
  letterSpacing: [0, 1.5, .1], contentWidth: [40, 100, 2],
} as const;
const FONTS: Record<Exclude<AiReadingFont, 'custom'>, string> = {
  system: "'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif",
  sans: "'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', sans-serif",
  serif: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif",
  mono: "'Maple Mono NF CN', Consolas, 'Microsoft YaHei', monospace",
};

/** Persist only supported fields; custom font names cannot introduce CSS declarations. */
export function normalizeAiReading(value: unknown): AiReadingPreferences {
  const v = value && typeof value === 'object' ? value as Partial<AiReadingPreferences> : {};
  const result = { ...DEFAULT_AI_READING };
  if (['system', 'sans', 'serif', 'mono', 'custom'].includes(v.font || '')) result.font = v.font!;
  if (typeof v.customFont === 'string' && v.customFont.length <= 100 && /^[\p{L}\p{N} .,\-_]*$/u.test(v.customFont)) result.customFont = v.customFont;
  for (const key of Object.keys(AI_READING_RANGES) as Array<keyof typeof AI_READING_RANGES>) {
    const n = v[key]; const [min, max] = AI_READING_RANGES[key];
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;
  }
  return result;
}

export function aiReadingStyles(value: AiReadingPreferences): Record<string, string> {
  const p = normalizeAiReading(value);
  const custom = p.customFont.split(',').map((s) => s.trim()).filter(Boolean).map((s) => `'${s}'`).join(', ');
  return {
    '--ai-font-family': p.font === 'custom' ? `${custom ? `${custom}, ` : ''}${FONTS.system}` : FONTS[p.font],
    '--ai-font-size': `${p.fontSize}px`, '--ai-line-height': String(p.lineHeight),
    '--ai-paragraph-spacing': `${p.paragraphSpacing}em`, '--ai-letter-spacing': `${p.letterSpacing}px`,
    '--ai-content-width': `${p.contentWidth}ch`,
  };
}
