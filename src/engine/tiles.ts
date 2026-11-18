export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Splits a width x height image into row-major tiles no larger than `maxSize` on either side. */
export function computeTiles(width: number, height: number, maxSize: number): Tile[] {
  if (![width, height, maxSize].every((n) => Number.isInteger(n) && n > 0)) {
    throw new RangeError(`Invalid tiling input: ${width}x${height}, max ${maxSize}`);
  }
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y += maxSize) {
    for (let x = 0; x < width; x += maxSize) {
      tiles.push({
        x,
        y,
        width: Math.min(maxSize, width - x),
        height: Math.min(maxSize, height - y),
      });
    }
  }
  return tiles;
}

/** Dimensions of an image scaled down so its long edge is at most `maxEdge` (never upscales). */
export function fitLongEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
