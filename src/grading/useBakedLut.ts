import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '@/recipe/types';
import { bakeRecipe, type BakeResult, type LutResolver } from './bake';

/**
 * Bakes a recipe into a LUT and re-bakes when its layers or name change, at most once per
 * animation frame (rapid slider drags coalesce into the latest state). The first bake is
 * synchronous so the first render already has a LUT. Spatial params do not trigger a bake.
 * Pass a stable `resolve` (memoised); a new function identity re-bakes.
 */
export function useBakedLut(recipe: Recipe, resolve: LutResolver, size = 33): BakeResult {
  const [result, setResult] = useState<BakeResult>(() => bakeRecipe(recipe, resolve, size));
  const { layers, name } = recipe;
  const latest = useRef({ layers, name, resolve, size });
  latest.current = { layers, name, resolve, size };
  const baked = useRef({ layers, name, resolve, size });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const prev = baked.current;
    if (
      prev.layers === layers &&
      prev.name === name &&
      prev.resolve === resolve &&
      prev.size === size
    ) {
      return;
    }
    if (frame.current !== null) return; // the pending frame bakes the latest values
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const cur = latest.current;
      baked.current = cur;
      setResult(bakeRecipe({ layers: cur.layers, name: cur.name }, cur.resolve, cur.size));
    });
  }, [layers, name, resolve, size]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );

  return result;
}
