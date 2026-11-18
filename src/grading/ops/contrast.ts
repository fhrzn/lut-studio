import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/**
 * Contrast in encoded space: blend between identity and the smoothstep S-curve 3x^2 - 2x^3,
 * f(x) = x + k (s(x) - x) with k = amount / 100. Black, white and mid grey are fixed points and
 * the curve is monotone for |k| <= 1. Outside [0,1] it continues linearly with the end slope
 * (1 - k) so unclamped intermediates stay continuous.
 */
export function contrastCurve(x: number, k: number): number {
  if (x < 0) return x * (1 - k);
  if (x > 1) return 1 + (x - 1) * (1 - k);
  return x + k * (x * x * (3 - 2 * x) - x);
}

export function prepareContrast(params: ParamsOf<'contrast'>): PreparedOp | null {
  if (params.amount === 0) return null;
  const k = params.amount / 100;
  return {
    space: 'encoded',
    fn: (v) => [contrastCurve(v[0], k), contrastCurve(v[1], k), contrastCurve(v[2], k)],
  };
}

export const contrast = (rgb: Vec3, params: ParamsOf<'contrast'>): Vec3 =>
  runOp(prepareContrast(params), rgb);
