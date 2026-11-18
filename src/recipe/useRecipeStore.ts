import { create } from 'zustand';
import type { SpatialParams } from '@/engine/types';
import { createRecipe } from './factory';
import type { Layer, LayerType, Recipe } from './types';

export const HISTORY_LIMIT = 50;

export type ParamsOf<T extends LayerType> = Extract<Layer, { type: T }>['params'];

export interface LayerPatch<T extends LayerType = LayerType> {
  enabled?: boolean;
  opacity?: number;
  /** Shallow-merged into the layer's params. */
  params?: Partial<ParamsOf<T>>;
}

interface RecipeState {
  recipe: Recipe;
  past: Recipe[];
  future: Recipe[];
  /** Replaces the current recipe (e.g. after opening one) and clears undo history. */
  loadRecipe: (recipe: Recipe) => void;
  updateLayer: <T extends LayerType = LayerType>(id: string, patch: LayerPatch<T>) => void;
  addLayer: (layer: Layer, index?: number) => void;
  removeLayer: (id: string) => void;
  moveLayer: (id: string, toIndex: number) => void;
  toggleLayer: (id: string) => void;
  setSpatial: (patch: Partial<SpatialParams>) => void;
  renameRecipe: (name: string) => void;
  /**
   * Brackets a continuous edit (e.g. a slider drag): every edit between `beginEdit` and `endEdit`
   * shares one undo step. Calling `beginEdit` while an edit is open does nothing; `endEdit`, undo,
   * redo and `loadRecipe` end the edit.
   */
  beginEdit: () => void;
  endEdit: () => void;
  undo: () => void;
  redo: () => void;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** True if applying the patch would change the layer (compares values, including nested params). */
function patchChanges(
  layer: Layer,
  rest: Omit<LayerPatch, 'params'>,
  nextParams: Record<string, unknown>,
): boolean {
  if (rest.enabled !== undefined && rest.enabled !== layer.enabled) return true;
  if (rest.opacity !== undefined && rest.opacity !== layer.opacity) return true;
  const current = layer.params as Record<string, unknown>;
  return Object.keys(nextParams).some((key) => !deepEqual(nextParams[key], current[key]));
}

export const useRecipeStore = create<RecipeState>()((set, get) => {
  // While an edit is open, only its first change pushes history.
  let editOpen = false;
  let editRecorded = false;

  /** Applies `edit` to the recipe and records the previous state; returning the same recipe is a no-op. */
  const commit = (edit: (recipe: Recipe) => Recipe): void => {
    const { recipe, past } = get();
    const next = edit(recipe);
    if (next === recipe) return;
    if (editOpen && editRecorded) {
      set({ recipe: next });
      return;
    }
    editRecorded = editOpen;
    set({ recipe: next, past: [...past, recipe].slice(-HISTORY_LIMIT), future: [] });
  };
  const endEdit = (): void => {
    editOpen = false;
    editRecorded = false;
  };
  const withLayers = (recipe: Recipe, layers: Layer[]): Recipe => ({ ...recipe, layers });

  return {
    recipe: createRecipe('Untitled'),
    past: [],
    future: [],

    loadRecipe: (recipe) => {
      endEdit();
      set({ recipe, past: [], future: [] });
    },

    beginEdit: () => {
      // Key repeat fires this again mid-edit; only endEdit/undo/redo/loadRecipe close an edit.
      if (editOpen) return;
      editOpen = true;
      editRecorded = false;
    },
    endEdit,

    updateLayer: (id, patch) =>
      commit((recipe) => {
        if (!recipe.layers.some((l) => l.id === id)) return recipe;
        const layers = recipe.layers.map((l) => {
          if (l.id !== id) return l;
          const { params, ...rest } = patch;
          const nextParams = { ...l.params, ...params };
          if (!patchChanges(l, rest, nextParams)) return l;
          return { ...l, ...rest, params: nextParams } as Layer;
        });
        return layers.every((l, i) => l === recipe.layers[i]) ? recipe : withLayers(recipe, layers);
      }),

    addLayer: (layer, index) =>
      commit((recipe) => {
        const at = Math.min(Math.max(index ?? recipe.layers.length, 0), recipe.layers.length);
        const layers = [...recipe.layers];
        layers.splice(at, 0, layer);
        return withLayers(recipe, layers);
      }),

    removeLayer: (id) =>
      commit((recipe) =>
        recipe.layers.some((l) => l.id === id)
          ? withLayers(
              recipe,
              recipe.layers.filter((l) => l.id !== id),
            )
          : recipe,
      ),

    moveLayer: (id, toIndex) =>
      commit((recipe) => {
        const from = recipe.layers.findIndex((l) => l.id === id);
        const to = Math.min(Math.max(toIndex, 0), recipe.layers.length - 1);
        if (from < 0 || from === to) return recipe;
        const layers = [...recipe.layers];
        const [moved] = layers.splice(from, 1);
        layers.splice(to, 0, moved as Layer);
        return withLayers(recipe, layers);
      }),

    toggleLayer: (id) =>
      commit((recipe) =>
        recipe.layers.some((l) => l.id === id)
          ? withLayers(
              recipe,
              recipe.layers.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
            )
          : recipe,
      ),

    setSpatial: (patch) =>
      commit((recipe) => {
        const changed = (Object.keys(patch) as (keyof SpatialParams)[]).some(
          (key) => patch[key] !== undefined && patch[key] !== recipe.spatial[key],
        );
        return changed ? { ...recipe, spatial: { ...recipe.spatial, ...patch } } : recipe;
      }),

    renameRecipe: (name) =>
      commit((recipe) => (name === recipe.name ? recipe : { ...recipe, name })),

    undo: () => {
      endEdit();
      const { past, recipe, future } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({ recipe: previous, past: past.slice(0, -1), future: [recipe, ...future] });
    },

    redo: () => {
      endEdit();
      const { past, recipe, future } = get();
      const next = future[0];
      if (!next) return;
      set({ recipe: next, past: [...past, recipe], future: future.slice(1) });
    },
  };
});
