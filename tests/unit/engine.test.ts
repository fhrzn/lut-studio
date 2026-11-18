import { describe, expect, it } from 'vitest';
import { packLutRgba, validateLut } from '@/engine/lutTexture';
import { computeTiles, fitLongEdge } from '@/engine/tiles';
import type { Lut3D } from '@/lut/types';

describe('computeTiles', () => {
  it('covers the image exactly once with tiles <= max', () => {
    const tiles = computeTiles(8000, 6000, 4096);
    expect(tiles).toHaveLength(4);
    const area = tiles.reduce((sum, t) => sum + t.width * t.height, 0);
    expect(area).toBe(8000 * 6000);
    for (const t of tiles) {
      expect(t.width).toBeLessThanOrEqual(4096);
      expect(t.height).toBeLessThanOrEqual(4096);
    }
    expect(tiles[1]).toEqual({ x: 4096, y: 0, width: 3904, height: 4096 });
    expect(tiles[3]).toEqual({ x: 4096, y: 4096, width: 3904, height: 1904 });
  });

  it('returns a single tile for small images', () => {
    expect(computeTiles(100, 50, 4096)).toEqual([{ x: 0, y: 0, width: 100, height: 50 }]);
  });

  it('rejects invalid input', () => {
    expect(() => computeTiles(0, 10, 128)).toThrow(RangeError);
    expect(() => computeTiles(10, 10, 0)).toThrow(RangeError);
    expect(() => computeTiles(10.5, 10, 128)).toThrow(RangeError);
  });
});

describe('fitLongEdge', () => {
  it('downscales the long edge to the limit, keeping aspect', () => {
    expect(fitLongEdge(8000, 6000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitLongEdge(6000, 8000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('never upscales', () => {
    expect(fitLongEdge(1000, 500, 2048)).toEqual({ width: 1000, height: 500 });
  });

  it('keeps at least one pixel on the short edge', () => {
    expect(fitLongEdge(100000, 10, 2048).height).toBe(1);
  });
});

describe('LUT packing', () => {
  const lut: Lut3D = {
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: Float32Array.from({ length: 24 }, (_, i) => i / 24),
  };

  it('pads RGB triplets to RGBA with alpha 1 and keeps order', () => {
    const packed = packLutRgba(lut);
    expect(packed).toHaveLength(32);
    expect(Array.from(packed.subarray(0, 8))).toEqual(
      [0, 1 / 24, 2 / 24, 1, 3 / 24, 4 / 24, 5 / 24, 1].map((v) => Math.fround(v)),
    );
  });

  it('rejects malformed LUTs', () => {
    expect(() => validateLut({ ...lut, data: new Float32Array(10) })).toThrow(RangeError);
    expect(() => validateLut({ ...lut, size: 1 })).toThrow(RangeError);
    expect(() => validateLut({ ...lut, size: 2.5 })).toThrow(RangeError);
  });
});
