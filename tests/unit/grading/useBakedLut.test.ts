import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bakeRecipe, type BakeResult, type LutResolver } from '@/grading/bake';
import { useBakedLut } from '@/grading/useBakedLut';
import { createLayer, createRecipe } from '@/recipe/factory';
import type { Recipe } from '@/recipe/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const none: LutResolver = () => undefined;

function recipeWithExposure(ev: number, base: Recipe = createRecipe('hook')): Recipe {
  const layer = createLayer('exposure');
  if (layer.type === 'exposure') layer.params.ev = ev;
  return { ...base, layers: [layer] };
}

describe('useBakedLut', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let root: Root;
  let container: HTMLElement;
  let latest: BakeResult;

  function Probe(props: { recipe: Recipe; resolve?: LutResolver }): null {
    latest = useBakedLut(props.recipe, props.resolve ?? none);
    return null;
  }
  const render = (recipe: Recipe, resolve?: LutResolver): void => {
    act(() => root.render(createElement(Probe, { recipe, resolve })));
  };
  const flushFrames = (): void => {
    act(() => {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, cb] of pending) cb(0);
    });
  };

  beforeEach(() => {
    frames = new Map();
    nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('bakes synchronously on the first render', () => {
    const recipe = recipeWithExposure(1);
    render(recipe);
    expect(latest.lut.data).toEqual(bakeRecipe(recipe, none).lut.data);
    expect(frames.size).toBe(0);
  });

  it('coalesces many recipe changes into one bake per animation frame, using the latest recipe', () => {
    const base = createRecipe('hook');
    render(recipeWithExposure(0.1, base));
    const first = latest;

    render(recipeWithExposure(0.2, base));
    render(recipeWithExposure(0.3, base));
    const last = recipeWithExposure(0.4, base);
    render(last);
    expect(frames.size).toBe(1);
    expect(latest).toBe(first); // nothing re-baked yet

    flushFrames();
    expect(latest).not.toBe(first);
    expect(latest.lut.data).toEqual(bakeRecipe(last, none).lut.data);
    expect(frames.size).toBe(0);
  });

  it('does not re-bake for spatial-only changes', () => {
    const recipe = recipeWithExposure(0.5);
    render(recipe);
    const first = latest;
    render({
      ...recipe,
      spatial: { ...recipe.spatial, grainAmount: 40 },
      updatedAt: new Date().toISOString(),
    });
    expect(frames.size).toBe(0);
    expect(latest).toBe(first);
  });

  it('re-bakes when the resolver changes', () => {
    const recipe = recipeWithExposure(0.5);
    render(recipe, none);
    render(recipe, () => undefined);
    expect(frames.size).toBe(1);
  });

  it('cancels a pending frame on unmount', () => {
    const base = createRecipe('hook');
    render(recipeWithExposure(0.1, base));
    render(recipeWithExposure(0.2, base));
    expect(frames.size).toBe(1);
    act(() => root.unmount());
    expect(frames.size).toBe(0);
    root = createRoot(container); // afterEach unmounts again
  });
});
