import { create } from 'zustand';
import type { CompareMode } from '@/engine/types';
import type { LoadedImage } from '@/engine/loadImage';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import type { Recipe } from '@/recipe/types';

export interface Notice {
  kind: 'error' | 'info';
  text: string;
}

/** What "unsaved changes" compares: everything the user can edit, not timestamps. */
export function recipeSnapshot(recipe: Recipe): string {
  return JSON.stringify([recipe.name, recipe.description, recipe.layers, recipe.spatial]);
}

interface EditorState {
  image: LoadedImage | null;
  imageName: string | null;
  selectedLayerId: string | null;
  /** Show the untouched photo; toggled by the `\` key. */
  showBefore: boolean;
  split: boolean;
  /** Divider position, 0..1 of the image width. */
  splitX: number;
  /** Snapshot of the last saved/opened recipe; the recipe is dirty when it differs. */
  savedSnapshot: string;
  /** True once the current recipe exists in IndexedDB. */
  persisted: boolean;
  notice: Notice | null;
  saveDialogOpen: boolean;
  setImage: (image: LoadedImage, name: string) => void;
  selectLayer: (id: string | null) => void;
  toggleBefore: () => void;
  setSplit: (split: boolean) => void;
  setSplitX: (x: number) => void;
  markSaved: (recipe: Recipe, persisted: boolean) => void;
  setNotice: (notice: Notice | null) => void;
  setSaveDialogOpen: (open: boolean) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  image: null,
  imageName: null,
  selectedLayerId: null,
  showBefore: false,
  split: false,
  splitX: 0.5,
  savedSnapshot: recipeSnapshot(useRecipeStore.getState().recipe),
  persisted: false,
  notice: null,
  saveDialogOpen: false,
  setImage: (image, imageName) => set({ image, imageName }),
  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
  toggleBefore: () => set((s) => ({ showBefore: !s.showBefore })),
  setSplit: (split) => set({ split, showBefore: false }),
  setSplitX: (x) => set({ splitX: Math.min(1, Math.max(0, x)) }),
  markSaved: (recipe, persisted) => set({ savedSnapshot: recipeSnapshot(recipe), persisted }),
  setNotice: (notice) => set({ notice }),
  setSaveDialogOpen: (saveDialogOpen) => set({ saveDialogOpen }),
}));

export function compareModeOf(
  state: Pick<EditorState, 'showBefore' | 'split' | 'splitX'>,
): CompareMode {
  if (state.showBefore) return { kind: 'before' };
  return state.split ? { kind: 'split', x: state.splitX } : { kind: 'after' };
}

/** True when the open recipe differs from what was last saved or opened. */
export function useIsDirty(): boolean {
  const current = useRecipeStore((s) => recipeSnapshot(s.recipe));
  const saved = useEditorStore((s) => s.savedSnapshot);
  return current !== saved;
}
