import { useId } from 'react';

interface MaxTokensControlProps {
  value: number;
  max: number;
  min?: number;
  step?: number;
  limitLabel: string;
  ariaLabel: string;
  onChange(value: number): void;
}

/**
 * Slider + number-input combo for maxTokens (spec §4). Both controls share one
 * value; typed input is clamped to [min, max] on change, and blur restores the
 * last valid value so half-typed or invalid states never reach the form state.
 */
export function MaxTokensControl({ value, max, min = 512, step = 512, limitLabel, ariaLabel, onChange }: MaxTokensControlProps) {
  const id = useId();
  const clamp = (candidate: number) => Math.max(min, Math.min(candidate, max));
  return (
    <div className="maxtokens">
      <label htmlFor={`${id}-range`}>{ariaLabel}</label>
      <input
        id={`${id}-range`} type="range" aria-label={ariaLabel}
        min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <input
        id={`${id}-number`} type="number" aria-label={ariaLabel}
        className="maxtokens__number"
        min={min} max={max} value={value}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === '') return; // mid-typing; normalize on blur
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        onBlur={(event) => { event.target.value = String(value); }}
      />
      <span className="maxtokens__value">{value}</span>
      <span className="maxtokens__limit">{limitLabel}</span>
    </div>
  );
}
