import { identityLut3D } from '@/lut';
import type { Lut3D } from '@/lut/types';
import type { Recipe } from '@/recipe/types';

export type LutResolver = (lutId: string) => Lut3D | undefined;

/** Bakes a recipe into a 3D LUT. STUB: returns an identity LUT. */
export function bakeRecipe(_recipe: Recipe, _resolve: LutResolver, size = 33): Lut3D {
  return identityLut3D(size);
}
