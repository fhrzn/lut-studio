import { describe, expect, it } from 'vitest';
import { createLayer, createRecipe, DEFAULT_SPATIAL, HSL_BANDS } from '@/recipe/factory';
import type { Layer, LayerType } from '@/recipe/types';

const ALL_TYPES: LayerType[] = [
  'exposure',
  'whiteBalance',
  'contrast',
  'curve',
  'hsl',
  'splitTone',
  'saturation',
  'fade',
  'monochrome',
  'lut',
];

/** Structural no-op check; T5 asserts the same numerically through the baker. */
function isStructuralNoop(layer: Layer): boolean {
  if (!layer.enabled || layer.opacity === 0) return true;
  switch (layer.type) {
    case 'exposure':
      return layer.params.ev === 0;
    case 'whiteBalance':
      return layer.params.temperature === 0 && layer.params.tint === 0;
    case 'contrast':
      return layer.params.amount === 0;
    case 'curve':
      return Object.values(layer.params).every(
        (pts) =>
          pts.length === 2 &&
          pts[0]?.x === 0 &&
          pts[0].y === 0 &&
          pts[1]?.x === 1 &&
          pts[1].y === 1,
      );
    case 'hsl':
      return HSL_BANDS.every((b) => {
        const { hue, sat, lum } = layer.params[b];
        return hue === 0 && sat === 0 && lum === 0;
      });
    case 'splitTone':
      return layer.params.shadowSat === 0 && layer.params.highlightSat === 0;
    case 'saturation':
      return layer.params.saturation === 0 && layer.params.vibrance === 0;
    case 'fade':
      return layer.params.amount === 0;
    case 'monochrome':
    case 'lut':
      return false;
  }
}

describe('createLayer', () => {
  it.each(ALL_TYPES)('default %s layer is a no-op', (type) => {
    expect(isStructuralNoop(createLayer(type))).toBe(true);
  });

  it('only monochrome and lut rely on opacity 0', () => {
    for (const type of ALL_TYPES) {
      const layer = createLayer(type);
      const viaOpacity = type === 'monochrome' || type === 'lut';
      expect(layer.opacity).toBe(viaOpacity ? 0 : 1);
      expect(layer.enabled).toBe(true);
    }
  });

  it('gives every layer a unique id and independent curve points', () => {
    const a = createLayer('curve');
    const b = createLayer('curve');
    expect(a.id).not.toBe(b.id);
    if (a.type === 'curve' && b.type === 'curve') expect(a.params.master).not.toBe(b.params.master);
  });
});

describe('createRecipe', () => {
  it('creates an empty user recipe with default spatial', () => {
    const r = createRecipe('Mine');
    expect(r).toMatchObject({ schemaVersion: 1, name: 'Mine', source: 'user', layers: [] });
    expect(r.spatial).toEqual(DEFAULT_SPATIAL);
    expect(r.spatial).not.toBe(DEFAULT_SPATIAL);
    expect(r.createdAt).toBe(r.updatedAt);
  });

  it('default spatial has no grain and no vignette', () => {
    expect(DEFAULT_SPATIAL.grainAmount).toBe(0);
    expect(DEFAULT_SPATIAL.vignetteAmount).toBe(0);
  });
});
