import type { Lut1D, Lut3D, Vec3 } from './types';

function checkSize(size: number): void {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`LUT size must be an integer >= 2, got ${size}`);
  }
}

/** Maps v from [min, max] to [0, 1]; NaN becomes 0. */
function normalize(v: number, min: number, max: number): number {
  const t = (v - min) / (max - min);
  return t > 0 ? (t < 1 ? t : 1) : 0;
}

/** Identity 3D LUT over [0, 1]^3. */
export function identityLut3D(size: number): Lut3D {
  checkSize(size);
  const data = new Float32Array(size * size * size * 3);
  const step = size - 1;
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        data[i++] = r / step;
        data[i++] = g / step;
        data[i++] = b / step;
      }
  return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

/** Trilinear lookup. Inputs outside the LUT domain are clamped to it. */
export function sampleLut3D(lut: Lut3D, rgb: Vec3): Vec3 {
  const { size, data, domainMin, domainMax } = lut;
  const max = size - 1;
  const fx = normalize(rgb[0], domainMin[0], domainMax[0]) * max;
  const fy = normalize(rgb[1], domainMin[1], domainMax[1]) * max;
  const fz = normalize(rgb[2], domainMin[2], domainMax[2]) * max;
  // Clamp the base cell so that +1 stays in range when the input sits on the upper edge.
  const x0 = Math.min(Math.floor(fx), max - 1);
  const y0 = Math.min(Math.floor(fy), max - 1);
  const z0 = Math.min(Math.floor(fz), max - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;

  const strideY = size * 3;
  const strideZ = size * size * 3;
  const base = z0 * strideZ + y0 * strideY + x0 * 3;
  const out: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const i = base + c;
    const c000 = data[i] as number;
    const c100 = data[i + 3] as number;
    const c010 = data[i + strideY] as number;
    const c110 = data[i + strideY + 3] as number;
    const c001 = data[i + strideZ] as number;
    const c101 = data[i + strideZ + 3] as number;
    const c011 = data[i + strideZ + strideY] as number;
    const c111 = data[i + strideZ + strideY + 3] as number;
    const c00 = c000 + (c100 - c000) * tx;
    const c10 = c010 + (c110 - c010) * tx;
    const c01 = c001 + (c101 - c001) * tx;
    const c11 = c011 + (c111 - c011) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    const c1 = c01 + (c11 - c01) * ty;
    out[c] = c0 + (c1 - c0) * tz;
  }
  return out;
}

/** Per-channel linear lookup. Inputs outside the LUT domain are clamped to it. */
export function sampleLut1D(lut: Lut1D, rgb: Vec3): Vec3 {
  const { size, data, domainMin, domainMax } = lut;
  const max = size - 1;
  const out: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const f = normalize(rgb[c] as number, domainMin[c] as number, domainMax[c] as number) * max;
    const i0 = Math.min(Math.floor(f), max - 1);
    const t = f - i0;
    const a = data[i0 * 3 + c] as number;
    const b = data[(i0 + 1) * 3 + c] as number;
    out[c] = a + (b - a) * t;
  }
  return out;
}

/** Evaluates `fn` on a uniform size^3 grid spanning `domain` (red index fastest). */
function buildLut3D(
  size: number,
  domainMin: Vec3,
  domainMax: Vec3,
  fn: (rgb: Vec3) => Vec3,
): Lut3D {
  checkSize(size);
  const data = new Float32Array(size * size * size * 3);
  const step = size - 1;
  const rgb: Vec3 = [0, 0, 0];
  let i = 0;
  for (let b = 0; b < size; b++) {
    rgb[2] = domainMin[2] + (b / step) * (domainMax[2] - domainMin[2]);
    for (let g = 0; g < size; g++) {
      rgb[1] = domainMin[1] + (g / step) * (domainMax[1] - domainMin[1]);
      for (let r = 0; r < size; r++) {
        rgb[0] = domainMin[0] + (r / step) * (domainMax[0] - domainMin[0]);
        const [or, og, ob] = fn(rgb);
        data[i++] = or;
        data[i++] = og;
        data[i++] = ob;
      }
    }
  }
  return { size, domainMin: [...domainMin], domainMax: [...domainMax], data };
}

/** Resamples a 3D LUT onto a new grid size, keeping its domain and title. */
export function resampleLut3D(lut: Lut3D, size: number): Lut3D {
  const out = buildLut3D(size, lut.domainMin, lut.domainMax, (rgb) => sampleLut3D(lut, rgb));
  if (lut.title !== undefined) out.title = lut.title;
  return out;
}

/** Expands a 1D LUT into an equivalent per-channel 3D LUT over the 1D domain. */
export function lut1dTo3d(lut: Lut1D, size = 33): Lut3D {
  const out = buildLut3D(size, lut.domainMin, lut.domainMax, (rgb) => sampleLut1D(lut, rgb));
  if (lut.title !== undefined) out.title = lut.title;
  return out;
}

/**
 * Applies a 1D shaper before a 3D LUT and bakes the pair into one 3D LUT.
 * The result spans the shaper's input domain; `size` defaults to the 3D LUT's size.
 */
export function composeShaper(lut1d: Lut1D, lut3d: Lut3D, size = lut3d.size): Lut3D {
  const out = buildLut3D(size, lut1d.domainMin, lut1d.domainMax, (rgb) =>
    sampleLut3D(lut3d, sampleLut1D(lut1d, rgb)),
  );
  const title = lut3d.title ?? lut1d.title;
  if (title !== undefined) out.title = title;
  return out;
}
