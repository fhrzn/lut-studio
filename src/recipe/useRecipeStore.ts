import { create } from 'zustand';
import type { SpatialParams } from '@/engine/types';
import { createRecipe } from './factory';
import type { Layer, LayerType, Recipe } from './types';

export const HISTORY_LIMIT = 50;

type ParamsOf<T extends LayerType> = Extract<Layer, { type: T }>['params'];

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
  undo: () => void;
  redo: () => void;
}

export const useRecipeStore = create<RecipeState>()((set, get) => {
  /** Applies `edit` to the recipe and records the previous state; returning the same recipe is a no-op. */
  const commit = (edit: (recipe: Recipe) => Recipe): void => {
    const { recipe, past } = get();
    const next = edit(recipe);
    if (next === recipe) return;
    set({ recipe: next, past: [...past, recipe].slice(-HISTORY_LIMIT), future: [] });
  };
  const withLayers = (recipe: Recipe, layers: Layer[]): Recipe => ({ ...recipe, layers });

  return {
    recipe: createRecipe('Untitled'),
    past: [],
    future: [],

    loadRecipe: (recipe) => set({ recipe, past: [], future: [] }),

    updateLayer: (id, patch) =>
      commit((recipe) => {
        if (!recipe.layers.some((l) => l.id === id)) return recipe;
        return withLayers(
          recipe,
          recipe.layers.map((l) => {
            if (l.id !== id) return l;
            const { params, ...rest } = patch;
            return { ...l, ...rest, params: { ...l.params, ...params } } as Layer;
          }),
        );
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
      commit((recipe) => ({ ...recipe, spatial: { ...recipe.spatial, ...patch } })),

    undo: () => {
      const { past, recipe, future } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({ recipe: previous, past: past.slice(0, -1), future: [recipe, ...future] });
    },

    redo: () => {
      const { past, recipe, future } = get();
      const next = future[0];
      if (!next) return;
      set({ recipe: next, past: [...past, recipe], future: future.slice(1) });
    },
  };
});
