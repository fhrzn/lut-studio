import { describe, expect, it } from 'vitest';
import { createLayer, createRecipe } from '@/recipe/factory';
import { LayerSchema, RecipeSchema } from '@/recipe/schema';
import type { Layer, LayerType } from '@/recipe/types';

const ALL_TYPES: LayerType[] = [
  'exposure',
  'whiteBalance',
  'contrast',
  'curve',
  'hsl',
  'splitTone',
  'saturation',
  'fade',
  'monochrome',
  'lut',
];

/** One out-of-range mutation per layer type. */
const INVALID: Record<LayerType, (l: Layer) => unknown> = {
  exposure: (l) => ({ ...l, params: { ev: 5.1 } }),
  whiteBalance: (l) => ({ ...l, params: { temperature: 101, tint: 0 } }),
  contrast: (l) => ({ ...l, params: { amount: -101 } }),
  curve: (l) => ({
    ...l,
    params: {
      ...l.params,
      master: [
        { x: 0, y: 0 },
        { x: 1.5, y: 1 },
      ],
    },
  }),
  hsl: (l) => ({ ...l, params: { ...l.params, red: { hue: 0, sat: 0, lum: 101 } } }),
  splitTone: (l) => ({ ...l, params: { ...l.params, shadowHue: 361 } }),
  saturation: (l) => ({ ...l, params: { saturation: 0, vibrance: 101 } }),
  fade: (l) => ({ ...l, params: { amount: 101 } }),
  monochrome: (l) => ({ ...l, params: { red: 301, green: 0, blue: 0 } }),
  lut: (l) => ({ ...l, params: { lutId: 1, name: '' } }),
};

describe('RecipeSchema', () => {
  it('accepts a fresh recipe', () => {
    expect(RecipeSchema.safeParse(createRecipe('x')).success).toBe(true);
  });

  it.each(ALL_TYPES)('accepts a default %s layer', (type) => {
    expect(LayerSchema.safeParse(createLayer(type)).success).toBe(true);
  });

  it.each(ALL_TYPES)('rejects out-of-range %s params', (type) => {
    expect(LayerSchema.safeParse(INVALID[type](createLayer(type))).success).toBe(false);
  });

  it.each(ALL_TYPES)('rejects %s opacity outside 0..1', (type) => {
    for (const opacity of [-0.1, 1.1]) {
      expect(LayerSchema.safeParse({ ...createLayer(type), opacity }).success).toBe(false);
    }
  });

  it('accepts boundary values', () => {
    expect(LayerSchema.safeParse({ ...createLayer('exposure'), params: { ev: -5 } }).success).toBe(
      true,
    );
    expect(LayerSchema.safeParse({ ...createLayer('exposure'), params: { ev: 5 } }).success).toBe(
      true,
    );
    expect(
      LayerSchema.safeParse({
        ...createLayer('monochrome'),
        params: { red: -200, green: 300, blue: 0 },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown layer types', () => {
    expect(LayerSchema.safeParse({ ...createLayer('fade'), type: 'sharpen' }).success).toBe(false);
  });

  it('rejects unknown keys and non-finite numbers', () => {
    expect(LayerSchema.safeParse({ ...createLayer('fade'), extra: 1 }).success).toBe(false);
    expect(LayerSchema.safeParse({ ...createLayer('fade'), params: { amount: NaN } }).success).toBe(
      false,
    );
    expect(RecipeSchema.safeParse({ ...createRecipe('x'), extra: 1 }).success).toBe(false);
  });

  it('rejects bad spatial values, version, source and dates', () => {
    const r = createRecipe('x');
    expect(
      RecipeSchema.safeParse({ ...r, spatial: { ...r.spatial, grainAmount: 101 } }).success,
    ).toBe(false);
    expect(
      RecipeSchema.safeParse({ ...r, spatial: { ...r.spatial, vignetteAmount: -101 } }).success,
    ).toBe(false);
    expect(RecipeSchema.safeParse({ ...r, schemaVersion: 2 }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...r, source: 'cloud' }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...r, createdAt: 'yesterday' }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...r, name: '' }).success).toBe(false);
  });
});
