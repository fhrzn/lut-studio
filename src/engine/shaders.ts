export const VERTEX_SHADER = `#version 300 es
// Fullscreen triangle generated from gl_VertexID; no vertex buffers needed.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Colour contract: the source texture holds sRGB-encoded bytes and is never linearised.
 * The LUT consumes and produces sRGB-encoded values in [0,1] (photo .cube convention).
 * Grain and vignette run after the LUT, in the same encoded space.
 *
 * All spatial effects are functions of the position in *full-resolution* image coordinates
 * (uTileOrigin + pixel), so a preview render, a full render and a tiled export agree.
 */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D uImage;
uniform sampler3D uLut;
uniform bool uUseLut;
uniform float uLutSize;
uniform vec3 uDomainMin;
uniform vec3 uDomainMax;

uniform vec2 uTileSize;   // size of the region being rendered / of uImage, in pixels
uniform vec2 uTileOrigin; // top-left of that region in full-resolution image pixels
uniform vec2 uFullSize;   // full-resolution image size in pixels
uniform bool uFlipY;      // true: target is a canvas (y up); false: FBO whose row 0 is image top

uniform int uMode;        // 0 after, 1 before, 2 split
uniform float uSplitX;    // split position, 0..1 of image width; left = before, right = after

uniform float uGrainAmount;      // 0..1
uniform float uGrainCells;       // noise lattice cells along the long image edge
uniform float uVignetteAmount;   // -1..1
uniform float uVignetteMidpoint; // 0..1

out vec4 outColor;

// pcg2d integer hash (Jarzynski & Olano 2020): exact on every GPU, unlike sin()-based hashes.
float lattice(uvec2 c) {
  uvec2 v = c * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return float(v.x >> 8u) / 16777216.0;
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  uvec2 c = uvec2(i);
  float a = lattice(c);
  float b = lattice(c + uvec2(1u, 0u));
  float d = lattice(c + uvec2(0u, 1u));
  float e = lattice(c + uvec2(1u, 1u));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

vec3 applyLut(vec3 c) {
  vec3 range = max(uDomainMax - uDomainMin, vec3(1e-6));
  vec3 t = clamp((c - uDomainMin) / range, 0.0, 1.0);
  vec3 coord = (t * (uLutSize - 1.0) + 0.5) / uLutSize; // texel centres
  return texture(uLut, coord).rgb;
}

void main() {
  float row = uFlipY ? (uTileSize.y - gl_FragCoord.y) : gl_FragCoord.y;
  vec2 px = vec2(gl_FragCoord.x, row);
  vec3 src = texture(uImage, px / uTileSize).rgb;

  vec2 fullPx = uTileOrigin + px;
  vec2 uv = fullPx / uFullSize;

  bool after = uMode == 0 || (uMode == 2 && uv.x >= uSplitX);
  vec3 c = src;

  if (after) {
    if (uUseLut) c = applyLut(c);

    if (uGrainAmount > 0.0) {
      vec2 cells = fullPx / max(uFullSize.x, uFullSize.y) * uGrainCells;
      float g = (valueNoise(cells) - 0.5) * 3.0;
      float luma = dot(clamp(c, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
      float weight = 1.0 - 0.75 * pow(abs(2.0 * luma - 1.0), 2.0); // favour midtones
      c += g * uGrainAmount * 0.16 * weight;
    }

    if (uVignetteAmount != 0.0) {
      float aspect = uFullSize.x / uFullSize.y;
      vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
      float d = length(p) / length(vec2(aspect, 1.0) * 0.5); // 1.0 at the corners
      float v = smoothstep(min(uVignetteMidpoint, 0.99), 1.0, d);
      if (uVignetteAmount > 0.0) c *= 1.0 - uVignetteAmount * v;
      else c = mix(c, vec3(1.0), -uVignetteAmount * v);
    }
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
