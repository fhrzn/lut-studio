import { beforeEach, describe, expect, it } from 'vitest';
import { createLayer, createRecipe } from '@/recipe/factory';
import { HISTORY_LIMIT, useRecipeStore } from '@/recipe/useRecipeStore';

const s = () => useRecipeStore.getState();
const ids = () => s().recipe.layers.map((l) => l.id);

beforeEach(() => s().loadRecipe(createRecipe('t')));

describe('useRecipeStore', () => {
  it('addLayer appends or inserts at an index (clamped)', () => {
    const a = createLayer('exposure');
    const b = createLayer('contrast');
    const c = createLayer('fade');
    s().addLayer(a);
    s().addLayer(b, 0);
    s().addLayer(c, 99);
    expect(ids()).toEqual([b.id, a.id, c.id]);
  });

  it('updateLayer merges params and layer fields', () => {
    const a = createLayer('whiteBalance');
    s().addLayer(a);
    s().updateLayer(a.id, { opacity: 0.5, params: { tint: 20 } });
    expect(s().recipe.layers[0]).toMatchObject({
      opacity: 0.5,
      params: { temperature: 0, tint: 20 },
    });
  });

  it('toggleLayer, removeLayer, moveLayer, setSpatial', () => {
    const [a, b, c] = [
      createLayer('exposure'),
      createLayer('contrast'),
      createLayer('fade'),
    ] as const;
    [a, b, c].forEach((l) => s().addLayer(l));
    s().toggleLayer(b.id);
    expect(s().recipe.layers[1]?.enabled).toBe(false);
    s().moveLayer(a.id, 2);
    expect(ids()).toEqual([b.id, c.id, a.id]);
    s().moveLayer(a.id, -5);
    expect(ids()).toEqual([a.id, b.id, c.id]);
    s().removeLayer(b.id);
    expect(ids()).toEqual([a.id, c.id]);
    s().setSpatial({ grainAmount: 30 });
    expect(s().recipe.spatial).toMatchObject({ grainAmount: 30, vignetteAmount: 0 });
  });

  it('undo/redo covers add, remove, move and update', () => {
    const a = createLayer('exposure');
    const b = createLayer('contrast');
    const empty = s().recipe;
    s().addLayer(a);
    const afterAdd = s().recipe;
    s().addLayer(b);
    const afterAdd2 = s().recipe;
    s().moveLayer(b.id, 0);
    const afterMove = s().recipe;
    s().updateLayer(a.id, { params: { ev: 2 } });
    const afterUpdate = s().recipe;
    s().removeLayer(a.id);
    const afterRemove = s().recipe;

    for (const expected of [afterUpdate, afterMove, afterAdd2, afterAdd, empty]) {
      s().undo();
      expect(s().recipe).toBe(expected);
    }
    s().undo();
    expect(s().recipe).toBe(empty);
    for (const expected of [afterAdd, afterAdd2, afterMove, afterUpdate, afterRemove]) {
      s().redo();
      expect(s().recipe).toBe(expected);
    }
    s().redo();
    expect(s().recipe).toBe(afterRemove);
  });

  it('a new edit clears the redo stack', () => {
    s().addLayer(createLayer('exposure'));
    s().undo();
    expect(s().future).toHaveLength(1);
    s().addLayer(createLayer('fade'));
    expect(s().future).toHaveLength(0);
  });

  it('no-op edits do not create history', () => {
    const a = createLayer('exposure');
    s().addLayer(a);
    const before = s().past.length;
    s().removeLayer('missing');
    s().toggleLayer('missing');
    s().updateLayer('missing', { opacity: 0 });
    s().moveLayer(a.id, 0);
    s().moveLayer('missing', 0);
    expect(s().past).toHaveLength(before);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s().addLayer(createLayer('exposure'));
    expect(s().past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s().undo();
    expect(s().recipe.layers).toHaveLength(10);
  });

  it('loadRecipe replaces the recipe and clears history', () => {
    s().addLayer(createLayer('exposure'));
    const next = createRecipe('other');
    s().loadRecipe(next);
    expect(s().recipe).toBe(next);
    expect(s().past).toEqual([]);
    expect(s().future).toEqual([]);
  });
});
