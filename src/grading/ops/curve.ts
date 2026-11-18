import type { CurvePoint } from '@/recipe/types';
import { runOp, type ParamsOf, type PreparedOp } from './types';
import type { Vec3 } from '@/lut/types';

/**
 * Monotone cubic Hermite interpolation (Fritsch-Carlson, 1980) through the points: tangents are
 * limited so a monotone point set never overshoots. Outside the first/last point the curve
 * continues linearly with the end tangent, so values outside [0,1] are not clipped.
 */
export function createMonotoneCurve(points: readonly CurvePoint[]): (x: number) => number {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const pts = sorted.filter(
    (p, i) => i === sorted.length - 1 || p.x !== (sorted[i + 1] as CurvePoint).x,
  );
  const n = pts.length;
  if (n < 2) return (x) => x;

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push((xs[i + 1] as number) - (xs[i] as number));
    d.push(((ys[i + 1] as number) - (ys[i] as number)) / (h[i] as number));
  }

  const m: number[] = new Array<number>(n);
  m[0] = d[0] as number;
  m[n - 1] = d[n - 2] as number;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1] as number;
    const b = d[i] as number;
    m[i] = a * b > 0 ? (a + b) / 2 : 0;
  }
  for (let i = 0; i < n - 1; i++) {
    const di = d[i] as number;
    if (di === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = (m[i] as number) / di;
    const beta = (m[i + 1] as number) / di;
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * di;
      m[i + 1] = tau * beta * di;
    }
  }

  const x0 = xs[0] as number;
  const xn = xs[n - 1] as number;
  return (x) => {
    if (x <= x0) return (ys[0] as number) + (m[0] as number) * (x - x0);
    if (x >= xn) return (ys[n - 1] as number) + (m[n - 1] as number) * (x - xn);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((xs[mid] as number) <= x) lo = mid;
      else hi = mid;
    }
    const hk = h[lo] as number;
    const t = (x - (xs[lo] as number)) / hk;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[lo] as number) +
      (t3 - 2 * t2 + t) * hk * (m[lo] as number) +
      (-2 * t3 + 3 * t2) * (ys[lo + 1] as number) +
      (t3 - t2) * hk * (m[lo + 1] as number)
    );
  };
}

const CURVE_TABLE = 4096;

/** Samples `f` on [0,1] and interpolates (error ~1e-7 for these smooth curves); exact outside. */
function tabulate(f: (x: number) => number): (x: number) => number {
  const table = new Float64Array(CURVE_TABLE + 1);
  for (let i = 0; i <= CURVE_TABLE; i++) table[i] = f(i / CURVE_TABLE);
  return (x) => {
    if (!(x >= 0 && x <= 1)) return f(x);
    const pos = x * CURVE_TABLE;
    const i = pos < CURVE_TABLE ? pos | 0 : CURVE_TABLE - 1;
    const lo = table[i] as number;
    return lo + ((table[i + 1] as number) - lo) * (pos - i);
  };
}

const isIdentityCurve = (pts: readonly CurvePoint[]): boolean =>
  pts.length === 2 && pts[0]?.x === 0 && pts[0].y === 0 && pts[1]?.x === 1 && pts[1].y === 1;

/** Master curve first, then the per-channel curve of each channel (all in encoded space). */
export function prepareCurve(params: ParamsOf<'curve'>): PreparedOp | null {
  const { master, r, g, b } = params;
  if ([master, r, g, b].every(isIdentityCurve)) return null;
  const fm = createMonotoneCurve(master);
  const through = (points: readonly CurvePoint[]): ((x: number) => number) => {
    const f = createMonotoneCurve(points);
    return tabulate((x) => f(fm(x)));
  };
  const fr = through(r);
  const fg = through(g);
  const fb = through(b);
  return { space: 'encoded', fn: (v) => [fr(v[0]), fg(v[1]), fb(v[2])] };
}

export const curve = (rgb: Vec3, params: ParamsOf<'curve'>): Vec3 =>
  runOp(prepareCurve(params), rgb);
