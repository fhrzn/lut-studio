import { hueToRgb, luma, smoothstep } from '../color';
import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/** Offset magnitude at 100% saturation, as a fraction of the hue's distance from its own luma. */
export const SPLIT_TONE_STRENGTH = 0.25;

/**
 * Split toning in encoded space. A hue at full saturation c is turned into a zero-luma offset
 * (c - luma(c)) so tinting never changes luma. Shadows and highlights are blended by encoded luma
 * with a smoothstep spanning [p - 0.5, p + 0.5] where p = 0.5 - balance / 200: balance +100
 * pushes the crossover to black (highlights dominate), -100 to white (shadows dominate).
 */
export function prepareSplitTone(params: ParamsOf<'splitTone'>): PreparedOp | null {
  const { shadowHue, shadowSat, highlightHue, highlightSat, balance } = params;
  if (shadowSat === 0 && highlightSat === 0) return null;
  const offset = (hue: number, sat: number): Vec3 => {
    const c = hueToRgb(hue);
    const y = luma(c);
    const k = (sat / 100) * SPLIT_TONE_STRENGTH;
    return [(c[0] - y) * k, (c[1] - y) * k, (c[2] - y) * k];
  };
  const shadow = offset(shadowHue, shadowSat);
  const highlight = offset(highlightHue, highlightSat);
  const pivot = 0.5 - balance / 200;

  return {
    space: 'encoded',
    fn: (rgb) => {
      const wh = smoothstep(pivot - 0.5, pivot + 0.5, luma(rgb));
      const ws = 1 - wh;
      return [
        rgb[0] + ws * shadow[0] + wh * highlight[0],
        rgb[1] + ws * shadow[1] + wh * highlight[1],
        rgb[2] + ws * shadow[2] + wh * highlight[2],
      ];
    },
  };
}

export const splitTone = (rgb: Vec3, params: ParamsOf<'splitTone'>): Vec3 =>
  runOp(prepareSplitTone(params), rgb);
