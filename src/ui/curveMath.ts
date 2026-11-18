import type { CurvePoint } from '@/recipe/types';

/** Closest two curve points may get on the x axis. */
export const MIN_POINT_GAP = 0.005;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round = (v: number): number => Math.round(v * 10000) / 10000;

/** Inserts a point keeping x order; returns the same array if it would sit on an existing point. */
export function insertPoint(
  points: CurvePoint[],
  at: CurvePoint,
): { points: CurvePoint[]; index: number } {
  const p = { x: round(clamp01(at.x)), y: round(clamp01(at.y)) };
  if (points.some((q) => Math.abs(q.x - p.x) < MIN_POINT_GAP)) {
    return { points, index: -1 };
  }
  const index = points.findIndex((q) => q.x > p.x);
  const at_ = index < 0 ? points.length : index;
  return { points: [...points.slice(0, at_), p, ...points.slice(at_)], index: at_ };
}

/** Moves a point; the end points keep their x and interior points stay between their neighbours. */
export function movePoint(points: CurvePoint[], index: number, to: CurvePoint): CurvePoint[] {
  const current = points[index];
  if (!current) return points;
  const prev = points[index - 1];
  const next = points[index + 1];
  const isEnd = !prev || !next;
  const lo = prev ? prev.x + MIN_POINT_GAP : 0;
  const hi = next ? next.x - MIN_POINT_GAP : 1;
  const x = isEnd ? current.x : round(Math.min(hi, Math.max(lo, clamp01(to.x))));
  const y = round(clamp01(to.y));
  if (x === current.x && y === current.y) return points;
  return points.map((p, i) => (i === index ? { x, y } : p));
}

/** Removes an interior point; the two end points are permanent. */
export function removePoint(points: CurvePoint[], index: number): CurvePoint[] {
  if (index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}

/** Fritsch–Carlson monotone cubic through the points, evaluated at x; flat outside the end points. */
export function makeCurveFn(points: CurvePoint[]): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++)
    delta.push(((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / ((xs[i + 1] ?? 1) - (xs[i] ?? 0)));
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = delta[0] ?? 0;
  m[n - 1] = delta[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const a = delta[i - 1] ?? 0;
    const b = delta[i] ?? 0;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i] ?? 0;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / d;
    const b = (m[i + 1] ?? 0) / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }
  return (x) => {
    if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
    if (x >= (xs[n - 1] ?? 1)) return ys[n - 1] ?? 1;
    let i = 0;
    while (i < n - 2 && x > (xs[i + 1] ?? 1)) i++;
    const x0 = xs[i] ?? 0;
    const h = (xs[i + 1] ?? 1) - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[i] ?? 0) +
      (t3 - 2 * t2 + t) * h * (m[i] ?? 0) +
      (-2 * t3 + 3 * t2) * (ys[i + 1] ?? 0) +
      (t3 - t2) * h * (m[i + 1] ?? 0)
    );
  };
}

/** SVG path (unit square, y up) for the curve: `size` px square, y flipped. */
export function curvePath(points: CurvePoint[], size: number, steps = 64): string {
  const f = makeCurveFn(points);
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const y = clamp01(f(x));
    parts.push(`${i === 0 ? 'M' : 'L'}${(x * size).toFixed(2)} ${((1 - y) * size).toFixed(2)}`);
  }
  return parts.join(' ');
}
