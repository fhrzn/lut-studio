import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/** Exposure in linear light: multiply by 2^ev. Returns null when neutral. */
export function prepareExposure(params: ParamsOf<'exposure'>): PreparedOp | null {
  if (params.ev === 0) return null;
  const gain = Math.pow(2, params.ev);
  return { space: 'linear', fn: (v) => [v[0] * gain, v[1] * gain, v[2] * gain] };
}

export const exposure = (rgb: Vec3, params: ParamsOf<'exposure'>): Vec3 =>
  runOp(prepareExposure(params), rgb);
