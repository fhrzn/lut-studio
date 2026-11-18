import { mulMat3, mulMat3Mat3, SRGB_TO_XYZ, XYZ_TO_SRGB, type Mat3 } from '../color';
import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/** Bradford cone response matrix (XYZ to LMS) and its inverse. */
const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const BRADFORD_INV: Mat3 = [
  0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912, -0.0085287, 0.0400428,
  0.9684867,
];

const D65_CCT = 6504;
/** D65 as implied by the sRGB matrix (linear white = 1,1,1), so (0,0) is exactly neutral. */
const D65_XYZ = mulMat3(SRGB_TO_XYZ, [1, 1, 1]);
const D65_XY: readonly [number, number] = [
  D65_XYZ[0] / (D65_XYZ[0] + D65_XYZ[1] + D65_XYZ[2]),
  D65_XYZ[1] / (D65_XYZ[0] + D65_XYZ[1] + D65_XYZ[2]),
];
/** Slider +-100 moves the assumed scene illuminant by this many mired (1e6 / CCT). */
export const WB_MIRED_RANGE = 60;
/** Slider +-100 moves the assumed illuminant off the locus by this much in CIE 1960 v. */
export const WB_TINT_DUV = 0.02;

/** CIE daylight locus chromaticity for a CCT in 4000..25000 K (Kim et al. cubic fit). */
function daylightXY(cct: number): [number, number] {
  const t = cct;
  const x =
    t <= 7000
      ? -4.607e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
      : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.23704;
  return [x, -3 * x * x + 2.87 * x - 0.275];
}

const xyToXYZ = (x: number, y: number): Vec3 => [x / y, 1, (1 - x - y) / y];

/**
 * Chromaticity of the illuminant the slider says the scene was lit by. Positive temperature =
 * bluer assumed illuminant (the image is warmed when adapted to D65); positive tint = greener
 * assumed illuminant (the image gets more magenta). Exactly D65 at (0, 0).
 */
export function whiteBalanceSourceXY(temperature: number, tint: number): [number, number] {
  const mired = 1e6 / D65_CCT - (temperature / 100) * WB_MIRED_RANGE;
  const [dx, dy] = daylightXY(1e6 / mired);
  const [rx, ry] = daylightXY(D65_CCT);
  const x = D65_XY[0] + dx - rx;
  const y = D65_XY[1] + dy - ry;
  // Tint: shift along the normal of the (near-horizontal around D65) locus in CIE 1960 uv.
  const denom = -2 * x + 12 * y + 3;
  const u = (4 * x) / denom;
  const v = (6 * y) / denom + (tint / 100) * WB_TINT_DUV;
  const d = 2 * u - 8 * v + 4;
  return [(3 * u) / d, (2 * v) / d];
}

/**
 * Linear-sRGB matrix that adapts from the slider's assumed illuminant to D65: Bradford von Kries
 * scaling of the cone responses, M = XYZ->RGB * B^-1 * diag(LMS_d65 / LMS_src) * B * RGB->XYZ.
 */
export function whiteBalanceMatrix(temperature: number, tint: number): Mat3 {
  const [sx, sy] = whiteBalanceSourceXY(temperature, tint);
  const src = mulMat3(BRADFORD, xyToXYZ(sx, sy));
  const dst = mulMat3(BRADFORD, xyToXYZ(D65_XY[0], D65_XY[1]));
  const k: Mat3 = [dst[0] / src[0], 0, 0, 0, dst[1] / src[1], 0, 0, 0, dst[2] / src[2]];
  return mulMat3Mat3(
    XYZ_TO_SRGB,
    mulMat3Mat3(BRADFORD_INV, mulMat3Mat3(k, mulMat3Mat3(BRADFORD, SRGB_TO_XYZ))),
  );
}

export function prepareWhiteBalance(params: ParamsOf<'whiteBalance'>): PreparedOp | null {
  if (params.temperature === 0 && params.tint === 0) return null;
  const m = whiteBalanceMatrix(params.temperature, params.tint);
  return { space: 'linear', fn: (v) => mulMat3(m, v) };
}

export const whiteBalance = (rgb: Vec3, params: ParamsOf<'whiteBalance'>): Vec3 =>
  runOp(prepareWhiteBalance(params), rgb);
