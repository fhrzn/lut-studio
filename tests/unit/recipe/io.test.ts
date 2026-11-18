import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLayer, createRecipe } from '@/recipe/factory';
import { exportRecipeJson, importRecipeJson } from '@/recipe/io';
import { closeDb, getLut, getRecipe, listLuts, putLut, saveRecipe } from '@/recipe/store';
import type { Layer, Recipe } from '@/recipe/types';

const CUBE = 'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';

beforeEach(async () => {
  await closeDb();
  indexedDB = new IDBFactory();
});

async function recipeWithLut(): Promise<Recipe> {
  const lutId = await putLut('Film', CUBE);
  const layer: Layer = {
    ...createLayer('lut'),
    opacity: 0.6,
    params: { lutId, name: 'Film' },
  } as Layer;
  return { ...createRecipe('Graded'), layers: [createLayer('exposure'), layer] };
}

describe('export / import', () => {
  it('exports a self-contained file', async () => {
    const recipe = await recipeWithLut();
    const file = JSON.parse(await exportRecipeJson(recipe));
    expect(file).toMatchObject({ format: 'lut-studio-recipe', version: 1, recipe });
    expect(file.luts).toEqual([
      {
        id: (recipe.layers[1] as Extract<Layer, { type: 'lut' }>).params.lutId,
        name: 'Film',
        cubeText: CUBE,
      },
    ]);
  });

  it('embeds each referenced LUT once and none when unused', async () => {
    const recipe = await recipeWithLut();
    const twice = { ...recipe, layers: [...recipe.layers, ...recipe.layers.slice(1)] };
    expect(JSON.parse(await exportRecipeJson(twice)).luts).toHaveLength(1);
    expect(JSON.parse(await exportRecipeJson(createRecipe('plain'))).luts).toEqual([]);
  });

  it('refuses to export when a referenced LUT is missing', async () => {
    const recipe = await recipeWithLut();
    await closeDb();
    indexedDB = new IDBFactory();
    await expect(exportRecipeJson(recipe)).rejects.toThrow(/not in the store/);
  });

  it('round trips into an empty DB', async () => {
    const recipe = await recipeWithLut();
    const text = await exportRecipeJson(recipe);
    await closeDb();
    indexedDB = new IDBFactory();

    const imported = await importRecipeJson(text);
    expect(imported.id).not.toBe(recipe.id);
    expect(imported).toMatchObject({ name: 'Graded', source: 'user', spatial: recipe.spatial });
    const layer = imported.layers[1] as Extract<Layer, { type: 'lut' }>;
    expect(layer.opacity).toBe(0.6);
    expect((await getLut(layer.params.lutId))?.cubeText).toBe(CUBE);

    await saveRecipe(imported);
    expect(await getRecipe(imported.id)).toBeDefined();
  });

  it('importing the same file twice does not duplicate LUT data', async () => {
    const recipe = await recipeWithLut();
    const text = await exportRecipeJson(recipe);
    await closeDb();
    indexedDB = new IDBFactory();

    const first = await importRecipeJson(text);
    const second = await importRecipeJson(text);
    expect(await listLuts()).toHaveLength(1);
    expect(first.id).not.toBe(second.id);
    const lutId = (r: Recipe) => (r.layers[1] as Extract<Layer, { type: 'lut' }>).params.lutId;
    expect(lutId(first)).toBe(lutId(second));
  });

  it('reuses an existing LUT with identical content and remaps the id', async () => {
    const recipe = await recipeWithLut();
    const text = await exportRecipeJson(recipe);
    const imported = await importRecipeJson(text);
    expect(await listLuts()).toHaveLength(1);
    expect((imported.layers[1] as Extract<Layer, { type: 'lut' }>).params.lutId).toBe(
      (recipe.layers[1] as Extract<Layer, { type: 'lut' }>).params.lutId,
    );
  });

  it('rejects bad files without storing anything', async () => {
    const recipe = await recipeWithLut();
    const good = JSON.parse(await exportRecipeJson(recipe));
    const cases: [string, unknown][] = [
      ['wrong format', { ...good, format: 'other' }],
      ['wrong version', { ...good, version: 2 }],
      ['missing lut', { ...good, luts: [] }],
      ['invalid recipe', { ...good, recipe: { ...good.recipe, name: '' } }],
      ['not an object', 42],
    ];
    await closeDb();
    indexedDB = new IDBFactory();
    for (const [, input] of cases)
      await expect(importRecipeJson(JSON.stringify(input))).rejects.toThrow();
    await expect(importRecipeJson('{nope')).rejects.toThrow(/invalid JSON/);
    expect(await listLuts()).toEqual([]);
  });

  it('rejects an embedded LUT that is not a .cube', async () => {
    const recipe = await recipeWithLut();
    const good = JSON.parse(await exportRecipeJson(recipe));
    good.luts[0].cubeText = 'garbage';
    await expect(importRecipeJson(JSON.stringify(good))).rejects.toThrow(/LUT_3D_SIZE/);
  });
});
