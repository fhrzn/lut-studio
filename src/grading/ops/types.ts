import type { Vec3 } from '@/lut/types';
import type { Layer, LayerType } from '@/recipe/types';
import {
  encodedToOklab,
  linearToOklab,
  linearToSrgb,
  oklabToEncoded,
  oklabToLinear,
  srgbToLinear,
} from '../color';

export type ParamsOf<T extends LayerType> = Extract<Layer, { type: T }>['params'];

/** Colour spaces an op can work in. Values are unclamped and may leave the nominal range. */
export type Space = 'encoded' | 'linear' | 'oklab';

/** A colour function that expects its input, and returns its output, in `space`. */
export interface PreparedOp {
  space: Space;
  fn: (v: Vec3) => Vec3;
}

type Converter = (v: Vec3) => Vec3;

const encodedToLinear: Converter = (v) => [
  srgbToLinear(v[0]),
  srgbToLinear(v[1]),
  srgbToLinear(v[2]),
];
const linearToEncoded: Converter = (v) => [
  linearToSrgb(v[0]),
  linearToSrgb(v[1]),
  linearToSrgb(v[2]),
];

/**
 * Returns the function that moves a colour from one space to another (null when they are equal),
 * so hot loops resolve the conversion once instead of switching per colour.
 * encoded = sRGB-encoded, linear = linear sRGB, oklab = OKLab.
 */
export function spaceConverter(from: Space, to: Space): Converter | null {
  if (from === to) return null;
  switch (from) {
    case 'encoded':
      return to === 'linear' ? encodedToLinear : encodedToOklab;
    case 'linear':
      return to === 'encoded' ? linearToEncoded : linearToOklab;
    case 'oklab':
      return to === 'linear' ? oklabToLinear : oklabToEncoded;
  }
}

export function convertSpace(v: Vec3, from: Space, to: Space): Vec3 {
  const convert = spaceConverter(from, to);
  return convert ? convert(v) : v;
}

/** Runs a prepared op on an sRGB-encoded colour (`null` = neutral layer = no change). */
export function runOp(op: PreparedOp | null, rgb: Vec3): Vec3 {
  if (!op) return rgb;
  return convertSpace(op.fn(convertSpace(rgb, 'encoded', op.space)), op.space, 'encoded');
}
