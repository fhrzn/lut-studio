import { bakeRecipe } from '@/grading/bake';
import type { Renderer } from '@/engine/types';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { onLutsChanged, resolveLut } from './lutCache';
import { compareModeOf, useEditorStore } from './useEditorStore';

export interface PreviewSync {
  /** Re-bakes and redraws on the next frame (e.g. after the image changed). */
  invalidate(): void;
  dispose(): void;
}

/**
 * Keeps the renderer in step with the stores: recipe -> `bakeRecipe` -> `renderer.setLut`.
 * Any number of store changes within a frame cost one bake and one draw.
 */
export function createPreviewSync(renderer: Renderer): PreviewSync {
  let frame = 0;
  let bakedLayers: unknown = null;
  let lutsStale = true;

  const run = (): void => {
    frame = 0;
    const { recipe } = useRecipeStore.getState();
    if (lutsStale || recipe.layers !== bakedLayers) {
      renderer.setLut(bakeRecipe(recipe, resolveLut));
      bakedLayers = recipe.layers;
      lutsStale = false;
    }
    renderer.setSpatial(recipe.spatial);
    renderer.setCompare(compareModeOf(useEditorStore.getState()));
    renderer.render();
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(run);
  };

  const unsubscribe = [
    useRecipeStore.subscribe((state, prev) => {
      if (state.recipe !== prev.recipe) schedule();
    }),
    useEditorStore.subscribe((state, prev) => {
      if (
        state.showBefore !== prev.showBefore ||
        state.split !== prev.split ||
        state.splitX !== prev.splitX
      ) {
        schedule();
      }
    }),
    onLutsChanged(() => {
      lutsStale = true;
      schedule();
    }),
  ];
  schedule();

  return {
    invalidate: schedule,
    dispose: () => {
      unsubscribe.forEach((fn) => fn());
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
