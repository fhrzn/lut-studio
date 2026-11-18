import { describe, expect, it } from 'vitest';
import {
  linearToOklab,
  linearToSrgb,
  linearToSrgbExact,
  oklabHue,
  oklabToLinear,
  srgbToLinear,
  srgbToLinearExact,
} from '@/grading/color';

describe('sRGB transfer (table-accelerated)', () => {
  it('matches the exact formulas within 1e-6 over [0,1]', () => {
    let worst = 0;
    for (let i = 0; i <= 20000; i++) {
      const x = i / 20000;
      worst = Math.max(worst, Math.abs(srgbToLinear(x) - srgbToLinearExact(x)));
      worst = Math.max(worst, Math.abs(linearToSrgb(x) - linearToSrgbExact(x)));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('has the documented anchor values', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140411, 6); // ((0.5 + 0.055) / 1.055)^2.4
    expect(linearToSrgb(0.2140411)).toBeCloseTo(0.5, 6);
  });

  it('is odd and exact outside [0,1], so unclamped values survive a round trip', () => {
    for (const x of [-0.5, -0.01, 1.5, 4]) {
      expect(linearToSrgb(srgbToLinear(x))).toBeCloseTo(x, 9);
    }
    expect(srgbToLinear(-0.3)).toBe(-srgbToLinear(0.3));
  });
});

describe('OKLab', () => {
  it('maps white to L=1 with no chroma and red to the published values', () => {
    const [L, a, b] = linearToOklab([1, 1, 1]);
    expect(L).toBeCloseTo(1, 6);
    expect(Math.abs(a)).toBeLessThan(1e-6);
    expect(Math.abs(b)).toBeLessThan(1e-6);
    const red = linearToOklab([1, 0, 0]);
    expect(red[0]).toBeCloseTo(0.62796, 4);
    expect(red[1]).toBeCloseTo(0.22486, 4);
    expect(red[2]).toBeCloseTo(0.12585, 4);
    expect(oklabHue(red[1], red[2])).toBeCloseTo(29.23, 1);
  });

  it('round-trips, including out-of-gamut values', () => {
    for (const rgb of [
      [0.2, 0.5, 0.8],
      [1.4, -0.1, 0.3],
      [0, 0, 0],
    ] as const) {
      const back = oklabToLinear(linearToOklab([...rgb]));
      rgb.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 6));
    }
  });
});
