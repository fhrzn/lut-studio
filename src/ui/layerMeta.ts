import type { LayerType } from '@/recipe/types';

/** Display names, in the order shown in the "Add layer" menu. */
export const LAYER_LABELS: Record<LayerType, string> = {
  exposure: 'Exposure',
  whiteBalance: 'White balance',
  contrast: 'Contrast',
  curve: 'Tone curve',
  hsl: 'HSL',
  splitTone: 'Split toning',
  saturation: 'Saturation / vibrance',
  fade: 'Fade',
  monochrome: 'Monochrome mixer',
  lut: 'LUT',
};

export const LAYER_TYPES = Object.keys(LAYER_LABELS) as LayerType[];

/** Photo formats the editor accepts. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export function isAcceptedImage(file: File): boolean {
  return file.type !== ''
    ? (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)
    : ACCEPTED_EXTENSIONS.test(file.name);
}
