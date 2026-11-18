// Entry bundled by scripts/bench-bake.mjs and run inside Chromium. Not part of the app build.
import { bakeRecipe } from '../src/grading/bake';
import { createLayer, createRecipe } from '../src/recipe/factory';
import type { Layer, Recipe } from '../src/recipe/types';

function set<T extends Layer['type']>(
  type: T,
  patch: (l: Extract<Layer, { type: T }>) => void,
): Layer {
  const layer = createLayer(type) as Extract<Layer, { type: T }>;
  patch(layer);
  return layer;
}

/** A realistic 10-layer grade: every layer type except lut once, plus a second HSL and saturation. */
export function tenLayerRecipe(): Recipe {
  const recipe = createRecipe('bench');
  const hsl = () =>
    set('hsl', (l) => {
      l.params.red.sat = 20;
      l.params.orange.hue = -10;
      l.params.blue.hue = 15;
      l.params.blue.lum = -10;
    });
  const saturation = () => set('saturation', (l) => (l.params = { saturation: 10, vibrance: 20 }));
  recipe.layers = [
    set('exposure', (l) => (l.params.ev = 0.4)),
    set('whiteBalance', (l) => (l.params = { temperature: 25, tint: 8 })),
    set('contrast', (l) => (l.params.amount = 20)),
    set(
      'curve',
      (l) =>
        (l.params.master = [
          { x: 0, y: 0.02 },
          { x: 0.5, y: 0.55 },
          { x: 1, y: 1 },
        ]),
    ),
    hsl(),
    set(
      'splitTone',
      (l) =>
        (l.params = {
          shadowHue: 220,
          shadowSat: 30,
          highlightHue: 40,
          highlightSat: 30,
          balance: 0,
        }),
    ),
    saturation(),
    set('fade', (l) => (l.params.amount = 15)),
    hsl(),
    saturation(),
  ];
  return recipe;
}

/** Median and worst of `runs` bakes after a warm-up, in milliseconds. */
export function benchBake(runs = 30): { median: number; max: number; layers: number } {
  const recipe = tenLayerRecipe();
  const resolve = () => undefined;
  for (let i = 0; i < 10; i++) bakeRecipe(recipe, resolve);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    bakeRecipe(recipe, resolve);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return {
    median: times[Math.floor(runs / 2)] as number,
    max: times[runs - 1] as number,
    layers: recipe.layers.length,
  };
}

(globalThis as unknown as { benchBake: typeof benchBake }).benchBake = benchBake;
