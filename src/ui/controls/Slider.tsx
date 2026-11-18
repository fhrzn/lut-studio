import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import styles from './controls.module.css';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Value restored by double-clicking the slider. */
  defaultValue: number;
  onChange: (value: number) => void;
  /** CSS background for the track, e.g. a hue gradient. */
  trackBackground?: string;
}

const NAV_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

const decimalsOf = (step: number): number =>
  Number.isInteger(step) ? 0 : (String(step).split('.')[1]?.length ?? 2);

/** Pointer drags and held arrow keys are each one undo step. */
function useGesture() {
  const { beginEdit, endEdit } = useRecipeStore.getState();
  return {
    onPointerDown: () => {
      beginEdit();
      window.addEventListener('pointerup', endEdit, { once: true });
      window.addEventListener('pointercancel', endEdit, { once: true });
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (NAV_KEYS.has(e.key)) beginEdit();
    },
    onKeyUp: (e: KeyboardEvent) => {
      if (NAV_KEYS.has(e.key)) endEdit();
    },
    onBlur: endEdit,
  };
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  onChange,
  trackBackground,
}: SliderProps) {
  const id = useId();
  const decimals = decimalsOf(step);
  const shown = value.toFixed(decimals);
  const [draft, setDraft] = useState<string | null>(null);
  const gesture = useGesture();

  useEffect(() => setDraft(null), [value]);

  const clamp = (v: number): number => Math.min(max, Math.max(min, v));
  const commitDraft = (): void => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed));
    setDraft(null);
  };
  const style = trackBackground ? ({ '--track': trackBackground } as CSSProperties) : undefined;

  return (
    <div className={styles.slider}>
      <label htmlFor={id} className={styles.sliderLabel}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className={trackBackground ? `${styles.range} ${styles.customTrack}` : styles.range}
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        title="Double-click to reset"
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => {
          useRecipeStore.getState().endEdit();
          onChange(defaultValue);
        }}
        {...gesture}
      />
      <input
        type="text"
        inputMode="decimal"
        className={styles.number}
        aria-label={`${label} value`}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitDraft();
          else if (e.key === 'Escape') setDraft(null);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(value + (e.key === 'ArrowUp' ? step : -step)));
          }
        }}
      />
    </div>
  );
}
