import type { Lut3D } from '@/lut/types';
import { must } from './glUtil';

/** Throws if the LUT is malformed. */
export function validateLut(lut: Lut3D): void {
  const { size, data } = lut;
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`LUT size must be an integer >= 2, got ${size}`);
  }
  if (data.length !== size * size * size * 3) {
    throw new RangeError(
      `LUT data length ${data.length} does not match size ${size} (expected ${size ** 3 * 3})`,
    );
  }
}

/** Pads RGB triplets to RGBA (alpha = 1) for an RGBA16F upload, preserving .cube ordering. */
export function packLutRgba(lut: Lut3D): Float32Array {
  validateLut(lut);
  const texels = lut.size ** 3;
  const out = new Float32Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    out[i * 4] = lut.data[i * 3] ?? 0;
    out[i * 4 + 1] = lut.data[i * 3 + 1] ?? 0;
    out[i * 4 + 2] = lut.data[i * 3 + 2] ?? 0;
    out[i * 4 + 3] = 1;
  }
  return out;
}

/**
 * Uploads a LUT as an RGBA16F 3D texture with hardware trilinear filtering.
 * .cube order is red-fastest, which maps to x = R, y = G, z = B.
 */
export function uploadLut(gl: WebGL2RenderingContext, lut: Lut3D): WebGLTexture {
  const packed = packLutRgba(lut);
  const max = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
  if (lut.size > max)
    throw new RangeError(`LUT size ${lut.size} exceeds MAX_3D_TEXTURE_SIZE ${max}`);

  const texture = must(gl.createTexture(), 'LUT texture');
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA16F,
    lut.size,
    lut.size,
    lut.size,
    0,
    gl.RGBA,
    gl.FLOAT,
    packed,
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  return texture;
}
