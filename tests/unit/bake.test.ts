import { describe, it, expect } from 'vitest';
import { bakeRecipe } from '@/grading/bake';
import type { Recipe } from '@/recipe/types';

describe('bakeRecipe', () => {
  const dummyRecipe: Recipe = {
    schemaVersion: 1,
    id: 'test',
    name: 'test',
    source: 'builtin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    layers: [],
    spatial: {
      grainAmount: 0,
      grainSize: 0,
      vignetteAmount: 0,
      vignetteMidpoint: 0,
    },
  };

  it('returns size^3*3 values', () => {
    const size = 33;
    const lut = bakeRecipe(dummyRecipe, () => undefined, size);
    expect(lut.data.length).toBe(size * size * size * 3);
  });

  it('has first triplet [0,0,0]', () => {
    const lut = bakeRecipe(dummyRecipe, () => undefined, 33);
    expect(lut.data[0]).toBe(0);
    expect(lut.data[1]).toBe(0);
    expect(lut.data[2]).toBe(0);
  });

  it('has last triplet [1,1,1]', () => {
    const size = 33;
    const lut = bakeRecipe(dummyRecipe, () => undefined, size);
    const lastIndex = size * size * size * 3;
    expect(lut.data[lastIndex - 3]).toBe(1);
    expect(lut.data[lastIndex - 2]).toBe(1);
    expect(lut.data[lastIndex - 1]).toBe(1);
  });
});
