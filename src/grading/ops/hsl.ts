import type { HslBand } from '@/recipe/types';
import { HSL_BANDS } from '@/recipe/factory';
import { DEG, oklabHue, smoothstep } from '../color';
import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/** OKLCH hue (degrees) at the centre of each band, ascending; sRGB primaries sit at 29/110/142/195/264/328. */
export const HSL_BAND_CENTERS: Record<HslBand, number> = {
  red: 29,
  orange: 55,
  yellow: 110,
  green: 142,
  aqua: 195,
  blue: 264,
  purple: 300,
  magenta: 330,
};

/** Slider +-100 maps to this many degrees of hue rotation and this much OKLab lightness. */
export const HSL_HUE_RANGE = 30;
export const HSL_LUM_RANGE = 0.2;
/** Chroma below which lightness shifts fade out (greys have no meaningful hue). */
const LUM_CHROMA_GATE = 0.04;

/**
 * Interpolated [hue, sat, lum] slider values at a hue. Adjacent band centres are blended with a
 * smoothstep, so the weights are a continuous partition of unity: no hard edges, and an
 * all-equal setting is a uniform change.
 */
function bandAdjust(table: readonly Vec3[], centers: readonly number[], hue: number): Vec3 {
  const n = centers.length;
  let i = n - 1; // hues before the first centre belong to the last->first wrap segment
  for (let k = 0; k < n; k++) {
    if (hue >= (centers[k] as number)) i = k;
  }
  const j = (i + 1) % n;
  const ci = centers[i] as number;
  const cj = centers[j] as number;
  let span = cj - ci;
  if (span <= 0) span += 360;
  let dh = hue - ci;
  if (dh < 0) dh += 360;
  const t = smoothstep(0, 1, dh / span);
  const a = table[i] as Vec3;
  const b = table[j] as Vec3;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Hue bins of the per-hue lookup table (0.5 degrees each). */
const HUE_BINS = 720;
const FIELDS = 4; // chroma gain, lightness shift, cos(hue shift), sin(hue shift)

/**
 * Hue / saturation / luminance per colour band in OKLCH: rotate hue, scale chroma by
 * (1 + sat/100), add to OKLab lightness (faded out for near-greys). The band blend only depends
 * on hue, so it is tabulated once per recipe (720 bins, linear interpolation) instead of per pixel.
 */
export function prepareHsl(params: ParamsOf<'hsl'>): PreparedOp | null {
  const sliders: Vec3[] = HSL_BANDS.map((band) => {
    const p = params[band];
    return [p.hue, p.sat, p.lum];
  });
  if (sliders.every((row) => row[0] === 0 && row[1] === 0 && row[2] === 0)) return null;
  const centers = HSL_BANDS.map((band) => HSL_BAND_CENTERS[band]);

  const lookup = new Float64Array((HUE_BINS + 1) * FIELDS);
  for (let k = 0; k <= HUE_BINS; k++) {
    const [dHue, dSat, dLum] = bandAdjust(sliders, centers, ((k % HUE_BINS) * 360) / HUE_BINS);
    const shift = (dHue / 100) * HSL_HUE_RANGE * DEG;
    lookup[k * FIELDS] = Math.max(0, 1 + dSat / 100);
    lookup[k * FIELDS + 1] = (dLum / 100) * HSL_LUM_RANGE;
    lookup[k * FIELDS + 2] = Math.cos(shift);
    lookup[k * FIELDS + 3] = Math.sin(shift);
  }

  const fn = (lab: Vec3): Vec3 => {
    const [L, a, b] = lab;
    const chroma = Math.sqrt(a * a + b * b);
    if (chroma < 1e-9) return lab;
    const pos = (oklabHue(a, b) * HUE_BINS) / 360;
    const k = pos < HUE_BINS ? pos | 0 : HUE_BINS - 1;
    const t = pos - k;
    const o = k * FIELDS;
    const at = (field: number): number => {
      const lo = lookup[o + field] as number;
      return lo + ((lookup[o + field + FIELDS] as number) - lo) * t;
    };
    const gain = at(0);
    const dLum = at(1);
    const cos = at(2);
    const sin = at(3);
    return [
      L + dLum * smoothstep(0, LUM_CHROMA_GATE, chroma),
      gain * (a * cos - b * sin),
      gain * (a * sin + b * cos),
    ];
  };
  return { space: 'oklab', fn };
}

export const hsl = (rgb: Vec3, params: ParamsOf<'hsl'>): Vec3 => runOp(prepareHsl(params), rgb);
