import { useId, useState } from 'react';

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
 * Slider + number-input combo for maxTokens (spec §4). While the number input
 * is focused it displays a local draft (so char-by-char typing is never fought
 * by the controlled echo); each well-formed keystroke reports the clamped
 * value upstream, and blur drops the draft so the input snaps to the committed
 * value — invalid or half-typed states never reach the form state.
 */
export function MaxTokensControl({ value, max, min = 512, step = 512, limitLabel, ariaLabel, onChange }: MaxTokensControlProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null); // non-null while the number input is focused
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
        min={min} max={max}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const trimmed = raw.trim();
          if (trimmed === '') return; // mid-typing; committed value stays
          const parsed = Number(trimmed);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="maxtokens__value">{value}</span>
      <span className="maxtokens__limit">{limitLabel}</span>
    </div>
  );
}
