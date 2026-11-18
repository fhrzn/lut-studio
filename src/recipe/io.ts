import { z } from 'zod';
import { sha256Hex } from './hash';
import { migrateRecipe } from './migrate';
import { getLut, listLuts, putLut } from './store';
import type { Layer, Recipe } from './types';

export const RECIPE_FILE_FORMAT = 'lut-studio-recipe';
export const RECIPE_FILE_VERSION = 1;

const RecipeFileSchema = z.object({
  format: z.literal(RECIPE_FILE_FORMAT),
  version: z.literal(RECIPE_FILE_VERSION),
  recipe: z.unknown(),
  luts: z.array(z.strictObject({ id: z.string(), name: z.string(), cubeText: z.string() })),
});

const lutIdsOf = (recipe: Recipe): string[] => [
  ...new Set(
    recipe.layers.flatMap((l) =>
      l.type === 'lut' && l.params.lutId !== '' ? [l.params.lutId] : [],
    ),
  ),
];

/** Serialises a recipe with every referenced LUT embedded so the file is self-contained. */
export async function exportRecipeJson(recipe: Recipe): Promise<string> {
  const luts = await Promise.all(
    lutIdsOf(recipe).map(async (id) => {
      const lut = await getLut(id);
      if (!lut) throw new Error(`Cannot export: LUT ${id} is not in the store`);
      return { id: lut.id, name: lut.name, cubeText: lut.cubeText };
    }),
  );
  return JSON.stringify(
    { format: RECIPE_FILE_FORMAT, version: RECIPE_FILE_VERSION, recipe, luts },
    null,
    2,
  );
}

/**
 * Validates an exported file, stores its LUTs (reusing existing ones with
 * identical content) and returns the recipe with a fresh id and LUT ids
 * remapped to the store. The recipe itself is not saved; call `saveRecipe`.
 */
export async function importRecipeJson(text: string): Promise<Recipe> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Not a valid recipe file: invalid JSON');
  }
  const file = RecipeFileSchema.parse(json);
  const recipe = migrateRecipe(file.recipe);

  const embedded = new Map(file.luts.map((l) => [l.id, l]));
  for (const id of lutIdsOf(recipe)) {
    if (!embedded.has(id)) throw new Error(`Not a valid recipe file: LUT ${id} is not embedded`);
  }

  const existingByHash = new Map<string, string>();
  for (const lut of await listLuts()) existingByHash.set(await sha256Hex(lut.cubeText), lut.id);

  const idMap = new Map<string, string>();
  for (const lut of file.luts) {
    const hash = await sha256Hex(lut.cubeText);
    let storedId = existingByHash.get(hash);
    if (!storedId) {
      storedId = await putLut(lut.name, lut.cubeText);
      existingByHash.set(hash, storedId);
    }
    idMap.set(lut.id, storedId);
  }

  const now = new Date().toISOString();
  const layers = recipe.layers.map((layer): Layer =>
    layer.type === 'lut' && idMap.has(layer.params.lutId)
      ? { ...layer, params: { ...layer.params, lutId: idMap.get(layer.params.lutId) as string } }
      : layer,
  );
  return { ...recipe, id: crypto.randomUUID(), source: 'user', updatedAt: now, layers };
}
