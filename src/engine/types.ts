import type { Lut3D } from '@/lut/types';

export interface SpatialParams {
  grainAmount: number; // 0..100
  grainSize: number; // 0..100
  vignetteAmount: number; // -100..100
  vignetteMidpoint: number; // 0..100
}

export type CompareMode = { kind: 'after' } | { kind: 'before' } | { kind: 'split'; x: number /* 0..1 */ };

export interface ExportOptions {
  type: 'image/jpeg' | 'image/png';
  quality?: number; // 0..1, jpeg only
}

export interface Renderer {
  setImage(source: ImageBitmap): void;
  setLut(lut: Lut3D | null): void;
  setSpatial(params: SpatialParams): void;
  setCompare(mode: CompareMode): void;
  render(): void;
  exportFullRes(source: ImageBitmap, lut: Lut3D | null, spatial: SpatialParams, opts: ExportOptions): Promise<Blob>;
  dispose(): void;
}
