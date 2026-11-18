import { describe, expect, it } from 'vitest';
import {
  curvePath,
  insertPoint,
  makeCurveFn,
  MIN_POINT_GAP,
  movePoint,
  removePoint,
} from '@/ui/curveMath';
import type { CurvePoint } from '@/recipe/types';

const identity: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

describe('insertPoint', () => {
  it('keeps points sorted by x', () => {
    const a = insertPoint(identity, { x: 0.7, y: 0.4 });
    const b = insertPoint(a.points, { x: 0.3, y: 0.6 });
    expect(a.index).toBe(1);
    expect(b.index).toBe(1);
    expect(b.points.map((p) => p.x)).toEqual([0, 0.3, 0.7, 1]);
  });

  it('clamps to the unit square and rejects a point on top of another', () => {
    expect(insertPoint(identity, { x: 0.5, y: 3 }).points[1]).toEqual({ x: 0.5, y: 1 });
    const same = insertPoint(identity, { x: 0 + MIN_POINT_GAP / 2, y: 0.5 });
    expect(same.index).toBe(-1);
    expect(same.points).toBe(identity);
  });
});

describe('movePoint', () => {
  const pts: CurvePoint[] = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
  ];

  it('keeps an interior point between its neighbours', () => {
    expect(movePoint(pts, 1, { x: 2, y: 0.2 })[1]).toEqual({ x: 1 - MIN_POINT_GAP, y: 0.2 });
    expect(movePoint(pts, 1, { x: -1, y: 0.2 })[1]).toEqual({ x: MIN_POINT_GAP, y: 0.2 });
  });

  it('fixes the x of the end points and clamps y', () => {
    expect(movePoint(pts, 0, { x: 0.4, y: -1 })[0]).toEqual({ x: 0, y: 0 });
    expect(movePoint(pts, 2, { x: 0.4, y: 0.3 })[2]).toEqual({ x: 1, y: 0.3 });
  });

  it('returns the same array when nothing changes or the index is wrong', () => {
    expect(movePoint(pts, 1, { x: 0.5, y: 0.5 })).toBe(pts);
    expect(movePoint(pts, 9, { x: 0.5, y: 0.5 })).toBe(pts);
  });
});

describe('removePoint', () => {
  it('removes interior points only', () => {
    const pts = [...identity.slice(0, 1), { x: 0.5, y: 0.7 }, ...identity.slice(1)];
    expect(removePoint(pts, 1)).toEqual(identity);
    expect(removePoint(pts, 0)).toBe(pts);
    expect(removePoint(pts, 2)).toBe(pts);
    expect(removePoint(identity, 1)).toBe(identity);
  });
});

describe('makeCurveFn', () => {
  it('is the identity for the default curve and flat outside the end points', () => {
    const f = makeCurveFn(identity);
    for (const x of [0, 0.25, 0.5, 1]) expect(f(x)).toBeCloseTo(x, 10);
    const g = makeCurveFn([
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.9 },
    ]);
    expect(g(0)).toBe(0.3);
    expect(g(1)).toBe(0.9);
  });

  it('passes through its points and never overshoots them', () => {
    const pts: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.05 },
      { x: 0.5, y: 0.9 },
      { x: 0.75, y: 0.95 },
      { x: 1, y: 1 },
    ];
    const f = makeCurveFn(pts);
    for (const p of pts) expect(f(p.x)).toBeCloseTo(p.y, 10);
    let last = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const y = f(i / 200);
      expect(y).toBeGreaterThanOrEqual(last - 1e-12); // monotone input stays monotone
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      last = y;
    }
  });
});

describe('curvePath', () => {
  it('starts bottom-left and ends top-right of an identity curve', () => {
    const path = curvePath(identity, 100, 4);
    expect(path.startsWith('M0.00 100.00')).toBe(true);
    expect(path.endsWith('L100.00 0.00')).toBe(true);
  });
});
