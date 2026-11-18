import { CubeParseError } from '@/lut';
import { loadImage } from '@/engine/loadImage';
import { createLayer, createRecipe } from '@/recipe/factory';
import { getRecipe, putLut, saveRecipe } from '@/recipe/store';
import type { Layer, LayerType } from '@/recipe/types';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { isAcceptedImage } from './layerMeta';
import { cacheLut, ensureRecipeLuts, lutFromCube } from './lutCache';
import { useEditorStore } from './useEditorStore';

const LAST_RECIPE_KEY = 'lut-studio:lastRecipeId';
/** A 65^3 `.cube` is about 25 MB of text; anything much larger is not a LUT. */
const MAX_CUBE_BYTES = 64 * 1024 * 1024;

const editor = () => useEditorStore.getState();
const recipes = () => useRecipeStore.getState();
const fail = (text: string): void => editor().setNotice({ kind: 'error', text });
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Decodes a photo and shows it. Unsupported types and undecodable files surface as an error notice. */
export async function openImageFile(file: File): Promise<void> {
  if (!isAcceptedImage(file)) {
    fail(`"${file.name}" is not a supported image. Use JPEG, PNG or WebP.`);
    return;
  }
  try {
    const loaded = await loadImage(file);
    const previous = editor().image;
    editor().setImage(loaded, file.name);
    editor().setNotice(null);
    // The viewport has swapped textures by the next frame; closing sooner would race the renderer.
    if (previous) {
      requestAnimationFrame(() => {
        previous.bitmap.close();
        previous.preview.close();
      });
    }
  } catch (e) {
    fail(messageOf(e));
  }
}

/** Adds a new layer after the selected one (or at the end) and selects it. */
export function addLayerOfType(type: LayerType): void {
  const layer: Layer = createLayer(type);
  // Monochrome ships at opacity 0 so the factory default is neutral; a user adding it wants to see it.
  const visible = type === 'monochrome' ? { ...layer, opacity: 1 } : layer;
  const { recipe } = recipes();
  const selected = recipe.layers.findIndex((l) => l.id === editor().selectedLayerId);
  recipes().addLayer(visible, selected < 0 ? undefined : selected + 1);
  editor().selectLayer(visible.id);
}

export function duplicateLayer(id: string): void {
  const { layers } = recipes().recipe;
  const index = layers.findIndex((l) => l.id === id);
  const original = layers[index];
  if (!original) return;
  const copy = { ...structuredClone(original), id: crypto.randomUUID() } as Layer;
  recipes().addLayer(copy, index + 1);
  editor().selectLayer(copy.id);
}

export function deleteLayer(id: string): void {
  const { layers } = recipes().recipe;
  const index = layers.findIndex((l) => l.id === id);
  recipes().removeLayer(id);
  if (editor().selectedLayerId === id) {
    editor().selectLayer(layers[index + 1]?.id ?? layers[index - 1]?.id ?? null);
  }
}

/** Reads a `.cube` file into the given LUT layer. A malformed file leaves the layer untouched. */
export async function importCubeIntoLayer(layerId: string, file: File): Promise<void> {
  try {
    if (file.size > MAX_CUBE_BYTES) throw new Error('file is too large to be a LUT');
    const text = await file.text();
    const lut = lutFromCube(text);
    const name = file.name.replace(/\.cube$/i, '');
    const lutId = await putLut(name, text);
    cacheLut(lutId, lut);
    // Opacity is the LUT's intensity; a freshly added LUT layer sits at 0 until one is chosen.
    recipes().updateLayer(layerId, { opacity: 1, params: { lutId, name } });
    editor().setNotice(null);
  } catch (e) {
    const detail = e instanceof CubeParseError ? e.message : messageOf(e);
    fail(`Could not import "${file.name}": ${detail}`);
  }
}

/** Saves the open recipe; `name` (from the save dialog) renames it first. */
export async function saveOpenRecipe(name?: string): Promise<boolean> {
  try {
    const trimmed = name?.trim();
    if (trimmed) recipes().renameRecipe(trimmed);
    const saved = await saveRecipe(recipes().recipe);
    editor().markSaved(saved, true);
    localStorage.setItem(LAST_RECIPE_KEY, saved.id);
    editor().setNotice({ kind: 'info', text: `Saved "${saved.name}"` });
    return true;
  } catch (e) {
    fail(`Could not save the recipe: ${messageOf(e)}`);
    return false;
  }
}

/** Save button / Ctrl+S: asks for a name the first time, then saves in place. */
export function requestSave(): void {
  if (editor().persisted) void saveOpenRecipe();
  else editor().setSaveDialogOpen(true);
}

export async function openSavedRecipe(id: string): Promise<void> {
  try {
    const recipe = await getRecipe(id);
    if (!recipe) {
      fail('That recipe no longer exists.');
      return;
    }
    const missing = await ensureRecipeLuts(recipe);
    recipes().loadRecipe(recipe);
    editor().selectLayer(null);
    editor().markSaved(recipe, true);
    localStorage.setItem(LAST_RECIPE_KEY, recipe.id);
    editor().setNotice(
      missing.length > 0
        ? {
            kind: 'error',
            text: `${missing.length} LUT(s) used by this recipe could not be loaded.`,
          }
        : null,
    );
  } catch (e) {
    fail(`Could not open the recipe: ${messageOf(e)}`);
  }
}

export function startNewRecipe(): void {
  const recipe = createRecipe('Untitled');
  recipes().loadRecipe(recipe);
  editor().selectLayer(null);
  editor().markSaved(recipe, false);
  localStorage.removeItem(LAST_RECIPE_KEY);
}

/** Reopens the recipe that was open when the page was last used. */
export async function restoreLastRecipe(): Promise<void> {
  const id = localStorage.getItem(LAST_RECIPE_KEY);
  if (id) await openSavedRecipe(id);
}
