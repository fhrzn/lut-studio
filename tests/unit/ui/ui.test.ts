import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedImage } from '@/engine/loadImage';
import type { Renderer } from '@/engine/types';
import { createLayer, createRecipe } from '@/recipe/factory';
import { closeDb, getLut, getRecipe } from '@/recipe/store';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import {
  addLayerOfType,
  deleteLayer,
  duplicateLayer,
  importCubeIntoLayer,
  openImageFile,
  openSavedRecipe,
  requestSave,
  restoreLastRecipe,
  saveOpenRecipe,
  startNewRecipe,
} from '@/ui/actions';
import { fitSize } from '@/ui/fitSize';
import { isAcceptedImage } from '@/ui/layerMeta';
import {
  clearLutCache,
  ensureRecipeLuts,
  lutFromCube,
  onLutsChanged,
  resolveLut,
} from '@/ui/lutCache';
import { createPreviewSync } from '@/ui/previewSync';
import { compareModeOf, recipeSnapshot, useEditorStore } from '@/ui/useEditorStore';
import { fixture } from '../lut/fixtures';

const loadImageMock = vi.hoisted(() => vi.fn());
vi.mock('@/engine/loadImage', () => ({ loadImage: loadImageMock, PREVIEW_MAX_EDGE: 2048 }));

const recipe = () => useRecipeStore.getState();
const editor = () => useEditorStore.getState();
// jsdom's File has no `text()`, which browsers do.
const cubeFile = (name: string, text: string) =>
  Object.assign(new File([text], name, { type: '' }), { text: () => Promise.resolve(text) });

beforeEach(async () => {
  await closeDb();
  indexedDB = new IDBFactory();
  localStorage.clear();
  clearLutCache();
  startNewRecipe();
  editor().setNotice(null);
  editor().selectLayer(null);
  loadImageMock.mockReset();
});

describe('layerMeta / fitSize', () => {
  it('accepts JPEG, PNG and WebP by type, or by extension when the type is empty', () => {
    expect(isAcceptedImage(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isAcceptedImage(new File([''], 'a.webp', { type: 'image/webp' }))).toBe(true);
    expect(isAcceptedImage(new File([''], 'a.gif', { type: 'image/gif' }))).toBe(false);
    expect(isAcceptedImage(new File([''], 'a.PNG', { type: '' }))).toBe(true);
    expect(isAcceptedImage(new File([''], 'a.txt', { type: '' }))).toBe(false);
  });

  it('fits an image inside the available area, keeping its aspect ratio', () => {
    expect(fitSize({ width: 2000, height: 1000 }, { width: 500, height: 500 })).toEqual({
      width: 500,
      height: 250,
    });
    expect(fitSize({ width: 100, height: 400 }, { width: 500, height: 200 })).toEqual({
      width: 50,
      height: 200,
    });
    expect(fitSize({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('layer actions', () => {
  it('adds after the selected layer and selects the new one', () => {
    addLayerOfType('exposure');
    addLayerOfType('contrast');
    const [first] = recipe().recipe.layers;
    editor().selectLayer(first!.id);
    addLayerOfType('fade');
    expect(recipe().recipe.layers.map((l) => l.type)).toEqual(['exposure', 'fade', 'contrast']);
    expect(editor().selectedLayerId).toBe(recipe().recipe.layers[1]!.id);
  });

  it('adds a monochrome layer visible and a LUT layer neutral', () => {
    addLayerOfType('monochrome');
    addLayerOfType('lut');
    const [mono, lut] = recipe().recipe.layers;
    expect(mono!.opacity).toBe(1);
    expect(lut!.opacity).toBe(0);
  });

  it('duplicates with a fresh id right after the original', () => {
    addLayerOfType('curve');
    const original = recipe().recipe.layers[0]!;
    duplicateLayer(original.id);
    const [a, b] = recipe().recipe.layers;
    expect(b!.id).not.toBe(a!.id);
    expect({ ...b, id: '' }).toEqual({ ...a, id: '' });
    expect(editor().selectedLayerId).toBe(b!.id);
    duplicateLayer('missing');
    expect(recipe().recipe.layers).toHaveLength(2);
  });

  it('deleting the selected layer selects a neighbour', () => {
    for (const t of ['exposure', 'contrast', 'fade'] as const) addLayerOfType(t);
    const [a, b, c] = recipe().recipe.layers;
    editor().selectLayer(b!.id);
    deleteLayer(b!.id);
    expect(editor().selectedLayerId).toBe(c!.id);
    deleteLayer(c!.id);
    expect(editor().selectedLayerId).toBe(a!.id);
    deleteLayer(a!.id);
    expect(editor().selectedLayerId).toBeNull();
  });

  it('undo restores a deleted layer', () => {
    addLayerOfType('exposure');
    deleteLayer(recipe().recipe.layers[0]!.id);
    recipe().undo();
    expect(recipe().recipe.layers).toHaveLength(1);
  });
});

describe('openImageFile', () => {
  const loaded = (): LoadedImage => ({
    bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    preview: { close: vi.fn() } as unknown as ImageBitmap,
    width: 10,
    height: 20,
  });

  it('rejects unsupported types without decoding', async () => {
    await openImageFile(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(loadImageMock).not.toHaveBeenCalled();
    expect(editor().notice).toMatchObject({ kind: 'error' });
    expect(editor().notice?.text).toContain('doc.pdf');
    expect(editor().image).toBeNull();
  });

  it('stores the decoded image and clears a previous error', async () => {
    const image = loaded();
    loadImageMock.mockResolvedValue(image);
    editor().setNotice({ kind: 'error', text: 'old' });
    await openImageFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    expect(editor().image).toBe(image);
    expect(editor().imageName).toBe('a.jpg');
    expect(editor().notice).toBeNull();
  });

  it('reports decode failures and keeps the current image', async () => {
    const image = loaded();
    loadImageMock.mockResolvedValueOnce(image);
    await openImageFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    loadImageMock.mockRejectedValueOnce(new Error('Could not decode image "b.png"'));
    await openImageFile(new File(['x'], 'b.png', { type: 'image/png' }));
    expect(editor().image).toBe(image);
    expect(editor().notice?.text).toContain('Could not decode');
  });

  it('closes the replaced image on the next frame', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => (fn(), 1));
    const first = loaded();
    loadImageMock.mockResolvedValueOnce(first);
    await openImageFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    loadImageMock.mockResolvedValueOnce(loaded());
    await openImageFile(new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
    expect(first.bitmap.close).toHaveBeenCalled();
    expect(first.preview.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('importCubeIntoLayer', () => {
  it('stores a valid .cube, caches it and points the layer at it', async () => {
    addLayerOfType('lut');
    const layer = recipe().recipe.layers[0]!;
    await importCubeIntoLayer(layer.id, cubeFile('Warm Film.cube', fixture('identity-17.cube')));
    const updated = recipe().recipe.layers[0]!;
    expect(editor().notice).toBeNull();
    expect(updated).toMatchObject({ type: 'lut', opacity: 1, params: { name: 'Warm Film' } });
    const lutId = (updated as Extract<typeof updated, { type: 'lut' }>).params.lutId;
    expect(resolveLut(lutId)?.size).toBe(17);
    expect((await getLut(lutId))?.name).toBe('Warm Film');
  });

  it.each(['bad-size.cube', 'bad-non-numeric.cube', 'bad-too-few-rows.cube', 'bad-nan.cube'])(
    'reports %s and leaves the recipe untouched',
    async (name) => {
      addLayerOfType('lut');
      const before = recipe().recipe;
      await importCubeIntoLayer(before.layers[0]!.id, cubeFile(name, fixture(name)));
      expect(editor().notice).toMatchObject({ kind: 'error' });
      expect(editor().notice?.text).toContain(`Could not import "${name}"`);
      expect(recipe().recipe).toBe(before);
    },
  );

  it('rejects text that is not a LUT at all', async () => {
    addLayerOfType('lut');
    await importCubeIntoLayer(recipe().recipe.layers[0]!.id, cubeFile('x.cube', 'hello world'));
    expect(editor().notice?.kind).toBe('error');
  });

  it('accepts a 1D-only LUT', async () => {
    const lut = lutFromCube(fixture('gamma-1d.cube'));
    expect(lut.size).toBeGreaterThan(1);
    expect(() => lutFromCube('TITLE "empty"\n')).toThrow();
  });

  it('combines a 1D shaper with a 3D LUT', () => {
    expect(lutFromCube(fixture('shaper-1d-3d.cube')).data.length).toBeGreaterThan(0);
  });
});

describe('saving and reopening', () => {
  it('Save asks for a name the first time and saves in place afterwards', async () => {
    requestSave();
    expect(editor().saveDialogOpen).toBe(true);
    editor().setSaveDialogOpen(false);

    addLayerOfType('exposure');
    expect(await saveOpenRecipe('  Warm  ')).toBe(true);
    expect(recipe().recipe.name).toBe('Warm');
    expect(editor().persisted).toBe(true);
    expect(editor().savedSnapshot).toBe(recipeSnapshot(recipe().recipe));
    const stored = await getRecipe(recipe().recipe.id);
    expect(stored?.layers).toHaveLength(1);

    requestSave();
    expect(editor().saveDialogOpen).toBe(false);
  });

  it('a name edit is dirty and undoing it is clean again', () => {
    const saved = editor().savedSnapshot;
    recipe().renameRecipe('Other');
    expect(recipeSnapshot(recipe().recipe)).not.toBe(saved);
    recipe().undo();
    expect(recipeSnapshot(recipe().recipe)).toBe(saved);
  });

  it('reopens a saved recipe identically, including its LUT', async () => {
    addLayerOfType('lut');
    const layerId = recipe().recipe.layers[0]!.id;
    await importCubeIntoLayer(layerId, cubeFile('l.cube', fixture('identity-17.cube')));
    addLayerOfType('curve');
    await saveOpenRecipe('Round trip');
    const saved = recipe().recipe;
    const lutId = (saved.layers[0] as Extract<(typeof saved.layers)[number], { type: 'lut' }>)
      .params.lutId;

    // Simulate a reload: fresh in-memory state, same IndexedDB.
    clearLutCache();
    recipe().loadRecipe(createRecipe('scratch'));
    expect(resolveLut(lutId)).toBeUndefined();
    await restoreLastRecipe();

    const reopened = recipe().recipe;
    expect(reopened.layers).toEqual(saved.layers);
    expect(reopened.name).toBe('Round trip');
    expect(resolveLut(lutId)?.size).toBe(17);
    expect(editor().persisted).toBe(true);
    expect(editor().savedSnapshot).toBe(recipeSnapshot(reopened));
    expect(recipe().past).toHaveLength(0);
  });

  it('reports a recipe that no longer exists', async () => {
    await openSavedRecipe('nope');
    expect(editor().notice?.text).toContain('no longer exists');
  });

  it('warns when a LUT used by the recipe is missing from storage', async () => {
    const r = createRecipe('Broken');
    const lut = { ...createLayer('lut'), params: { lutId: 'gone', name: 'gone' } } as ReturnType<
      typeof createLayer
    >;
    r.layers = [lut];
    expect(await ensureRecipeLuts(r)).toEqual(['gone']);
  });

  it('restoreLastRecipe does nothing without a remembered recipe', async () => {
    const before = recipe().recipe;
    await restoreLastRecipe();
    expect(recipe().recipe).toBe(before);
  });
});

describe('createPreviewSync', () => {
  let frames: (() => void)[] = [];
  const flush = (): void => {
    const run = frames;
    frames = [];
    run.forEach((fn) => fn());
  };
  const fakeRenderer = () => {
    const r = {
      setImage: vi.fn(),
      setLut: vi.fn(),
      setSpatial: vi.fn(),
      setCompare: vi.fn(),
      render: vi.fn(),
      exportFullRes: vi.fn(),
      dispose: vi.fn(),
    };
    return r satisfies Renderer;
  };

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bakes and draws once per frame however many edits happen', () => {
    const r = fakeRenderer();
    const sync = createPreviewSync(r);
    flush();
    expect(r.setLut).toHaveBeenCalledTimes(1);
    expect(r.render).toHaveBeenCalledTimes(1);
    expect(r.setLut.mock.calls[0]![0].size).toBe(33);

    addLayerOfType('exposure');
    const id = recipe().recipe.layers[0]!.id;
    for (let ev = 1; ev <= 20; ev++) recipe().updateLayer(id, { params: { ev: ev / 10 } });
    expect(frames).toHaveLength(1);
    flush();
    expect(r.setLut).toHaveBeenCalledTimes(2);
    expect(r.render).toHaveBeenCalledTimes(2);
    sync.dispose();
  });

  it('does not re-bake for spatial-only or compare-only changes', () => {
    const r = fakeRenderer();
    const sync = createPreviewSync(r);
    flush();
    recipe().setSpatial({ grainAmount: 40 });
    flush();
    editor().toggleBefore();
    flush();
    expect(r.setLut).toHaveBeenCalledTimes(1);
    expect(r.setSpatial).toHaveBeenLastCalledWith(expect.objectContaining({ grainAmount: 40 }));
    expect(r.setCompare).toHaveBeenLastCalledWith({ kind: 'before' });
    expect(r.render).toHaveBeenCalledTimes(3);
    editor().toggleBefore();
    sync.dispose();
  });

  it('re-bakes when a LUT becomes available, and stops after dispose', () => {
    const r = fakeRenderer();
    const sync = createPreviewSync(r);
    flush();
    const stop = onLutsChanged(() => undefined);
    stop();
    useEditorStore.setState({ splitX: 0.2 });
    sync.invalidate();
    flush();
    expect(r.setCompare).toHaveBeenLastCalledWith({ kind: 'after' });
    sync.dispose();
    recipe().setSpatial({ grainAmount: 99 });
    expect(frames).toHaveLength(0);
  });
});

describe('compareModeOf', () => {
  it('prefers before, then split, then after', () => {
    expect(compareModeOf({ showBefore: true, split: true, splitX: 0.3 })).toEqual({
      kind: 'before',
    });
    expect(compareModeOf({ showBefore: false, split: true, splitX: 0.3 })).toEqual({
      kind: 'split',
      x: 0.3,
    });
    expect(compareModeOf({ showBefore: false, split: false, splitX: 0.3 })).toEqual({
      kind: 'after',
    });
  });

  it('clamps the divider and entering split mode leaves before view', () => {
    editor().setSplitX(5);
    expect(editor().splitX).toBe(1);
    editor().setSplitX(-1);
    expect(editor().splitX).toBe(0);
    editor().toggleBefore();
    editor().setSplit(true);
    expect(editor().showBefore).toBe(false);
    editor().setSplit(false);
  });
});
