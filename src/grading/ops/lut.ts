import { sampleLut3D } from '@/lut';
import type { Lut3D, Vec3 } from '@/lut/types';
import type { PreparedOp } from './types';

/** Looks the colour up in an imported 3D LUT (trilinear, input clamped to the LUT's domain). */
export const prepareLut = (lut: Lut3D): PreparedOp => ({
  space: 'encoded',
  fn: (rgb) => sampleLut3D(lut, rgb),
});

export const lutOp = (rgb: Vec3, lut: Lut3D): Vec3 => sampleLut3D(lut, rgb);
