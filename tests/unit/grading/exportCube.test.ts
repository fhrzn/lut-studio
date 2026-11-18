import { describe, expect, it } from 'vitest';
import { bakeRecipe } from '@/grading/bake';
import { recipeToCube } from '@/grading/exportCube';
import { identityLut3D, parseCube } from '@/lut';
import { createLayer, createRecipe } from '@/recipe/factory';
import type { Layer, Recipe } from '@/recipe/types';

function gradedRecipe(): Recipe {
  const exposure = createLayer('exposure');
  if (exposure.type === 'exposure') exposure.params.ev = 0.5;
  const wb = createLayer('whiteBalance');
  if (wb.type === 'whiteBalance') wb.params = { temperature: 30, tint: 5 };
  const sat = createLayer('saturation');
  if (sat.type === 'saturation') sat.params = { saturation: 20, vibrance: 30 };
  const fade = createLayer('fade');
  if (fade.type === 'fade') fade.params.amount = 25;
  return { ...createRecipe('Golden "Hour"'), layers: [exposure, wb, sat, fade] as Layer[] };
}

describe('recipeToCube', () => {
  it('parses back with parseCube and matches the bake', () => {
    const recipe = gradedRecipe();
    const parsed = parseCube(recipeToCube(recipe, () => undefined));
    const baked = bakeRecipe(recipe, () => undefined).lut;
    expect(parsed.lut3d?.size).toBe(33);
    expect(parsed.lut3d?.domainMin).toEqual([0, 0, 0]);
    expect(parsed.lut3d?.domainMax).toEqual([1, 1, 1]);
    const data = parsed.lut3d?.data as Float32Array;
    expect(data.length).toBe(baked.data.length);
    let worst = 0;
    for (let i = 0; i < data.length; i++)
      worst = Math.max(worst, Math.abs((data[i] as number) - (baked.data[i] as number)));
    expect(worst).toBeLessThan(1e-6);
  });

  it('writes the recipe name as TITLE and notes that grain and vignette are excluded', () => {
    const text = recipeToCube(gradedRecipe(), () => undefined);
    expect(text).toContain('TITLE "Golden  Hour "'); // quotes are not representable in a .cube title
    expect(text).toMatch(/^# .*[Gg]rain and vignette are not included/m);
    expect(text).toContain('LUT_3D_SIZE 33');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('honours the size argument', () => {
    const parsed = parseCube(recipeToCube(gradedRecipe(), () => undefined, 17));
    expect(parsed.lut3d?.size).toBe(17);
    expect(parsed.lut3d?.data.length).toBe(17 ** 3 * 3);
  });

  it('exports an empty recipe as an identity LUT', () => {
    const parsed = parseCube(recipeToCube(createRecipe('Plain'), () => undefined, 5));
    expect(Array.from(parsed.lut3d?.data ?? [])).toEqual(Array.from(identityLut3D(5).data));
  });

  it('bakes imported LUT layers in and records skipped ones as comments', () => {
    const present = createLayer('lut');
    present.opacity = 1;
    if (present.type === 'lut') present.params = { lutId: 'ok', name: 'ok.cube' };
    const missing = createLayer('lut');
    missing.opacity = 1;
    if (missing.type === 'lut') missing.params = { lutId: 'gone', name: 'gone.cube' };
    const invert = identityLut3D(2);
    for (let i = 0; i < invert.data.length; i++) invert.data[i] = 1 - (invert.data[i] as number);
    const recipe = { ...createRecipe('Inverted'), layers: [present, missing] };

    const text = recipeToCube(recipe, (id) => (id === 'ok' ? invert : undefined), 3);
    expect(text).toMatch(/^# Warning: LUT layer "gone.cube" skipped/m);
    const data = parseCube(text).lut3d?.data as Float32Array;
    expect(Array.from(data.slice(0, 3))).toEqual([1, 1, 1]); // black grid point inverted
    expect(Array.from(data.slice(-3))).toEqual([0, 0, 0]);
  });
});
