import { describe, expect, it } from 'vitest';
import {
  composeShaper,
  identityLut3D,
  lut1dTo3d,
  parseCube,
  resampleLut3D,
  sampleLut1D,
  sampleLut3D,
} from '@/lut';
import type { Lut1D, Lut3D, Vec3 } from '@/lut';
import { fixture } from './fixtures';

function close(a: Vec3, b: Vec3, tol = 1e-6): void {
  for (let c = 0; c < 3; c++)
    expect(Math.abs((a[c] as number) - (b[c] as number))).toBeLessThanOrEqual(tol);
}

/** Non-linear-in-each-axis, trilinear-exact reference: f(r,g,b) is linear per axis (separable product). */
function trilinearFn([r, g, b]: Vec3): Vec3 {
  return [0.2 + 0.5 * r + 0.1 * g * b, 0.1 + 0.3 * g + 0.4 * r * b, 0.05 + 0.6 * b + 0.2 * r * g];
}

function fnLut(size: number, domainMin: Vec3 = [0, 0, 0], domainMax: Vec3 = [1, 1, 1]): Lut3D {
  const data = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const rgb: Vec3 = [
          domainMin[0] + (r / (size - 1)) * (domainMax[0] - domainMin[0]),
          domainMin[1] + (g / (size - 1)) * (domainMax[1] - domainMin[1]),
          domainMin[2] + (b / (size - 1)) * (domainMax[2] - domainMin[2]),
        ];
        const out = trilinearFn(rgb);
        data[i++] = out[0];
        data[i++] = out[1];
        data[i++] = out[2];
      }
  return { size, domainMin, domainMax, data };
}

describe('identityLut3D', () => {
  it('has the contract layout', () => {
    const lut = identityLut3D(3);
    expect(lut.size).toBe(3);
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
    expect(lut.data.length).toBe(81);
    // red fastest: second triplet is r = 0.5
    expect(Array.from(lut.data.slice(3, 6))).toEqual([0.5, 0, 0]);
    expect(Array.from(lut.data.slice(9, 12))).toEqual([0, 0.5, 0]);
    expect(Array.from(lut.data.slice(27, 30))).toEqual([0, 0, 0.5]);
  });

  it.each([0, 1, 2.5, NaN])('rejects size %s', (size) => {
    expect(() => identityLut3D(size)).toThrow(RangeError);
  });
});

describe('sampleLut3D', () => {
  it('returns the input on an identity LUT', () => {
    for (const size of [2, 3, 17, 33]) {
      const lut = identityLut3D(size);
      for (const rgb of [
        [0, 0, 0],
        [1, 1, 1],
        [0.1, 0.5, 0.9],
        [0.333, 0.777, 0.012],
        [1, 0, 0.5],
      ] as Vec3[]) {
        close(sampleLut3D(lut, rgb), rgb);
      }
    }
  });

  it('returns exact table values on grid points', () => {
    const size = 5;
    const lut = fnLut(size);
    for (let b = 0; b < size; b++)
      for (let g = 0; g < size; g++)
        for (let r = 0; r < size; r++) {
          const i = ((b * size + g) * size + r) * 3;
          const out = sampleLut3D(lut, [r / (size - 1), g / (size - 1), b / (size - 1)]);
          close(
            out,
            [lut.data[i] as number, lut.data[i + 1] as number, lut.data[i + 2] as number],
            1e-6,
          );
        }
  });

  it('interpolates trilinearly between grid points', () => {
    const lut = fnLut(2);
    // With 2 nodes per axis, the trilinear interpolant reproduces a multilinear function exactly.
    for (const rgb of [
      [0.3, 0.6, 0.2],
      [0.9, 0.1, 0.5],
      [0.5, 0.5, 0.5],
    ] as Vec3[]) {
      close(sampleLut3D(lut, rgb), trilinearFn(rgb), 1e-6);
    }
  });

  it('interpolates a non-uniform LUT between nodes', () => {
    const lut = identityLut3D(2);
    lut.data.fill(0);
    lut.data[0] = 1; // corner (0,0,0) red channel
    close(sampleLut3D(lut, [0.25, 0.5, 0.5]), [0.75 * 0.5 * 0.5, 0, 0]);
  });

  it('clamps out-of-domain and NaN inputs', () => {
    const lut = fnLut(4);
    close(sampleLut3D(lut, [-1, -2, -3]), sampleLut3D(lut, [0, 0, 0]));
    close(sampleLut3D(lut, [2, 9, 1.5]), sampleLut3D(lut, [1, 1, 1]));
    close(sampleLut3D(lut, [NaN, 0.5, 0.5]), sampleLut3D(lut, [0, 0.5, 0.5]));
  });

  it('honours a custom domain', () => {
    const min: Vec3 = [-0.25, -0.5, 0];
    const max: Vec3 = [1.5, 2, 4];
    const lut = fnLut(2, min, max);
    // the function above is multilinear in (r, g, b) so a 2^3 table is exact over any domain
    for (const rgb of [
      [0, 0, 1],
      [1, 1, 2],
      [-0.25, -0.5, 0],
      [1.5, 2, 4],
    ] as Vec3[]) {
      close(sampleLut3D(lut, rgb), trilinearFn(rgb), 1e-5);
    }
  });
});

describe('sampleLut1D', () => {
  const lut: Lut1D = {
    size: 3,
    domainMin: [0, 0, -1],
    domainMax: [1, 2, 1],
    data: new Float32Array([0, 0, 0, 0.5, 1, 1, 1, 4, 10]),
  };

  it('interpolates per channel with per-channel domains', () => {
    close(sampleLut1D(lut, [0.25, 0.5, 0]), [0.25, 0.5, 1]);
    close(sampleLut1D(lut, [1, 2, 1]), [1, 4, 10]);
    close(sampleLut1D(lut, [0, 0, -1]), [0, 0, 0]);
  });

  it('clamps outside the domain', () => {
    close(sampleLut1D(lut, [-5, 99, 99]), [0, 4, 10]);
  });
});

describe('resampleLut3D', () => {
  it('is lossless for an identity LUT', () => {
    const out = resampleLut3D(identityLut3D(17), 33);
    expect(out.size).toBe(33);
    const ref = identityLut3D(33);
    for (let i = 0; i < ref.data.length; i++) {
      expect(Math.abs((out.data[i] as number) - (ref.data[i] as number))).toBeLessThan(1e-6);
    }
  });

  it('keeps grid-point values when resampling to the same size', () => {
    const lut = fnLut(5);
    const out = resampleLut3D(lut, 5);
    for (let i = 0; i < lut.data.length; i++) {
      expect(Math.abs((out.data[i] as number) - (lut.data[i] as number))).toBeLessThan(1e-6);
    }
    expect(out.data).not.toBe(lut.data);
  });

  it('keeps domain and title, and does not alias the domain arrays', () => {
    const lut = { ...fnLut(3, [-1, -1, -1], [2, 2, 2]), title: 't' };
    const out = resampleLut3D(lut, 4);
    expect(out.domainMin).toEqual([-1, -1, -1]);
    expect(out.domainMax).toEqual([2, 2, 2]);
    expect(out.title).toBe('t');
    expect(out.domainMin).not.toBe(lut.domainMin);
    close(sampleLut3D(out, [0.3, 0.9, 1.1]), sampleLut3D(lut, [0.3, 0.9, 1.1]), 1e-5);
  });

  it('omits title when the source has none, and rejects bad sizes', () => {
    expect(resampleLut3D(identityLut3D(2), 3).title).toBeUndefined();
    expect(() => resampleLut3D(identityLut3D(2), 1)).toThrow(RangeError);
  });
});

describe('lut1dTo3d', () => {
  it('expands a 1D LUT to a per-channel 3D LUT', () => {
    const { lut1d } = parseCube(fixture('gamma-1d.cube'));
    const lut3d = lut1dTo3d(lut1d as Lut1D, 17);
    expect(lut3d.size).toBe(17);
    expect(lut3d.title).toBe('gamma 1D');
    // On nodes shared by both grids (multiples of 4 of 16 steps) the result is exact.
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      close(sampleLut3D(lut3d, [x, x, x]), [x * x, x, Math.sqrt(x)], 1e-6);
    }
    // Channels are independent.
    close(sampleLut3D(lut3d, [1, 0, 0.25]), [1, 0, 0.5], 1e-6);
  });

  it('defaults to 33 and keeps the 1D domain', () => {
    const lut1d: Lut1D = {
      size: 2,
      domainMin: [-1, -1, -1],
      domainMax: [3, 3, 3],
      data: new Float32Array([0, 0, 0, 1, 1, 1]),
    };
    const out = lut1dTo3d(lut1d);
    expect(out.size).toBe(33);
    expect(out.domainMin).toEqual([-1, -1, -1]);
    expect(out.domainMax).toEqual([3, 3, 3]);
    expect(out.title).toBeUndefined();
    close(sampleLut3D(out, [1, 3, -1]), [0.5, 1, 0], 1e-6);
  });
});

describe('composeShaper', () => {
  it('bakes shaper + 3D into one 3D LUT', () => {
    const { lut1d, lut3d } = parseCube(fixture('shaper-1d-3d.cube'));
    const composed = composeShaper(lut1d as Lut1D, lut3d as Lut3D);
    expect(composed.size).toBe(2);
    expect(composed.domainMin).toEqual([-0.5, -0.5, -0.5]);
    expect(composed.domainMax).toEqual([1.5, 1.5, 1.5]);
    expect(composed.title).toBe('shaper + 3D');
    // Shaper maps [-0.5, 1.5] -> [0, 1] linearly, so corners match the 3D LUT corners exactly.
    close(sampleLut3D(composed, [-0.5, -0.5, -0.5]), [0.05, 0.1, 0.15], 1e-6);
    close(sampleLut3D(composed, [1.5, 1.5, 1.5]), [0.95, 0.9, 0.85], 1e-6);
    close(sampleLut3D(composed, [1.5, -0.5, 0.5]), sampleLut3D(lut3d as Lut3D, [1, 0, 0.5]), 1e-6);
  });

  it('matches sequential application at a finer grid', () => {
    const lut1d: Lut1D = {
      size: 5,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array([0, 0, 0, 0.1, 0.2, 0.3, 0.5, 0.5, 0.5, 0.9, 0.8, 0.7, 1, 1, 1]),
    };
    const lut3d = fnLut(2);
    const composed = composeShaper(lut1d, lut3d, 5);
    expect(composed.size).toBe(5);
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      close(
        sampleLut3D(composed, [x, x, x]),
        sampleLut3D(lut3d, sampleLut1D(lut1d, [x, x, x])),
        1e-6,
      );
    }
  });

  it('prefers the 3D title, falling back to the 1D title', () => {
    const lut1d: Lut1D = {
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array(6),
      title: 'one',
    };
    expect(composeShaper(lut1d, identityLut3D(2)).title).toBe('one');
    expect(composeShaper(lut1d, { ...identityLut3D(2), title: 'three' }).title).toBe('three');
    expect(composeShaper({ ...lut1d, title: undefined }, identityLut3D(2)).title).toBeUndefined();
  });
});
