import { z } from 'zod';
import type { Recipe } from './types';

const unit = z.number().min(0).max(1);
const pct = z.number().min(-100).max(100);
const pct01 = z.number().min(0).max(100);

const layerBase = {
  id: z.string().min(1),
  enabled: z.boolean(),
  opacity: unit,
};

export const CurvePointSchema = z.strictObject({ x: unit, y: unit });
const curve = z.array(CurvePointSchema).min(2);

export const HslAdjustSchema = z.strictObject({ hue: pct, sat: pct, lum: pct });

export const LayerSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...layerBase,
    type: z.literal('exposure'),
    params: z.strictObject({ ev: z.number().min(-5).max(5) }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('whiteBalance'),
    params: z.strictObject({ temperature: pct, tint: pct }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('contrast'),
    params: z.strictObject({ amount: pct }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('curve'),
    params: z.strictObject({ master: curve, r: curve, g: curve, b: curve }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('hsl'),
    params: z.strictObject({
      red: HslAdjustSchema,
      orange: HslAdjustSchema,
      yellow: HslAdjustSchema,
      green: HslAdjustSchema,
      aqua: HslAdjustSchema,
      blue: HslAdjustSchema,
      purple: HslAdjustSchema,
      magenta: HslAdjustSchema,
    }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('splitTone'),
    params: z.strictObject({
      shadowHue: z.number().min(0).max(360),
      shadowSat: pct01,
      highlightHue: z.number().min(0).max(360),
      highlightSat: pct01,
      balance: pct,
    }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('saturation'),
    params: z.strictObject({ saturation: pct, vibrance: pct }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('fade'),
    params: z.strictObject({ amount: pct01 }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('monochrome'),
    params: z.strictObject({
      red: z.number().min(-200).max(300),
      green: z.number().min(-200).max(300),
      blue: z.number().min(-200).max(300),
    }),
  }),
  z.strictObject({
    ...layerBase,
    type: z.literal('lut'),
    // Empty lutId means "no LUT chosen yet" (the factory default).
    params: z.strictObject({ lutId: z.string(), name: z.string() }),
  }),
]);

export const SpatialSchema = z.strictObject({
  grainAmount: pct01,
  grainSize: pct01,
  vignetteAmount: pct,
  vignetteMidpoint: pct01,
});

export const RecipeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(['user', 'builtin']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  layers: z.array(LayerSchema),
  spatial: SpatialSchema,
});

// Compile-time check: the schema and `Recipe` must stay mutually assignable.
type Inferred = z.infer<typeof RecipeSchema>;
type Assert<T extends true> = T;
export type SchemaMatchesRecipe = [
  Assert<Inferred extends Recipe ? true : false>,
  Assert<Recipe extends Inferred ? true : false>,
];
