import type { SpatialParams } from '@/engine/types';
import type { CurvePoint, HslAdjust, HslBand, Layer, LayerType, Recipe } from './types';

export const DEFAULT_SPATIAL: Readonly<SpatialParams> = Object.freeze({
  grainAmount: 0,
  grainSize: 50,
  vignetteAmount: 0,
  vignetteMidpoint: 50,
});

export const HSL_BANDS: readonly HslBand[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
];

const identityCurve = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

const zeroHsl = (): HslAdjust => ({ hue: 0, sat: 0, lum: 0 });

/**
 * Creates a layer with neutral defaults: applying it changes nothing.
 * `monochrome` and `lut` have no neutral parameters (they replace colour), so
 * they default to opacity 0 instead.
 */
export function createLayer(type: LayerType): Layer {
  const base = { id: crypto.randomUUID(), enabled: true, opacity: 1 };
  switch (type) {
    case 'exposure':
      return { ...base, type, params: { ev: 0 } };
    case 'whiteBalance':
      return { ...base, type, params: { temperature: 0, tint: 0 } };
    case 'contrast':
      return { ...base, type, params: { amount: 0 } };
    case 'curve':
      return {
        ...base,
        type,
        params: {
          master: identityCurve(),
          r: identityCurve(),
          g: identityCurve(),
          b: identityCurve(),
        },
      };
    case 'hsl':
      return {
        ...base,
        type,
        params: {
          red: zeroHsl(),
          orange: zeroHsl(),
          yellow: zeroHsl(),
          green: zeroHsl(),
          aqua: zeroHsl(),
          blue: zeroHsl(),
          purple: zeroHsl(),
          magenta: zeroHsl(),
        },
      };
    case 'splitTone':
      return {
        ...base,
        type,
        params: { shadowHue: 0, shadowSat: 0, highlightHue: 0, highlightSat: 0, balance: 0 },
      };
    case 'saturation':
      return { ...base, type, params: { saturation: 0, vibrance: 0 } };
    case 'fade':
      return { ...base, type, params: { amount: 0 } };
    case 'monochrome':
      return { ...base, opacity: 0, type, params: { red: 30, green: 59, blue: 11 } };
    case 'lut':
      return { ...base, opacity: 0, type, params: { lutId: '', name: '' } };
  }
}

export function createRecipe(name: string): Recipe {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    source: 'user',
    createdAt: now,
    updatedAt: now,
    layers: [],
    spatial: { ...DEFAULT_SPATIAL },
  };
}
