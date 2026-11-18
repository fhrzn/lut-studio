import { composeShaper, lut1dTo3d, parseCube } from '@/lut';
import type { Lut3D } from '@/lut/types';
import type { Recipe } from '@/recipe/types';
import { getLut } from '@/recipe/store';
import type { LutResolver } from '@/grading/bake';

const cache = new Map<string, Lut3D>();
const listeners = new Set<() => void>();

/** Parses `.cube` text into one 3D LUT (a 1D shaper is folded in); throws `CubeParseError` on bad input. */
export function lutFromCube(text: string): Lut3D {
  const { lut1d, lut3d } = parseCube(text);
  if (lut3d && lut1d) return composeShaper(lut1d, lut3d);
  if (lut3d) return lut3d;
  if (lut1d) return lut1dTo3d(lut1d);
  throw new Error('The file contains no LUT data');
}

export const resolveLut: LutResolver = (id) => cache.get(id);

export function cacheLut(id: string, lut: Lut3D): void {
  cache.set(id, lut);
  listeners.forEach((fn) => fn());
}

/** Calls `fn` whenever a LUT becomes available; returns the unsubscribe function. */
export function onLutsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Loads the LUTs a recipe references from IndexedDB into the cache. Returns ids that could not be loaded. */
export async function ensureRecipeLuts(recipe: Recipe): Promise<string[]> {
  const missing: string[] = [];
  const ids = new Set(
    recipe.layers.flatMap((l) =>
      l.type === 'lut' && l.params.lutId !== '' ? [l.params.lutId] : [],
    ),
  );
  for (const id of ids) {
    if (cache.has(id)) continue;
    try {
      const record = await getLut(id);
      if (!record) {
        missing.push(id);
        continue;
      }
      cacheLut(id, lutFromCube(record.cubeText));
    } catch {
      missing.push(id);
    }
  }
  return missing;
}

/** Test hook. */
export function clearLutCache(): void {
  cache.clear();
}
