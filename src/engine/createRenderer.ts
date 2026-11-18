import type { Lut3D } from '@/lut/types';
import { must } from './glUtil';
import { uploadLut } from './lutTexture';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import { computeTiles } from './tiles';
import type { CompareMode, ExportOptions, Renderer, SpatialParams } from './types';

export interface RendererOptions {
  /** Upper bound for export tiles; clamped to MAX_TEXTURE_SIZE. Default 4096. */
  maxTileSize?: number;
}

const DEFAULT_MAX_TILE = 4096;
const GRAIN_CELLS_FINE = 2048; // lattice cells along the long edge at grainSize 0
const GRAIN_CELLS_COARSE = 512; // ... at grainSize 100

const UNIFORMS = [
  'uImage',
  'uLut',
  'uUseLut',
  'uLutSize',
  'uDomainMin',
  'uDomainMax',
  'uTileSize',
  'uTileOrigin',
  'uFullSize',
  'uFlipY',
  'uMode',
  'uSplitX',
  'uGrainAmount',
  'uGrainCells',
  'uVignetteAmount',
  'uVignetteMidpoint',
] as const;
type UniformName = (typeof UNIFORMS)[number];

interface GpuLut {
  texture: WebGLTexture;
  size: number;
  domainMin: Lut3D['domainMin'];
  domainMax: Lut3D['domainMax'];
}

interface GlResources {
  program: WebGLProgram;
  uniforms: Record<UniformName, WebGLUniformLocation | null>;
  vao: WebGLVertexArrayObject;
  imageTexture: WebGLTexture;
  /** Bound to the LUT sampler when no LUT is active so the unit is never empty. */
  placeholderLut: WebGLTexture;
  maxTextureSize: number;
}

interface DrawParams {
  target: WebGLFramebuffer | null;
  imageTexture: WebGLTexture;
  lut: GpuLut | null;
  /** Region being rendered, in pixels (also the size of `imageTexture`). */
  size: [number, number];
  /** Top-left of the region within the full-resolution image. */
  origin: [number, number];
  fullSize: [number, number];
  flipY: boolean;
  compare: CompareMode;
  spatial: SpatialParams;
}

const NO_SPATIAL: SpatialParams = {
  grainAmount: 0,
  grainSize: 0,
  vignetteAmount: 0,
  vignetteMidpoint: 50,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = must(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createTexture2D(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = must(gl.createTexture(), 'texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createResources(gl: WebGL2RenderingContext): GlResources {
  const program = must(gl.createProgram(), 'program');
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }

  const uniforms = Object.fromEntries(
    UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<UniformName, WebGLUniformLocation | null>;

  const placeholderLut = uploadLut(gl, {
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: new Float32Array(2 * 2 * 2 * 3),
  });

  return {
    program,
    uniforms,
    vao: must(gl.createVertexArray(), 'vertex array'),
    imageTexture: createTexture2D(gl),
    placeholderLut,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
  };
}

function uploadImage(gl: WebGL2RenderingContext, texture: WebGLTexture, source: ImageBitmap): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

function draw(gl: WebGL2RenderingContext, res: GlResources, p: DrawParams): void {
  const u = res.uniforms;
  gl.bindFramebuffer(gl.FRAMEBUFFER, p.target);
  gl.viewport(0, 0, p.size[0], p.size[1]);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(res.program);
  gl.bindVertexArray(res.vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, p.imageTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_3D, p.lut?.texture ?? res.placeholderLut);
  gl.uniform1i(u.uImage, 0);
  gl.uniform1i(u.uLut, 1);

  gl.uniform1i(u.uUseLut, p.lut ? 1 : 0);
  if (p.lut) {
    gl.uniform1f(u.uLutSize, p.lut.size);
    gl.uniform3fv(u.uDomainMin, p.lut.domainMin);
    gl.uniform3fv(u.uDomainMax, p.lut.domainMax);
  }

  gl.uniform2fv(u.uTileSize, p.size);
  gl.uniform2fv(u.uTileOrigin, p.origin);
  gl.uniform2fv(u.uFullSize, p.fullSize);
  gl.uniform1i(u.uFlipY, p.flipY ? 1 : 0);

  gl.uniform1i(u.uMode, p.compare.kind === 'after' ? 0 : p.compare.kind === 'before' ? 1 : 2);
  gl.uniform1f(u.uSplitX, p.compare.kind === 'split' ? p.compare.x : 0);

  const s = p.spatial;
  gl.uniform1f(u.uGrainAmount, s.grainAmount / 100);
  gl.uniform1f(
    u.uGrainCells,
    GRAIN_CELLS_FINE + (GRAIN_CELLS_COARSE - GRAIN_CELLS_FINE) * (s.grainSize / 100),
  );
  gl.uniform1f(u.uVignetteAmount, s.vignetteAmount / 100);
  gl.uniform1f(u.uVignetteMidpoint, s.vignetteMidpoint / 100);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function sanitizeSpatial(params: SpatialParams): SpatialParams {
  return {
    grainAmount: clamp(params.grainAmount, 0, 100),
    grainSize: clamp(params.grainSize, 0, 100),
    vignetteAmount: clamp(params.vignetteAmount, -100, 100),
    vignetteMidpoint: clamp(params.vignetteMidpoint, 0, 100),
  };
}

function createOutputCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encodeCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  opts: ExportOptions,
): Promise<Blob> {
  const quality = opts.type === 'image/jpeg' ? (opts.quality ?? 0.92) : undefined;
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
        opts.type,
        quality,
      );
    });
  }
  return canvas.convertToBlob({ type: opts.type, quality });
}

/**
 * Creates a WebGL2 renderer on `canvas`.
 *
 * The renderer owns the canvas backing-store size: `setImage` resizes it to the bitmap, so pass
 * the preview bitmap and scale the element with CSS. The renderer keeps references to the bitmap
 * and LUT it was given (to restore after a context loss), so do not `close()` the bitmap while it
 * is the active image.
 */
export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): Renderer {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!context) throw new Error('WebGL2 is not available');
  const gl: WebGL2RenderingContext = context; // non-null alias that function declarations can use

  const maxTileSize = Math.max(1, Math.floor(options.maxTileSize ?? DEFAULT_MAX_TILE));

  let res: GlResources | null = createResources(gl);
  let generation = 0; // bumped when GL resources are recreated after a context restore
  let disposed = false;

  let image: ImageBitmap | null = null;
  let lut: Lut3D | null = null;
  let gpuLut: GpuLut | null = null;
  let spatial: SpatialParams = NO_SPATIAL;
  let compare: CompareMode = { kind: 'after' };

  function releaseGpuLut(): void {
    if (gpuLut && !gl.isContextLost()) gl.deleteTexture(gpuLut.texture);
    gpuLut = null;
  }

  function toGpuLut(source: Lut3D): GpuLut {
    return {
      texture: uploadLut(gl, source),
      size: source.size,
      domainMin: source.domainMin,
      domainMax: source.domainMax,
    };
  }

  /** Re-creates every GL object from the cached JS-side state. */
  function restore(): void {
    generation++;
    res = createResources(gl);
    gpuLut = lut ? toGpuLut(lut) : null;
    if (image) uploadImage(gl, res.imageTexture, image);
    render();
  }

  function onContextLost(event: Event): void {
    event.preventDefault(); // required for webglcontextrestored to fire
    res = null;
    gpuLut = null;
  }

  function onContextRestored(): void {
    if (disposed) return;
    restore();
  }

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  function setImage(source: ImageBitmap): void {
    if (disposed || !res) {
      image = source; // picked up by restore()
      return;
    }
    if (source.width > res.maxTextureSize || source.height > res.maxTextureSize) {
      throw new RangeError(
        `Image ${source.width}x${source.height} exceeds MAX_TEXTURE_SIZE ${res.maxTextureSize}; pass the preview bitmap`,
      );
    }
    image = source;
    canvas.width = source.width;
    canvas.height = source.height;
    uploadImage(gl, res.imageTexture, source);
  }

  function setLut(next: Lut3D | null): void {
    lut = next;
    if (disposed || !res) return;
    releaseGpuLut();
    gpuLut = next ? toGpuLut(next) : null;
  }

  function setSpatial(params: SpatialParams): void {
    spatial = sanitizeSpatial(params);
  }

  function setCompare(mode: CompareMode): void {
    compare = mode.kind === 'split' ? { kind: 'split', x: clamp(mode.x, 0, 1) } : mode;
  }

  function render(): void {
    if (disposed || !res || gl.isContextLost()) return;
    if (!image) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const size: [number, number] = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    draw(gl, res, {
      target: null,
      imageTexture: res.imageTexture,
      lut: gpuLut,
      size,
      origin: [0, 0],
      fullSize: size,
      flipY: true,
      compare,
      spatial,
    });
  }

  async function exportFullRes(
    source: ImageBitmap,
    exportLut: Lut3D | null,
    exportSpatial: SpatialParams,
    opts: ExportOptions,
  ): Promise<Blob> {
    const startGeneration = generation;
    const assertAlive = (): GlResources => {
      if (disposed) throw new Error('Renderer disposed during export');
      if (!res || gl.isContextLost() || generation !== startGeneration) {
        throw new Error('WebGL context lost during export');
      }
      return res;
    };

    const { width, height } = source;
    const resources = assertAlive();
    const tileSize = Math.min(maxTileSize, resources.maxTextureSize);
    const tiles = computeTiles(width, height, tileSize);
    const params = sanitizeSpatial(exportSpatial);

    const output = createOutputCanvas(width, height);
    const ctx = output.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Could not create 2D context for export');

    const exportGpuLut = exportLut ? toGpuLut(exportLut) : null;
    const sourceTexture = createTexture2D(gl);
    const targetTexture = createTexture2D(gl);
    const framebuffer = must(gl.createFramebuffer(), 'framebuffer');
    const bufferWidth = Math.min(width, tileSize);
    const bufferHeight = Math.min(height, tileSize);
    const pixels = new Uint8Array(bufferWidth * bufferHeight * 4);

    try {
      gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        bufferWidth,
        bufferHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        targetTexture,
        0,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Export framebuffer is incomplete');
      }

      for (const tile of tiles) {
        // Crop on the CPU side so the source never has to fit in a single texture.
        const piece =
          tiles.length === 1
            ? source
            : await createImageBitmap(source, tile.x, tile.y, tile.width, tile.height);
        try {
          const live = assertAlive();
          uploadImage(gl, sourceTexture, piece);
          draw(gl, live, {
            target: framebuffer,
            imageTexture: sourceTexture,
            lut: exportGpuLut,
            size: [tile.width, tile.height],
            origin: [tile.x, tile.y],
            fullSize: [width, height],
            flipY: false, // FBO row 0 = image top, so readPixels is already top-down
            compare: { kind: 'after' },
            spatial: params,
          });
          gl.readPixels(0, 0, tile.width, tile.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          assertAlive();
        } finally {
          if (piece !== source) piece.close();
        }
        const view = new Uint8ClampedArray(pixels.buffer, 0, tile.width * tile.height * 4);
        ctx.putImageData(new ImageData(view, tile.width, tile.height), tile.x, tile.y);
      }
      return await encodeCanvas(output, opts);
    } finally {
      if (!gl.isContextLost()) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(targetTexture);
        gl.deleteTexture(sourceTexture);
        if (exportGpuLut) gl.deleteTexture(exportGpuLut.texture);
      }
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    if (res && !gl.isContextLost()) {
      releaseGpuLut();
      gl.deleteTexture(res.imageTexture);
      gl.deleteTexture(res.placeholderLut);
      gl.deleteVertexArray(res.vao);
      gl.deleteProgram(res.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    res = null;
    image = null;
    lut = null;
  }

  return { setImage, setLut, setSpatial, setCompare, render, exportFullRes, dispose };
}
