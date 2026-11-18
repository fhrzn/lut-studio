import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLayer, createRecipe } from '@/recipe/factory';
import {
  closeDb,
  deleteLut,
  deleteRecipe,
  duplicateRecipe,
  getLut,
  getRecipe,
  listRecipes,
  putLut,
  saveRecipe,
} from '@/recipe/store';
import type { Layer, Recipe } from '@/recipe/types';

const CUBE =
  'TITLE "t"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';

beforeEach(async () => {
  await closeDb();
  indexedDB = new IDBFactory();
});

function lutLayer(lutId: string): Layer {
  const l = createLayer('lut');
  return l.type === 'lut' ? { ...l, opacity: 1, params: { lutId, name: 'n' } } : l;
}

describe('recipes', () => {
  it('save → reload DB → get returns an identical recipe', async () => {
    const recipe: Recipe = {
      ...createRecipe('Warm'),
      layers: [createLayer('exposure'), createLayer('curve')],
    };
    const saved = await saveRecipe(recipe);
    await closeDb();
    expect(await getRecipe(recipe.id)).toEqual(saved);
  });

  it('saveRecipe bumps updatedAt only', async () => {
    const recipe = createRecipe('x');
    const old = { ...recipe, updatedAt: '2020-01-01T00:00:00.000Z' };
    const saved = await saveRecipe(old);
    expect(saved.updatedAt > old.updatedAt).toBe(true);
    expect({ ...saved, updatedAt: '' }).toEqual({ ...old, updatedAt: '' });
  });

  it('saveRecipe rejects invalid recipes and stores nothing', async () => {
    const bad = {
      ...createRecipe('x'),
      layers: [{ ...createLayer('fade'), params: { amount: 500 } }],
    } as Recipe;
    await expect(saveRecipe(bad)).rejects.toThrow();
    expect(await listRecipes()).toEqual([]);
  });

  it('lists most recently updated first and deletes', async () => {
    const a = await saveRecipe(createRecipe('a'));
    await new Promise((r) => setTimeout(r, 5));
    const b = await saveRecipe(createRecipe('b'));
    expect((await listRecipes()).map((r) => r.id)).toEqual([b.id, a.id]);
    await deleteRecipe(b.id);
    expect((await listRecipes()).map((r) => r.id)).toEqual([a.id]);
    expect(await getRecipe(b.id)).toBeUndefined();
  });

  it('duplicates with new ids, copied name, user source', async () => {
    const original = await saveRecipe({
      ...createRecipe('Base'),
      source: 'builtin',
      layers: [createLayer('fade')],
    });
    const copy = await duplicateRecipe(original.id);
    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe(original.id);
    expect(copy?.name).toBe('Base copy');
    expect(copy?.source).toBe('user');
    expect(copy?.layers[0]?.id).not.toBe(original.layers[0]?.id);
    expect(copy?.layers[0]).toMatchObject({ type: 'fade', params: { amount: 0 } });
    expect(await getRecipe(copy?.id ?? '')).toEqual(copy);
    expect(await duplicateRecipe('missing')).toBeUndefined();
  });
});

describe('luts', () => {
  it('stores and reads a LUT with parsed size', async () => {
    const id = await putLut('Warm', CUBE);
    expect(await getLut(id)).toMatchObject({ id, name: 'Warm', cubeText: CUBE, size: 2 });
  });

  it('reads 1D size and rejects text without a size header', async () => {
    const id = await putLut('1d', 'LUT_1D_SIZE 16\n');
    expect((await getLut(id))?.size).toBe(16);
    await expect(putLut('bad', '# LUT_3D_SIZE 2\n0 0 0\n')).rejects.toThrow(/LUT_3D_SIZE/);
  });

  it('deleteLut removes an unreferenced LUT', async () => {
    const id = await putLut('x', CUBE);
    expect(await deleteLut(id)).toEqual({ deleted: true });
    expect(await getLut(id)).toBeUndefined();
  });

  it('deleteLut refuses when referenced and names the recipes', async () => {
    const id = await putLut('x', CUBE);
    await saveRecipe({ ...createRecipe('Uses LUT'), layers: [lutLayer(id)] });
    await saveRecipe({ ...createRecipe('Also'), layers: [lutLayer(id)] });
    await saveRecipe(createRecipe('Unrelated'));
    const result = await deleteLut(id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) expect([...result.referencedBy].sort()).toEqual(['Also', 'Uses LUT']);
    expect(await getLut(id)).toBeDefined();
  });

  it('deleteLut succeeds once the referencing recipe is gone', async () => {
    const id = await putLut('x', CUBE);
    const r = await saveRecipe({ ...createRecipe('Uses LUT'), layers: [lutLayer(id)] });
    await deleteRecipe(r.id);
    expect(await deleteLut(id)).toEqual({ deleted: true });
  });
});
