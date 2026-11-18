import type { Lut3D } from '@/lut/types';
import { createRenderer } from './createRenderer';
import type { RendererOptions } from './createRenderer';
import { loadImage } from './loadImage';
import type { Renderer } from './types';

/** Test hooks exposed on `window.__lutEngine` by the `?dev=engine` page. */
export interface EngineDevApi {
  canvas: HTMLCanvasElement;
  /** Renderer bound to `canvas`. Re-created by `resetRenderer`. */
  renderer: Renderer;
  resetRenderer(options?: RendererOptions): Renderer;
  loadImage: typeof loadImage;
  /** Smooth R/G/B ramps with a diagonal term, so every channel value occurs. */
  gradientBitmap(width: number, height: number): Promise<ImageBitmap>;
  /** RGBA pixels of a bitmap, top row first. */
  bitmapPixels(bitmap: ImageBitmap): Uint8ClampedArray;
  /** RGBA pixels of the WebGL drawing buffer via gl.readPixels, top row first. */
  readPixels(): { width: number; height: number; data: Uint8Array };
  /** Identity LUT of the given size. */
  identityLut(size: number): Lut3D;
  /** 2^3 LUT that maps c to 1 - c. */
  invertLut(): Lut3D;
  /** Largest per-channel absolute difference between two RGBA buffers. */
  maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number;
}

declare global {
  interface Window {
    __lutEngine?: EngineDevApi;
  }
}

function identityLut(size: number): Lut3D {
  const data = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        data[i++] = r / (size - 1);
        data[i++] = g / (size - 1);
        data[i++] = b / (size - 1);
      }
  return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function invertLut(): Lut3D {
  const lut = identityLut(2);
  for (let i = 0; i < lut.data.length; i++) lut.data[i] = 1 - (lut.data[i] ?? 0);
  return lut;
}

async function gradientBitmap(width: number, height: number): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const horizontal = ctx.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, '#000');
  horizontal.addColorStop(1, '#f00');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, width, height);
  // Green ramps top to bottom, blue along the diagonal; 'lighter' sums the channels.
  ctx.globalCompositeOperation = 'lighter';
  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, '#000');
  vertical.addColorStop(1, '#0f0');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);
  const diagonal = ctx.createLinearGradient(0, 0, width, height);
  diagonal.addColorStop(0, '#000');
  diagonal.addColorStop(1, '#00f');
  ctx.fillStyle = diagonal;
  ctx.fillRect(0, 0, width, height);
  return createImageBitmap(canvas);
}

function bitmapPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`Length mismatch ${a.length} vs ${b.length}`);
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue; // ignore alpha
    max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  }
  return max;
}

/** Mounts a bare canvas and the `window.__lutEngine` test API; used by Playwright (`?dev=engine`). */
export function mountEngineHarness(root: HTMLElement): void {
  root.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.id = 'engine-canvas';
  canvas.style.maxWidth = '100%';
  root.append(canvas);

  const api: EngineDevApi = {
    canvas,
    renderer: createRenderer(canvas),
    resetRenderer(options) {
      api.renderer.dispose();
      // A disposed context cannot be reused, so swap the canvas element.
      const fresh = document.createElement('canvas');
      fresh.id = 'engine-canvas';
      fresh.style.maxWidth = '100%';
      canvas.replaceWith(fresh);
      api.canvas = fresh;
      api.renderer = createRenderer(fresh, options);
      return api.renderer;
    },
    loadImage,
    gradientBitmap,
    bitmapPixels,
    readPixels() {
      const gl = api.canvas.getContext('webgl2');
      if (!gl) throw new Error('No WebGL2 context');
      const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
      const raw = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const data = new Uint8Array(raw.length);
      const stride = width * 4;
      for (let y = 0; y < height; y++) {
        data.set(raw.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
      }
      return { width, height, data };
    },
    identityLut,
    invertLut,
    maxDiff,
  };
  window.__lutEngine = api;
}
