# Render engine (`src/engine`)

Raw WebGL2. `createRenderer(canvas, options?)` implements the `Renderer` interface in
`src/engine/types.ts`. `loadImage(file)` decodes a photo (EXIF orientation applied) and builds a
preview with a long edge of at most 2048 px.

## Colour contract

- The photo is uploaded as sRGB-encoded bytes and is **never linearised**.
- A LUT's input and output are **sRGB-encoded values in [0,1]** (how photo `.cube` files are authored).
- Input is normalised with `domainMin/domainMax`, then mapped to texel centres:
  `coord = (t * (N-1) + 0.5) / N`. The output is not domain-scaled.
- LUT texture: `RGBA16F`, `LINEAR` filtering, `CLAMP_TO_EDGE` (hardware trilinear). `setLut(null)` skips the lookup.
- Alpha is ignored; output is opaque.

## Grain and vignette

Both run after the LUT, in encoded space, and are functions of the position in
**full-resolution image coordinates** (an integer-hash value-noise lattice sized relative to the
long edge). A preview, a full-size render and each tile of a tiled export therefore agree.
Neither is part of a baked `.cube`.

## Compare

`after` (default), `before` (source untouched) and `split` with `x` in 0..1: left of `x` shows
the before image, right shows after. The engine draws no divider; the UI overlays its own handle.

## Export

`exportFullRes` renders tiles of at most `min(4096, MAX_TEXTURE_SIZE)` into an offscreen
framebuffer, crops the source per tile (so the source never has to fit in one texture),
assembles them in an `OffscreenCanvas` and encodes with `convertToBlob`. Output dimensions equal
the source. `createRenderer`'s optional `maxTileSize` exists so tests can exercise tile seams.

## Context loss

`webglcontextlost` is cancelled; on `webglcontextrestored` all GL objects are rebuilt from the
cached bitmap, LUT and params and the frame is re-rendered. An in-flight export rejects.
The renderer keeps a reference to the active `ImageBitmap`; do not `close()` it while in use.

## Dev harness

`/?dev=engine` mounts a bare canvas and `window.__lutEngine` (see `devHarness.ts`) for the
Playwright tests in `tests/e2e/engine.spec.ts`. The EXIF fixture `public/samples/orientation-6.jpg`
is regenerated with `node scripts/generate-orientation-fixture.mjs`.
