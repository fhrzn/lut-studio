import type { Vec3 } from '@/lut/types';

/** Linear 3x3 matrix, row-major. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Exact sRGB decode of a non-negative value (IEC 61966-2-1). */
export function srgbToLinearExact(a: number): number {
  return a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
}

/** Exact sRGB encode of a non-negative value. */
export function linearToSrgbExact(a: number): number {
  return a <= 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
}

// The bake calls the transfer functions ~100k times per op, and Math.pow dominates. Inside [0,1]
// both are interpolated from tables (max error ~1e-7); outside it falls back to the exact form.
const TABLE_SIZE = 4096;
const DECODE_TABLE = new Float64Array(TABLE_SIZE + 1);
/** Encode table is indexed by sqrt(linear): encode() is far smoother in sqrt space near black. */
const ENCODE_TABLE = new Float64Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) {
  const t = i / TABLE_SIZE;
  DECODE_TABLE[i] = srgbToLinearExact(t);
  ENCODE_TABLE[i] = linearToSrgbExact(t * t);
}

/**
 * sRGB transfer functions. Mirrored around 0 so values outside [0,1] survive a decode/encode
 * round trip: intermediate results are never clamped, only the final bake output.
 */
export function srgbToLinear(v: number): number {
  const a = v < 0 ? -v : v;
  let lin: number;
  if (a <= 1) {
    const pos = a * TABLE_SIZE;
    const i = pos < TABLE_SIZE ? pos | 0 : TABLE_SIZE - 1;
    const lo = DECODE_TABLE[i] as number;
    lin = lo + ((DECODE_TABLE[i + 1] as number) - lo) * (pos - i);
  } else {
    lin = srgbToLinearExact(a);
  }
  return v < 0 ? -lin : lin;
}

export function linearToSrgb(v: number): number {
  const a = v < 0 ? -v : v;
  let enc: number;
  if (a <= 0.0031308) {
    enc = a * 12.92;
  } else if (a <= 1) {
    const pos = Math.sqrt(a) * TABLE_SIZE;
    const i = pos < TABLE_SIZE ? pos | 0 : TABLE_SIZE - 1;
    const lo = ENCODE_TABLE[i] as number;
    enc = lo + ((ENCODE_TABLE[i + 1] as number) - lo) * (pos - i);
  } else {
    enc = linearToSrgbExact(a);
  }
  return v < 0 ? -enc : enc;
}

export function mulMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    (m[0] as number) * v[0] + (m[1] as number) * v[1] + (m[2] as number) * v[2],
    (m[3] as number) * v[0] + (m[4] as number) * v[1] + (m[5] as number) * v[2],
    (m[6] as number) * v[0] + (m[7] as number) * v[1] + (m[8] as number) * v[2],
  ];
}

export function mulMat3Mat3(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out.push(
        (a[r * 3] as number) * (b[c] as number) +
          (a[r * 3 + 1] as number) * (b[3 + c] as number) +
          (a[r * 3 + 2] as number) * (b[6 + c] as number),
      );
  return out as unknown as Mat3;
}

/** Linear sRGB (D65) to CIE XYZ. */
export const SRGB_TO_XYZ: Mat3 = [
  0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041,
];
export const XYZ_TO_SRGB: Mat3 = [
  3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259,
  1.0572252,
];

/** Rec. 709 / sRGB luma weights. They sum to 1, so a zero-sum offset never changes luma. */
export const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];

export const luma = (rgb: Vec3): number => LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];

/**
 * Linear sRGB to OKLab (Ottosson, 2020). Returns [L, a, b]; L in [0,1] for in-gamut input.
 * `Math.cbrt` keeps the function odd, so out-of-gamut negatives are handled.
 */
export function linearToOklab(rgb: Vec3): Vec3 {
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear(lab: Vec3): Vec3 {
  const [L, a, b] = lab;
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

export const DEG = Math.PI / 180;

/** Hue in degrees [0, 360) of an OKLab (a, b) pair. */
export function oklabHue(a: number, b: number): number {
  const h = Math.atan2(b, a) / DEG;
  return h < 0 ? h + 360 : h;
}

/** Hue (degrees) at full saturation, mid lightness, as sRGB-encoded RGB (standard HSL wheel). */
export function hueToRgb(hue: number): Vec3 {
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

/** sRGB-encoded to OKLab (decode, then linearToOklab). */
export function encodedToOklab(rgb: Vec3): Vec3 {
  return linearToOklab([srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])]);
}

export function oklabToEncoded(lab: Vec3): Vec3 {
  const lin = oklabToLinear(lab);
  return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}
