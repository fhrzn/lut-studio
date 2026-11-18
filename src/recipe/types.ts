import type { SpatialParams } from '@/engine/types';

export interface CurvePoint { x: number; y: number } // 0..1
export type HslBand = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';
export interface HslAdjust { hue: number; sat: number; lum: number } // each -100..100

interface LayerBase { id: string; enabled: boolean; opacity: number /* 0..1 */ }

export type Layer =
  | (LayerBase & { type: 'exposure'; params: { ev: number /* -5..5 */ } })
  | (LayerBase & { type: 'whiteBalance'; params: { temperature: number; tint: number /* -100..100 */ } })
  | (LayerBase & { type: 'contrast'; params: { amount: number /* -100..100 */ } })
  | (LayerBase & { type: 'curve'; params: { master: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] } })
  | (LayerBase & { type: 'hsl'; params: Record<HslBand, HslAdjust> })
  | (LayerBase & { type: 'splitTone'; params: { shadowHue: number; shadowSat: number; highlightHue: number; highlightSat: number; balance: number } })
  | (LayerBase & { type: 'saturation'; params: { saturation: number; vibrance: number /* -100..100 */ } })
  | (LayerBase & { type: 'fade'; params: { amount: number /* 0..100 */ } })
  | (LayerBase & { type: 'monochrome'; params: { red: number; green: number; blue: number /* channel weights, -200..300 */ } })
  | (LayerBase & { type: 'lut'; params: { lutId: string; name: string } });

export type LayerType = Layer['type'];

export interface Recipe {
  schemaVersion: 1;
  id: string; // uuid
  name: string;
  description?: string;
  source: 'user' | 'builtin';
  createdAt: string; // ISO 8601
  updatedAt: string;
  layers: Layer[]; // applied top to bottom (index 0 first)
  spatial: SpatialParams;
}
