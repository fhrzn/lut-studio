import { describe, expect, it } from 'vitest';
import { bakeRecipe } from '@/grading/bake';
import { linearToSrgbExact } from '@/grading/color';
import { prepareLayerOp, runOp } from '@/grading/ops';
import { identityLut3D, sampleLut3D } from '@/lut';
import type { Lut3D, Vec3 } from '@/lut/types';
import { createLayer, createRecipe } from '@/recipe/factory';
import type { Layer, LayerType, Recipe } from '@/recipe/types';

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
const none = (): undefined => undefined;

function recipeOf(...layers: Layer[]): Recipe {
  return { ...createRecipe('test'), layers };
}

function layer<T extends LayerType>(
  type: T,
  patch: (l: Extract<Layer, { type: T }>) => void,
  opacity = 1,
): Layer {
  const l = createLayer(type) as Extract<Layer, { type: T }>;
  patch(l);
  l.opacity = opacity;
  return l;
}

function maxDiff(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++)
    worst = Math.max(worst, Math.abs((a[i] as number) - (b[i] as number)));
  return worst;
}

/** Deterministic pseudo-random numbers in [0,1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Smooth cross-channel 3D LUT over [0,1]^3, so interpolation error is realistic. */
function smoothLut(size: number): Lut3D {
  const lut = identityLut3D(size);
  for (let i = 0; i < lut.data.length; i += 3) {
    const [r, g, b] = [lut.data[i] as number, lut.data[i + 1] as number, lut.data[i + 2] as number];
    lut.data[i] = Math.min(1, Math.pow(r, 0.9) * 0.9 + 0.1 * g);
    lut.data[i + 1] = Math.sin((g * Math.PI) / 2) * 0.8 + 0.1 * b * r;
    lut.data[i + 2] = 0.05 + 0.85 * b * (1 - 0.3 * r) + 0.1 * g * g;
  }
  return lut;
}

describe('bakeRecipe: neutral defaults', () => {
  const identity = identityLut3D(33);

  it.each(ALL_TYPES)('a default %s layer is a no-op (within 1e-4)', (type) => {
    const { lut, warnings } = bakeRecipe(recipeOf(createLayer(type)), none);
    expect(maxDiff(lut.data, identity.data)).toBeLessThan(1e-4);
    expect(warnings).toEqual([]);
  });

  it('a stack of all default layers is a no-op', () => {
    const { lut } = bakeRecipe(recipeOf(...ALL_TYPES.map((t) => createLayer(t))), none);
    expect(maxDiff(lut.data, identity.data)).toBeLessThan(1e-4);
  });

  it('neutral parameters stay neutral even at full opacity (ops that have a neutral setting)', () => {
    const layers = ALL_TYPES.filter((t) => t !== 'monochrome' && t !== 'lut').map((t) => {
      const l = createLayer(t);
      l.opacity = 1;
      return l;
    });
    const { lut } = bakeRecipe(recipeOf(...layers), none);
    expect(maxDiff(lut.data, identity.data)).toBeLessThan(1e-4);
  });

  it('sets the LUT title to the recipe name and the requested size', () => {
    const { lut } = bakeRecipe({ ...createRecipe('Warm Film'), layers: [] }, none, 17);
    expect(lut.title).toBe('Warm Film');
    expect(lut.size).toBe(17);
    expect(lut.data.length).toBe(17 ** 3 * 3);
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });
});

describe('bakeRecipe: opacity, enabled, order', () => {
  const strong = (opacity: number): Recipe =>
    recipeOf(layer('exposure', (l) => (l.params.ev = -1), opacity));

  it('opacity 0 is a no-op', () => {
    expect(maxDiff(bakeRecipe(strong(0), none).lut.data, identityLut3D(33).data)).toBe(0);
  });

  it('opacity 0.5 is the midpoint between input and the layer output', () => {
    const full = bakeRecipe(strong(1), none).lut.data;
    const half = bakeRecipe(strong(0.5), none).lut.data;
    const id = identityLut3D(33).data;
    for (let i = 0; i < id.length; i++) {
      expect(half[i]).toBeCloseTo(((id[i] as number) + (full[i] as number)) / 2, 6);
    }
  });

  it('opacity 0.5 mixes in encoded space: 0.5 at -1 EV gives (0.5 + 0.3607802) / 2', () => {
    const lut = bakeRecipe(strong(0.5), none, 3).lut; // grid 0, 0.5, 1
    expect(sampleLut3D(lut, [0.5, 0.5, 0.5])[0]).toBeCloseTo((0.5 + 0.3607802) / 2, 6);
  });

  it('skips disabled layers', () => {
    const l = layer('exposure', (x) => (x.params.ev = 2));
    l.enabled = false;
    expect(maxDiff(bakeRecipe(recipeOf(l), none).lut.data, identityLut3D(33).data)).toBe(0);
  });

  it('applies layers top to bottom', () => {
    const a = layer('exposure', (l) => (l.params.ev = 1));
    const b = layer('contrast', (l) => (l.params.amount = 80));
    const ab = bakeRecipe(recipeOf(a, b), none).lut.data;
    const ba = bakeRecipe(recipeOf(b, a), none).lut.data;
    expect(maxDiff(ab, ba)).toBeGreaterThan(0.01);
    // exposure first, then contrast, evaluated by hand on one grid point (0.5 grey)
    const exposed = linearToSrgbExact(2 * 0.2140411);
    const k = 0.8;
    const expected = exposed + k * (exposed * exposed * (3 - 2 * exposed) - exposed);
    const lut = bakeRecipe(recipeOf(a, b), none, 3).lut;
    expect(sampleLut3D(lut, [0.5, 0.5, 0.5])[0]).toBeCloseTo(expected, 5);
  });

  it('keeps intermediate values unclamped and clamps only the final output', () => {
    // +2 EV pushes 0.9 far above 1; the next layer must still see the real value.
    const up = layer('exposure', (l) => (l.params.ev = 2));
    const down = layer('exposure', (l) => (l.params.ev = -2));
    const between = layer('fade', (l) => (l.params.amount = 100));
    const roundTrip = bakeRecipe(recipeOf(up, down), none).lut.data;
    expect(maxDiff(roundTrip, identityLut3D(33).data)).toBeLessThan(1e-4);
    const viaFade = bakeRecipe(recipeOf(up, between, down), none).lut;
    expect(viaFade.data.every((v) => v >= 0 && v <= 1)).toBe(true);
    const blown = bakeRecipe(recipeOf(up), none, 3).lut; // 0.5 -> above 1 -> clamped at the end
    expect(sampleLut3D(blown, [1, 1, 1])).toEqual([1, 1, 1]);
  });

  it('output is always inside [0,1] for an aggressive stack', () => {
    const lut = bakeRecipe(
      recipeOf(
        layer('exposure', (l) => (l.params.ev = 3)),
        layer('contrast', (l) => (l.params.amount = 100)),
        layer('saturation', (l) => (l.params = { saturation: 100, vibrance: 100 })),
        layer(
          'splitTone',
          (l) =>
            (l.params = {
              shadowHue: 0,
              shadowSat: 100,
              highlightHue: 200,
              highlightSat: 100,
              balance: 0,
            }),
        ),
      ),
      none,
    ).lut;
    expect(lut.data.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('produces no NaN for any layer type at extreme settings', () => {
    const l = createLayer('hsl');
    if (l.type === 'hsl')
      for (const b of Object.keys(l.params) as (keyof typeof l.params)[])
        l.params[b] = { hue: 100, sat: 100, lum: 100 };
    const wb = layer('whiteBalance', (x) => (x.params = { temperature: -100, tint: 100 }));
    const lut = bakeRecipe(
      recipeOf(
        l,
        wb,
        layer('exposure', (x) => (x.params.ev = -5)),
      ),
      none,
    ).lut;
    expect(lut.data.every(Number.isFinite)).toBe(true);
  });
});

describe('bakeRecipe: composition equals sequential evaluation', () => {
  /** Reference: every layer evaluated independently in encoded space, mixed there, clamped at the end. */
  function reference(recipe: Recipe, size: number): Float32Array {
    const out = identityLut3D(size).data;
    for (let i = 0; i < out.length; i += 3) {
      let cur: Vec3 = [out[i] as number, out[i + 1] as number, out[i + 2] as number];
      for (const l of recipe.layers) {
        const op = prepareLayerOp(l);
        if (!l.enabled || !op) continue;
        const next = runOp(op, cur);
        cur = [0, 1, 2].map(
          (c) => (cur[c] as number) + ((next[c] as number) - (cur[c] as number)) * l.opacity,
        ) as Vec3;
      }
      for (let c = 0; c < 3; c++) out[i + c] = Math.min(1, Math.max(0, cur[c] as number));
    }
    return out;
  }

  const hsl = (): Layer =>
    layer('hsl', (l) => {
      l.params.red.sat = 30;
      l.params.blue.hue = -40;
      l.params.green.lum = 20;
    });
  const sat = (): Layer =>
    layer('saturation', (l) => (l.params = { saturation: 15, vibrance: 40 }));
  const exp = (ev: number, opacity = 1): Layer =>
    layer('exposure', (l) => (l.params.ev = ev), opacity);
  const wb = (): Layer => layer('whiteBalance', (l) => (l.params = { temperature: 35, tint: -12 }));
  const fadeL = (): Layer => layer('fade', (l) => (l.params.amount = 30));

  it.each([
    ['linear then OKLab fused (exposure, wb, hsl, saturation)', [exp(0.5), wb(), hsl(), sat()]],
    ['encoded layers between space-changing layers', [hsl(), fadeL(), exp(-0.3), sat(), fadeL()]],
    ['values above 1 pass through encoded layers unclamped', [exp(2), fadeL(), exp(-2)]],
    [
      'partial opacity in the middle of a fused run',
      [exp(0.4), wb(), layer('hsl', (l) => (l.params.red.hue = 50), 0.5), sat()],
    ],
    [
      'opacity on the first and last layers',
      [exp(0.8, 0.3), hsl(), sat(), fadeL()].map((l, i, a) =>
        i === a.length - 1 ? { ...l, opacity: 0.6 } : l,
      ),
    ],
  ] as [string, Layer[]][])('%s', (_name, layers) => {
    const recipe = recipeOf(...layers);
    expect(maxDiff(bakeRecipe(recipe, none, 17).lut.data, reference(recipe, 17))).toBeLessThan(
      1e-5,
    );
  });
});

describe('bakeRecipe: lut layers', () => {
  const lutLayer = (id: string, opacity = 1): Layer =>
    layer('lut', (l) => (l.params = { lutId: id, name: `${id}.cube` }), opacity);

  it.each([33, 17])(
    'a %i-point LUT at opacity 1 is reproduced within 1/255 at 1000 random points',
    (lutSize) => {
      const source = smoothLut(lutSize);
      const { lut, warnings } = bakeRecipe(recipeOf(lutLayer('a')), (id) =>
        id === 'a' ? source : undefined,
      );
      expect(warnings).toEqual([]);
      const rand = rng(42);
      for (let n = 0; n < 1000; n++) {
        const p: Vec3 = [rand(), rand(), rand()];
        const want = sampleLut3D(source, p);
        const got = sampleLut3D(lut, p);
        for (let c = 0; c < 3; c++)
          expect(Math.abs((got[c] as number) - (want[c] as number))).toBeLessThan(1 / 255);
      }
    },
  );

  it('honours a LUT with a non-default domain', () => {
    const source = identityLut3D(9);
    source.domainMin = [0, 0, 0];
    source.domainMax = [0.5, 0.5, 0.5]; // input above 0.5 clamps to the last entry
    const { lut } = bakeRecipe(recipeOf(lutLayer('d')), () => source, 5);
    expect(sampleLut3D(lut, [0.25, 0.25, 0.25])[0]).toBeCloseTo(
      sampleLut3D(source, [0.25, 0.25, 0.25])[0],
      6,
    );
    expect(sampleLut3D(lut, [1, 1, 1])[0]).toBeCloseTo(1, 6);
  });

  it('opacity 0.5 blends the LUT with the input', () => {
    const source = smoothLut(17);
    const { lut } = bakeRecipe(recipeOf(lutLayer('a', 0.5)), () => source, 17);
    const p: Vec3 = [0.2, 0.6, 0.9];
    const full = sampleLut3D(source, p);
    expect(sampleLut3D(lut, p)[1]).toBeCloseTo((p[1] + (full[1] as number)) / 2, 2);
  });

  it('skips a layer whose LUT is missing and reports a warning', () => {
    const l = lutLayer('gone');
    const { lut, warnings } = bakeRecipe(
      recipeOf(
        l,
        layer('fade', (x) => (x.params.amount = 100)),
      ),
      none,
    );
    expect(warnings).toEqual([
      {
        layerId: l.id,
        code: 'missing-lut',
        message: 'LUT layer "gone.cube" skipped: LUT not found',
      },
    ]);
    expect(lut.data[0]).toBeCloseTo(0.2, 6); // the rest of the stack still applies
  });

  it('does not warn for layers that would have no effect anyway', () => {
    const empty = createLayer('lut'); // lutId '', opacity 0
    const off = lutLayer('gone');
    off.enabled = false;
    expect(bakeRecipe(recipeOf(empty, off, lutLayer('gone', 0)), none).warnings).toEqual([]);
  });

  it('warns for an unnamed LUT layer that is switched on but empty', () => {
    const l = createLayer('lut');
    l.opacity = 1;
    const { warnings } = bakeRecipe(recipeOf(l), none);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('unnamed');
  });

  it('resolves each LUT once per bake, not once per grid point', () => {
    let calls = 0;
    const source = smoothLut(9);
    bakeRecipe(recipeOf(lutLayer('a')), () => {
      calls++;
      return source;
    });
    expect(calls).toBe(1);
  });
});
