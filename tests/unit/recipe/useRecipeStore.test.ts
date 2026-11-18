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
  describe('continuous edits', () => {
    it('one beginEdit..endEdit drag is one undo step', () => {
      const a = createLayer('exposure');
      s().addLayer(a);
      const before = s().recipe;
      s().beginEdit();
      for (const ev of [0.5, 1, 1.5, 2]) s().updateLayer(a.id, { params: { ev } });
      s().endEdit();
      expect(s().past).toHaveLength(2);
      expect(s().recipe.layers[0]).toMatchObject({ params: { ev: 2 } });
      s().undo();
      expect(s().recipe).toBe(before);
    });

    it('repeated beginEdit calls (key repeat) stay one undo step', () => {
      const a = createLayer('exposure');
      s().addLayer(a);
      const before = s().recipe;
      const steps = s().past.length;
      for (const ev of [0.1, 0.2, 0.3, 0.4]) {
        s().beginEdit(); // a held arrow key calls this on every repeat
        s().updateLayer(a.id, { params: { ev } });
      }
      s().endEdit();
      expect(s().past).toHaveLength(steps + 1);
      expect(s().recipe.layers[0]).toMatchObject({ params: { ev: 0.4 } });
      s().undo();
      expect(s().recipe).toBe(before);
      expect(s().recipe.layers[0]).toMatchObject({ params: { ev: 0 } });
    });

    it('edits after endEdit start a new step; an empty drag adds none', () => {
      const a = createLayer('exposure');
      s().addLayer(a);
      s().beginEdit();
      s().endEdit();
      expect(s().past).toHaveLength(1);
      s().beginEdit();
      s().updateLayer(a.id, { params: { ev: 1 } });
      s().endEdit();
      s().updateLayer(a.id, { params: { ev: 2 } });
      expect(s().past).toHaveLength(3);
    });

    it('the first edit of a drag clears redo; later ones keep it clear', () => {
      const a = createLayer('exposure');
      s().addLayer(a);
      s().undo();
      expect(s().future).toHaveLength(1);
      s().addLayer(a);
      s().beginEdit();
      s().updateLayer(a.id, { params: { ev: 1 } });
      expect(s().future).toHaveLength(0);
      s().endEdit();
    });

    it('undo and loadRecipe end an open edit', () => {
      const a = createLayer('exposure');
      s().addLayer(a);
      s().beginEdit();
      s().updateLayer(a.id, { params: { ev: 1 } });
      s().undo();
      s().redo();
      s().updateLayer(a.id, { params: { ev: 2 } });
      expect(s().past).toHaveLength(3);
      s().beginEdit();
      s().loadRecipe(createRecipe('x'));
      s().addLayer(createLayer('fade'));
      s().addLayer(createLayer('fade'));
      expect(s().past).toHaveLength(2);
    });
  });

  describe('no-op edits', () => {
    it('updateLayer with an empty or unchanged patch adds no step', () => {
      const a = createLayer('curve');
      s().addLayer(a);
      const steps = s().past.length;
      const recipe = s().recipe;
      s().updateLayer(a.id, {});
      s().updateLayer(a.id, { params: {} });
      s().updateLayer(a.id, { opacity: 1, enabled: true });
      s().updateLayer(a.id, {
        params: {
          master: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      });
      expect(s().past).toHaveLength(steps);
      expect(s().recipe).toBe(recipe);
    });

    it('setSpatial with an empty or unchanged patch adds no step', () => {
      s().setSpatial({ grainAmount: 10 });
      const steps = s().past.length;
      s().setSpatial({});
      s().setSpatial({ grainAmount: 10 });
      s().setSpatial({ grainAmount: undefined });
      expect(s().past).toHaveLength(steps);
    });

    it('a changing patch still records a step', () => {
      const a = createLayer('exposure');
      s().addLayer(a);
      const steps = s().past.length;
      s().updateLayer(a.id, { params: { ev: 1 } });
      expect(s().past).toHaveLength(steps + 1);
    });
  });

  it('renameRecipe is undoable and ignores unchanged names', () => {
    s().renameRecipe('t');
    expect(s().past).toHaveLength(0);
    s().renameRecipe('Warm');
    expect(s().recipe.name).toBe('Warm');
    s().undo();
    expect(s().recipe.name).toBe('t');
  });
});
