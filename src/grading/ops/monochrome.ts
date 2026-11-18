import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/**
 * Channel-mixer black and white in encoded space (like a photographic B&W mix): the weights are
 * percentages, are not normalised, and r = g = b = (wr r + wg g + wb b) / 100.
 */
export function prepareMonochrome(params: ParamsOf<'monochrome'>): PreparedOp {
  const wr = params.red / 100;
  const wg = params.green / 100;
  const wb = params.blue / 100;
  return {
    space: 'encoded',
    fn: (rgb) => {
      const y = wr * rgb[0] + wg * rgb[1] + wb * rgb[2];
      return [y, y, y];
    },
  };
}

export const monochrome = (rgb: Vec3, params: ParamsOf<'monochrome'>): Vec3 =>
  runOp(prepareMonochrome(params), rgb);
