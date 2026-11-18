import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/** Encoded value black is lifted to at fade = 100. */
export const FADE_MAX_LIFT = 0.2;

/** Fade in encoded space: out = lift + in * (1 - lift), lift = amount / 100 * FADE_MAX_LIFT. White is fixed. */
export function prepareFade(params: ParamsOf<'fade'>): PreparedOp | null {
  if (params.amount === 0) return null;
  const lift = (params.amount / 100) * FADE_MAX_LIFT;
  const scale = 1 - lift;
  return {
    space: 'encoded',
    fn: (v) => [lift + v[0] * scale, lift + v[1] * scale, lift + v[2] * scale],
  };
}

export const fade = (rgb: Vec3, params: ParamsOf<'fade'>): Vec3 => runOp(prepareFade(params), rgb);
