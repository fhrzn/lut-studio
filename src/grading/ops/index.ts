import type { Lut3D } from '@/lut/types';
import type { Layer } from '@/recipe/types';
import { prepareContrast } from './contrast';
import { prepareCurve } from './curve';
import { prepareExposure } from './exposure';
import { prepareFade } from './fade';
import { prepareHsl } from './hsl';
import { prepareLut } from './lut';
import { prepareMonochrome } from './monochrome';
import { prepareSaturation } from './saturation';
import { prepareSplitTone } from './splitTone';
import type { PreparedOp } from './types';
import { prepareWhiteBalance } from './whiteBalance';

export { contrast } from './contrast';
export { curve, createMonotoneCurve } from './curve';
export { exposure } from './exposure';
export { fade, FADE_MAX_LIFT } from './fade';
export { hsl, HSL_BAND_CENTERS } from './hsl';
export { lutOp } from './lut';
export { monochrome } from './monochrome';
export { saturation } from './saturation';
export { splitTone } from './splitTone';
export { whiteBalance, whiteBalanceMatrix, whiteBalanceSourceXY } from './whiteBalance';
export { convertSpace, runOp, spaceConverter } from './types';
export type { ParamsOf, PreparedOp, Space } from './types';

/**
 * Builds the colour function for a layer, precomputing anything that does not depend on the
 * pixel. `lut` is the resolved LUT for `lut` layers (ignored by other types).
 */
export function prepareLayerOp(layer: Layer, lut?: Lut3D): PreparedOp | null {
  switch (layer.type) {
    case 'exposure':
      return prepareExposure(layer.params);
    case 'whiteBalance':
      return prepareWhiteBalance(layer.params);
    case 'contrast':
      return prepareContrast(layer.params);
    case 'curve':
      return prepareCurve(layer.params);
    case 'hsl':
      return prepareHsl(layer.params);
    case 'splitTone':
      return prepareSplitTone(layer.params);
    case 'saturation':
      return prepareSaturation(layer.params);
    case 'fade':
      return prepareFade(layer.params);
    case 'monochrome':
      return prepareMonochrome(layer.params);
    case 'lut':
      return lut ? prepareLut(lut) : null;
  }
}
