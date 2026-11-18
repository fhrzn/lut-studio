import { identityLut3D } from '@/lut';
import type { Lut3D, Vec3 } from '@/lut/types';
import type { Recipe } from '@/recipe/types';
import { prepareLayerOp, spaceConverter, type PreparedOp, type Space } from './ops';

export type LutResolver = (lutId: string) => Lut3D | undefined;

export interface BakeWarning {
  layerId: string;
  code: 'missing-lut';
  message: string;
}

export interface BakeResult {
  lut: Lut3D;
  warnings: BakeWarning[];
}

/** The part of a recipe that affects the baked LUT (spatial params never do). */
export type Bakeable = Pick<Recipe, 'name' | 'layers'>;

type Fn = (v: Vec3) => Vec3;

/**
 * One layer compiled for the hot loop; spaces are resolved once, not per colour.
 * Opacity 1: `pre` moves the running colour into the op's space and the op's output stays there.
 * Opacity < 1: the colour goes to encoded space (`toEncoded`), through the op (`pre`, `fn`, `post`)
 * and is mixed there, as documented.
 */
interface Step {
  opacity: number;
  toEncoded: Fn | null;
  pre: Fn | null;
  fn: Fn;
  post: Fn | null;
}

function compile(ops: { op: PreparedOp; opacity: number }[]): { steps: Step[]; finish: Fn | null } {
  const steps: Step[] = [];
  let space: Space = 'encoded';
  for (const { op, opacity } of ops) {
    if (opacity === 1) {
      steps.push({
        opacity,
        toEncoded: null,
        pre: spaceConverter(space, op.space),
        fn: op.fn,
        post: null,
      });
      space = op.space;
    } else {
      steps.push({
        opacity,
        toEncoded: spaceConverter(space, 'encoded'),
        pre: spaceConverter('encoded', op.space),
        fn: op.fn,
        post: spaceConverter(op.space, 'encoded'),
      });
      space = 'encoded';
    }
  }
  return { steps, finish: spaceConverter(space, 'encoded') };
}

/**
 * Bakes the layer stack into a size^3 LUT over [0,1]. Input and output are sRGB-encoded.
 * Each enabled layer contributes `out = in + (op(in) - in) * opacity`; disabled, zero-opacity and
 * neutral layers are skipped. Intermediate values are not clamped, the result is.
 * A `lut` layer whose LUT cannot be resolved is skipped and reported in `warnings`.
 */
export function bakeRecipe(recipe: Bakeable, resolve: LutResolver, size = 33): BakeResult {
  const warnings: BakeWarning[] = [];
  const ops: { op: PreparedOp; opacity: number }[] = [];
  for (const layer of recipe.layers) {
    const opacity = Math.min(Math.max(layer.opacity, 0), 1);
    if (!layer.enabled || opacity === 0) continue;
    let lut: Lut3D | undefined;
    if (layer.type === 'lut') {
      lut = layer.params.lutId ? resolve(layer.params.lutId) : undefined;
      if (!lut) {
        const label = layer.params.name || layer.params.lutId || 'unnamed';
        warnings.push({
          layerId: layer.id,
          code: 'missing-lut',
          message: `LUT layer "${label}" skipped: LUT not found`,
        });
        continue;
      }
    }
    const op = prepareLayerOp(layer, lut);
    if (op) ops.push({ op, opacity }); // null = neutral parameters, nothing to apply
  }

  const out = identityLut3D(size);
  out.title = recipe.name;
  if (ops.length === 0) return { lut: out, warnings };

  // The running colour stays in the last op's space, so back-to-back ops that share a space (or
  // sit next to it, like linear and OKLab) skip the encode/decode round trip.
  const { steps, finish } = compile(ops);
  const data = out.data;
  for (let i = 0; i < data.length; i += 3) {
    let cur: Vec3 = [data[i] as number, data[i + 1] as number, data[i + 2] as number];
    for (const step of steps) {
      if (step.opacity === 1) {
        cur = step.fn(step.pre ? step.pre(cur) : cur);
        continue;
      }
      const from = step.toEncoded ? step.toEncoded(cur) : cur;
      let to = step.fn(step.pre ? step.pre(from) : from);
      if (step.post) to = step.post(to);
      const t = step.opacity;
      cur = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ];
    }
    if (finish) cur = finish(cur);
    data[i] = clamp01(cur[0]);
    data[i + 1] = clamp01(cur[1]);
    data[i + 2] = clamp01(cur[2]);
  }
  return { lut: out, warnings };
}

/** Clamps to [0,1]; NaN becomes 0. */
const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
