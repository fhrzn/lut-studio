import { describe, expect, it } from 'vitest';
import {
  linearToOklab,
  linearToSrgbExact,
  mulMat3,
  oklabHue,
  oklabToLinear,
  srgbToLinear,
  XYZ_TO_SRGB,
} from '@/grading/color';
import {
  contrast,
  createMonotoneCurve,
  curve,
  exposure,
  fade,
  hsl,
  lutOp,
  monochrome,
  saturation,
  splitTone,
  whiteBalance,
  whiteBalanceMatrix,
  whiteBalanceSourceXY,
} from '@/grading/ops';
import { identityLut3D } from '@/lut';
import type { Vec3 } from '@/lut/types';
import { createLayer, HSL_BANDS } from '@/recipe/factory';
import type { Layer, LayerType } from '@/recipe/types';

type Params<T extends LayerType> = Extract<Layer, { type: T }>['params'];
const params = <T extends LayerType>(type: T): Params<T> =>
  (createLayer(type) as Extract<Layer, { type: T }>).params as Params<T>;

const expectVec = (actual: Vec3, expected: Vec3, digits = 6): void =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));

const oklch = (rgb: Vec3): { L: number; C: number; h: number } => {
  const [L, a, b] = linearToOklab([
    srgbToLinear(rgb[0]),
    srgbToLinear(rgb[1]),
    srgbToLinear(rgb[2]),
  ]);
  return { L, C: Math.hypot(a, b), h: oklabHue(a, b) };
};

describe('exposure (linear light)', () => {
  it('+1 EV doubles linear values', () => {
    const out = exposure([0.5, 0.25, 0.1], { ev: 1 });
    [0.5, 0.25, 0.1].forEach((v, i) =>
      expect(srgbToLinear(out[i] as number)).toBeCloseTo(2 * srgbToLinear(v), 6),
    );
  });

  it('has hand-computed values: 0.5 -> 0.6858361 at +1 EV, 0.3607802 at -1 EV', () => {
    expect(exposure([0.5, 0.5, 0.5], { ev: 1 })[0]).toBeCloseTo(0.6858361, 6);
    expect(exposure([0.5, 0.5, 0.5], { ev: -1 })[0]).toBeCloseTo(0.3607802, 6);
  });

  it('keeps black and does not clamp above 1', () => {
    expect(exposure([0, 0, 0], { ev: 3 })).toEqual([0, 0, 0]);
    expect(exposure([1, 1, 1], { ev: 1 })[0]).toBeGreaterThan(1);
  });
});

describe('whiteBalance (Bradford)', () => {
  it('is exactly neutral at (0, 0)', () => {
    expect(whiteBalance([0.2, 0.5, 0.9], { temperature: 0, tint: 0 })).toEqual([0.2, 0.5, 0.9]);
    const [x, y] = whiteBalanceSourceXY(0, 0);
    expect(x).toBeCloseTo(0.3127, 4); // D65
    expect(y).toBeCloseTo(0.329, 4);
  });

  it('maps the assumed illuminant to neutral: M * white(src) has equal channels', () => {
    for (const [t, tint] of [
      [60, 0],
      [-80, 0],
      [0, 70],
      [-30, -50],
    ] as const) {
      const [x, y] = whiteBalanceSourceXY(t, tint);
      const rgb = mulMat3(XYZ_TO_SRGB, [x / y, 1, (1 - x - y) / y]);
      const out = mulMat3(whiteBalanceMatrix(t, tint), rgb);
      expect(out[0] / out[1]).toBeCloseTo(1, 4);
      expect(out[2] / out[1]).toBeCloseTo(1, 4);
    }
  });

  it('warms with positive temperature, cools with negative', () => {
    const warm = whiteBalance([0.5, 0.5, 0.5], { temperature: 50, tint: 0 });
    const cool = whiteBalance([0.5, 0.5, 0.5], { temperature: -50, tint: 0 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
  });

  it('adds magenta with positive tint, green with negative', () => {
    const magenta = whiteBalance([0.5, 0.5, 0.5], { temperature: 0, tint: 60 });
    const green = whiteBalance([0.5, 0.5, 0.5], { temperature: 0, tint: -60 });
    expect(magenta[1]).toBeLessThan((magenta[0] + magenta[2]) / 2);
    expect(green[1]).toBeGreaterThan((green[0] + green[2]) / 2);
  });

  it('leaves black black', () => {
    expect(whiteBalance([0, 0, 0], { temperature: 100, tint: 100 })).toEqual([0, 0, 0]);
  });
});

describe('contrast', () => {
  it('fixes black, white and mid grey', () => {
    for (const amount of [-100, -40, 60, 100]) {
      expectVec(contrast([0, 0.5, 1], { amount }), [0, 0.5, 1]);
    }
  });

  it('has hand-computed values: smoothstep(0.25) = 0.15625', () => {
    expect(contrast([0.25, 0.25, 0.25], { amount: 100 })[0]).toBeCloseTo(0.15625, 12);
    expect(contrast([0.25, 0.25, 0.25], { amount: 50 })[0]).toBeCloseTo(0.203125, 12);
    expect(contrast([0.25, 0.25, 0.25], { amount: -100 })[0]).toBeCloseTo(0.34375, 12);
  });

  it('is monotone at both extremes and continuous outside [0,1]', () => {
    for (const amount of [-100, 100]) {
      let prev = -Infinity;
      for (let i = -50; i <= 150; i++) {
        const y = contrast([i / 100, 0, 0], { amount })[0];
        expect(y).toBeGreaterThanOrEqual(prev);
        prev = y;
      }
    }
    expect(contrast([1.5, 0, 0], { amount: -100 })[0]).toBeCloseTo(2, 12); // slope 2 beyond white
  });
});

describe('curve (monotone cubic)', () => {
  const P = (x: number, y: number) => ({ x, y });

  it('passes through its control points', () => {
    const f = createMonotoneCurve([P(0, 0.05), P(0.3, 0.2), P(0.7, 0.9), P(1, 1)]);
    expect(f(0)).toBeCloseTo(0.05, 12);
    expect(f(0.3)).toBeCloseTo(0.2, 12);
    expect(f(0.7)).toBeCloseTo(0.9, 12);
    expect(f(1)).toBeCloseTo(1, 12);
  });

  it('has a hand-computed midpoint: (0,0), (0.5,0.8), (1,1) at 0.25 is 0.4375', () => {
    // Fritsch-Carlson tangents m = [1.6, 1.0, 0.4]; Hermite at t = 0.5, h = 0.5.
    expect(createMonotoneCurve([P(0, 0), P(0.5, 0.8), P(1, 1)])(0.25)).toBeCloseTo(0.4375, 12);
  });

  it('never overshoots a steep monotone point set', () => {
    const f = createMonotoneCurve([P(0, 0), P(0.1, 0.9), P(0.2, 0.91), P(1, 1)]);
    let prev = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const y = f(i / 2000);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1 + 1e-12);
      prev = y;
    }
  });

  it('is flat across a plateau and sorts unsorted input', () => {
    const f = createMonotoneCurve([P(1, 1), P(0.4, 0.5), P(0, 0), P(0.6, 0.5)]);
    expect(f(0.5)).toBeCloseTo(0.5, 12);
  });

  it('applies master first, then the channel curve', () => {
    const p = params('curve');
    p.master = [P(0, 0), P(1, 0.5)]; // halves
    p.r = [P(0, 0.1), P(1, 1.1)]; // +0.1
    expectVec(curve([1, 1, 1], p), [0.6, 0.5, 0.5], 4);
  });

  it('extends linearly beyond the end points instead of clipping', () => {
    const p = params('curve');
    expectVec(curve([1.5, -0.25, 0.5], p), [1.5, -0.25, 0.5], 6);
  });
});

describe('hsl (OKLCH)', () => {
  const setAll = (patch: Partial<{ hue: number; sat: number; lum: number }>): Params<'hsl'> => {
    const p = params('hsl');
    for (const band of HSL_BANDS) Object.assign(p[band], patch);
    return p;
  };
  const samples: Vec3[] = [
    [0.8, 0.2, 0.2],
    [0.9, 0.6, 0.1],
    [0.9, 0.9, 0.2],
    [0.2, 0.7, 0.3],
    [0.1, 0.7, 0.8],
    [0.2, 0.3, 0.9],
    [0.5, 0.2, 0.8],
    [0.9, 0.2, 0.6],
  ];

  it('sat -100 on every band gives grey at unchanged OKLab lightness', () => {
    for (const rgb of samples) {
      const out = hsl(rgb, setAll({ sat: -100 }));
      expect(out[0]).toBeCloseTo(out[1], 5);
      expect(out[1]).toBeCloseTo(out[2], 5);
      expect(oklch(out).L).toBeCloseTo(oklch(rgb).L, 5);
    }
  });

  it('hue +100 on every band rotates OKLCH hue by 30 degrees, keeping L and C', () => {
    for (const rgb of samples) {
      const before = oklch(rgb);
      const after = oklch(hsl(rgb, setAll({ hue: 100 })));
      const dh = ((after.h - before.h + 540) % 360) - 180;
      expect(dh).toBeCloseTo(30, 1);
      expect(after.L).toBeCloseTo(before.L, 4);
      expect(after.C).toBeCloseTo(before.C, 4);
    }
  });

  it('only moves the targeted band: a red tweak leaves blue alone and affects red', () => {
    const p = params('hsl');
    p.red.sat = -100;
    const blue: Vec3 = [0.2, 0.3, 0.9];
    expectVec(hsl(blue, p), blue, 4);
    const red: Vec3 = [0.8, 0.2, 0.2];
    expect(oklch(hsl(red, p)).C).toBeLessThan(0.01); // red centre (29 deg) is nearly fully desaturated
  });

  it('blends bands smoothly: no jump across a band boundary', () => {
    const p = params('hsl');
    p.yellow.sat = 100;
    p.green.sat = -100;
    let prevC = -1;
    for (let h = 100; h <= 150; h += 0.25) {
      // Same L and C, sweeping hue across the yellow/green boundary.
      const a = 0.1 * Math.cos((h * Math.PI) / 180);
      const b = 0.1 * Math.sin((h * Math.PI) / 180);
      const lin = oklabToRgb(0.7, a, b);
      const c = oklch(hsl(lin, p)).C;
      if (prevC >= 0) expect(Math.abs(c - prevC)).toBeLessThan(0.01);
      prevC = c;
    }
  });

  it('luminance shift fades out for greys (no hue to key on)', () => {
    const p = params('hsl');
    for (const band of HSL_BANDS) p[band].lum = 100;
    expectVec(hsl([0.5, 0.5, 0.5], p), [0.5, 0.5, 0.5], 6);
    expect(oklch(hsl([0.8, 0.2, 0.2], p)).L).toBeCloseTo(oklch([0.8, 0.2, 0.2]).L + 0.2, 3);
  });
});

function oklabToRgb(L: number, a: number, b: number): Vec3 {
  const lin = oklabToLinear([L, a, b]);
  return [linearToSrgbExact(lin[0]), linearToSrgbExact(lin[1]), linearToSrgbExact(lin[2])];
}

describe('saturation / vibrance (OKLCH)', () => {
  it('saturation -100 is grey with unchanged lightness', () => {
    const rgb: Vec3 = [0.8, 0.3, 0.2];
    const out = saturation(rgb, { saturation: -100, vibrance: 0 });
    expect(out[0]).toBeCloseTo(out[1], 5);
    expect(out[1]).toBeCloseTo(out[2], 5);
    expect(oklch(out).L).toBeCloseTo(oklch(rgb).L, 5);
  });

  it('saturation +100 doubles chroma and keeps hue and lightness', () => {
    const rgb: Vec3 = [0.55, 0.45, 0.4];
    const before = oklch(rgb);
    const after = oklch(saturation(rgb, { saturation: 100, vibrance: 0 }));
    expect(after.C).toBeCloseTo(2 * before.C, 4);
    expect(after.h).toBeCloseTo(before.h, 3);
    expect(after.L).toBeCloseTo(before.L, 4);
  });

  it('vibrance boosts muted colours proportionally more than vivid ones', () => {
    const muted: Vec3 = [0.5, 0.45, 0.6];
    const vivid: Vec3 = [0.2, 0.3, 0.95];
    const gain = (rgb: Vec3): number =>
      oklch(saturation(rgb, { saturation: 0, vibrance: 100 })).C / oklch(rgb).C;
    expect(gain(muted)).toBeGreaterThan(gain(vivid));
    expect(gain(vivid)).toBeGreaterThanOrEqual(1);
  });

  it('negative vibrance mutes vivid colours more than muted ones', () => {
    const muted: Vec3 = [0.5, 0.45, 0.6];
    const vivid: Vec3 = [0.2, 0.3, 0.95];
    const gain = (rgb: Vec3): number =>
      oklch(saturation(rgb, { saturation: 0, vibrance: -100 })).C / oklch(rgb).C;
    expect(gain(vivid)).toBeLessThan(gain(muted));
  });

  it('protects skin hues lightly: same chroma, less vibrance gain at 50 degrees than at 200', () => {
    const at = (h: number): Vec3 =>
      oklabToRgb(0.7, 0.06 * Math.cos((h * Math.PI) / 180), 0.06 * Math.sin((h * Math.PI) / 180));
    const gain = (rgb: Vec3): number =>
      oklch(saturation(rgb, { saturation: 0, vibrance: 100 })).C / oklch(rgb).C;
    const skin = gain(at(50));
    const other = gain(at(200));
    expect(skin).toBeLessThan(other);
    expect(skin).toBeGreaterThan(1 + 0.6 * (other - 1)); // "lightly": a minor fraction of the boost
  });

  it('leaves greys alone', () => {
    expectVec(saturation([0.4, 0.4, 0.4], { saturation: 100, vibrance: 100 }), [0.4, 0.4, 0.4], 6);
  });
});

describe('splitTone', () => {
  it('tints pure black red by the documented offset (0.25 * (c - luma(c)))', () => {
    const p = { shadowHue: 0, shadowSat: 100, highlightHue: 0, highlightSat: 0, balance: 0 };
    const out = splitTone([0, 0, 0], p);
    expectVec(out, [0.25 * (1 - 0.2126), -0.25 * 0.2126, -0.25 * 0.2126], 9);
  });

  it('tints highlights, not shadows, with the highlight hue', () => {
    const p = { shadowHue: 0, shadowSat: 0, highlightHue: 240, highlightSat: 100, balance: 0 };
    expect(splitTone([0, 0, 0], p)).toEqual([0, 0, 0]);
    const out = splitTone([1, 1, 1], p);
    expect(out[2]).toBeGreaterThan(out[0]);
  });

  it('never changes luma', () => {
    const p = { shadowHue: 200, shadowSat: 80, highlightHue: 30, highlightSat: 60, balance: 25 };
    for (const rgb of [
      [0.1, 0.2, 0.3],
      [0.5, 0.5, 0.5],
      [0.9, 0.8, 0.7],
    ] as Vec3[]) {
      const out = splitTone(rgb, p);
      const y = (v: Vec3): number => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      expect(y(out)).toBeCloseTo(y(rgb), 9);
    }
  });

  it('balance moves the crossover: +100 makes mid grey fully highlight-toned', () => {
    const base = { shadowHue: 0, shadowSat: 100, highlightHue: 240, highlightSat: 100 };
    const hi = splitTone([0.5, 0.5, 0.5], { ...base, balance: 100 });
    const lo = splitTone([0.5, 0.5, 0.5], { ...base, balance: -100 });
    expect(hi[2]).toBeGreaterThan(hi[0]); // blue-ish
    expect(lo[0]).toBeGreaterThan(lo[2]); // red-ish
    // balance 0: mid grey blends the shadow and highlight offsets 50/50
    const mid = splitTone([0.5, 0.5, 0.5], { ...base, balance: 0 });
    expectVec(
      mid,
      [
        0.5 + 0.125 * (0.7874 - 0.0722),
        0.5 + 0.125 * (-0.2126 - 0.0722),
        0.5 + 0.125 * (-0.2126 + 0.9278),
      ],
      9,
    );
  });
});

describe('fade', () => {
  it('lifts black to 0.2 at 100 and keeps white', () => {
    expectVec(fade([0, 0, 0], { amount: 100 }), [0.2, 0.2, 0.2], 12);
    expectVec(fade([1, 1, 1], { amount: 100 }), [1, 1, 1], 12);
  });

  it('is linear in between: 50 lifts black to 0.1 and 0.5 to 0.55', () => {
    expect(fade([0, 0, 0], { amount: 50 })[0]).toBeCloseTo(0.1, 12);
    expect(fade([0.5, 0.5, 0.5], { amount: 50 })[0]).toBeCloseTo(0.55, 12);
  });
});

describe('monochrome', () => {
  it('outputs equal channels with the documented mix (default 30/59/11)', () => {
    const p = params('monochrome');
    const out = monochrome([1, 0.5, 0], p);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(out[0]).toBeCloseTo(0.3 + 0.295, 12);
    expect(monochrome([1, 0, 0], { red: 100, green: 0, blue: 0 })).toEqual([1, 1, 1]);
  });

  it('does not normalise weights and allows negative ones', () => {
    expect(monochrome([0.5, 0.5, 0.5], { red: 200, green: 0, blue: 0 })[0]).toBeCloseTo(1, 12);
    expect(monochrome([0.2, 0.5, 0.5], { red: -100, green: 100, blue: 0 })[0]).toBeCloseTo(0.3, 12);
  });
});

describe('lut op', () => {
  it('samples the LUT trilinearly', () => {
    expectVec(lutOp([0.3, 0.6, 0.9], identityLut3D(17)), [0.3, 0.6, 0.9], 6);
  });
});
