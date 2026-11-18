import type { Lut3D } from '@/lut/types';
import type { Recipe } from '@/recipe/types';

export type LutResolver = (lutId: string) => Lut3D | undefined;

/** Bakes a recipe into a 3D LUT. STUB: returns an identity LUT. */
export function bakeRecipe(_recipe: Recipe, _resolve: LutResolver, size = 33): Lut3D {
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        data[i++] = r / (size - 1);
        data[i++] = g / (size - 1);
        data[i++] = b / (size - 1);
      }
  return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}
