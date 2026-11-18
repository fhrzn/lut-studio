import { useState } from 'react';
import { HSL_BANDS } from '@/recipe/factory';
import type { HslAdjust, HslBand } from '@/recipe/types';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { Slider } from './Slider';
import styles from './controls.module.css';

const BAND_COLORS: Record<HslBand, string> = {
  red: '#e0393e',
  orange: '#e8832a',
  yellow: '#e3cf2f',
  green: '#4cb050',
  aqua: '#34c3c3',
  blue: '#3a6fe0',
  purple: '#8a4fd6',
  magenta: '#d33fa8',
};

const BAND_HUES: Record<HslBand, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 230,
  purple: 275,
  magenta: 315,
};

interface Props {
  layerId: string;
  params: Record<HslBand, HslAdjust>;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function HslEditor({ layerId, params }: Props) {
  const [band, setBand] = useState<HslBand>('red');
  const value = params[band];
  const set = (patch: Partial<HslAdjust>): void =>
    useRecipeStore
      .getState()
      .updateLayer<'hsl'>(layerId, { params: { [band]: { ...value, ...patch } } });
  const hue = BAND_HUES[band];

  return (
    <div>
      <div role="radiogroup" aria-label="Colour band" className={styles.bands}>
        {HSL_BANDS.map((b) => {
          const touched = params[b].hue !== 0 || params[b].sat !== 0 || params[b].lum !== 0;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={band === b}
              aria-label={cap(b)}
              title={cap(b)}
              className={band === b ? styles.bandActive : styles.band}
              style={{ background: BAND_COLORS[b] }}
              onClick={() => setBand(b)}
            >
              {touched ? <span className={styles.bandDot} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <Slider
        label="Hue"
        value={value.hue}
        min={-100}
        max={100}
        defaultValue={0}
        onChange={(v) => set({ hue: v })}
        trackBackground={`linear-gradient(90deg, hsl(${hue - 40} 80% 50%), hsl(${hue} 80% 50%), hsl(${hue + 40} 80% 50%))`}
      />
      <Slider
        label="Saturation"
        value={value.sat}
        min={-100}
        max={100}
        defaultValue={0}
        onChange={(v) => set({ sat: v })}
        trackBackground={`linear-gradient(90deg, hsl(${hue} 0% 50%), hsl(${hue} 100% 50%))`}
      />
      <Slider
        label="Luminance"
        value={value.lum}
        min={-100}
        max={100}
        defaultValue={0}
        onChange={(v) => set({ lum: v })}
        trackBackground={`linear-gradient(90deg, hsl(${hue} 70% 15%), hsl(${hue} 70% 50%), hsl(${hue} 70% 85%))`}
      />
    </div>
  );
}
