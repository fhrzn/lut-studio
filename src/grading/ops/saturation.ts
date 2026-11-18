import { DEG, smoothstep } from '../color';
import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/** Chroma treated as "fully saturated" for vibrance weighting (about the sRGB gamut maximum). */
export const VIBRANCE_CHROMA_REF = 0.3;
/** Skin hues (OKLCH degrees) get this fraction less vibrance at their centre. */
export const SKIN_PROTECTION = 0.3;
const SKIN_COS = Math.cos(50 * DEG);
const SKIN_SIN = Math.sin(50 * DEG);
/** Protection fades to zero this far (cosine of the angle) from the skin hue centre, 35 degrees. */
const SKIN_EDGE_COS = Math.cos(35 * DEG);

/**
 * Saturation scales OKLCH chroma by (1 + saturation/100); -100 is exactly grey at the same
 * lightness. Vibrance scales chroma by 1 + v * w where w = 1 - C/Cref for boosts (low-chroma
 * colours move most) and w = C/Cref for cuts (vivid colours move most), reduced by up to
 * SKIN_PROTECTION around skin hues. Lightness is never touched.
 */
export function prepareSaturation(params: ParamsOf<'saturation'>): PreparedOp | null {
  const { saturation, vibrance } = params;
  if (saturation === 0 && vibrance === 0) return null;
  const satGain = 1 + saturation / 100;
  const v = vibrance / 100;

  const fn = (lab: Vec3): Vec3 => {
    const [L, a, b] = lab;
    const chroma = Math.sqrt(a * a + b * b);
    if (chroma < 1e-9) return lab;
    let gain = satGain;
    if (v !== 0) {
      const level = Math.min(chroma / VIBRANCE_CHROMA_REF, 1);
      const weight = v > 0 ? 1 - level : level;
      // cos of the angle between (a, b) and the skin hue, without an atan2.
      const skin = smoothstep(SKIN_EDGE_COS, 1, (a * SKIN_COS + b * SKIN_SIN) / chroma);
      gain *= 1 + v * weight * (1 - SKIN_PROTECTION * skin);
    }
    const k = Math.max(0, gain);
    return [L, a * k, b * k];
  };
  return { space: 'oklab', fn };
}

export const saturation = (rgb: Vec3, params: ParamsOf<'saturation'>): Vec3 =>
  runOp(prepareSaturation(params), rgb);
