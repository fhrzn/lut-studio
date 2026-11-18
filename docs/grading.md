# Grading (`src/grading`)

Each layer type in `src/recipe/types.ts` is a pure colour function. `bakeRecipe` evaluates the
whole stack on a 33³ grid and returns one 3D LUT, which drives both the live preview
(`Renderer.setLut`) and `.cube` export.

## Contract

- **Input and output of the bake are sRGB-encoded values in [0,1]** (the engine contract, see
  `docs/engine.md`). The LUT domain is always 0..1.
- Each layer runs in the colour space listed below, converted from and to encoded sRGB around it.
  Consecutive layers that share a space (or sit next to one, like linear and OKLab) skip the
  intermediate conversion; this is an optimisation only, the maths is unchanged.
- **Nothing is clamped between layers.** Values below 0 or above 1 survive, so for example
  `+2 EV` followed by `-2 EV` is a true no-op. The sRGB transfer functions are mirrored around 0
  for the same reason. The result is clamped to [0,1] once, at the end (NaN becomes 0).
- Layers apply top to bottom (`layers[0]` first). Per layer: `out = in + (op(in) - in) * opacity`
  (the mix happens in encoded space). Disabled layers, layers at opacity 0 and layers whose
  parameters are neutral are skipped.
- Every layer created by `createLayer` is a no-op (`monochrome` and `lut` have no neutral
  parameters, so they default to opacity 0).

## Layers

| Layer          | Space       | Definition                                                         |
| -------------- | ----------- | ------------------------------------------------------------------ |
| `exposure`     | linear sRGB | `rgb * 2^ev`                                                       |
| `whiteBalance` | linear sRGB | Bradford von Kries adaptation, see below                           |
| `contrast`     | encoded     | smoothstep S-curve blend, see below                                |
| `curve`        | encoded     | `master` first, then `r`/`g`/`b`; monotone cubic (Fritsch–Carlson) |
| `hsl`          | OKLCH       | per-band hue / chroma / lightness, smooth band weights             |
| `splitTone`    | encoded     | luma-weighted zero-luma tint offsets                               |
| `saturation`   | OKLCH       | chroma scale, plus vibrance                                        |
| `fade`         | encoded     | black-point lift                                                   |
| `monochrome`   | encoded     | channel mixer                                                      |
| `lut`          | encoded     | trilinear lookup via `sampleLut3D`                                 |

### Exposure

Decode sRGB to linear, multiply by `2^ev`, encode. +1 EV doubles linear light: encoded 0.5
(linear 0.2140) becomes 0.6858; −1 EV gives 0.3608.

### White balance

Temperature and tint describe the illuminant the scene is _assumed_ to have been lit by; the
image is adapted from that illuminant to D65. This is a chromatic adaptation, not an RGB gain.

- Temperature: the assumed illuminant moves along the CIE daylight locus (Kim et al. cubic fit,
  valid 4000–25000 K) by `-temperature/100 * 60` mired relative to D65 (6504 K = 153.8 mired).
  Positive temperature = bluer assumed illuminant = warmer image. ±100 spans roughly 4700 K to
  10 700 K.
- Tint: the assumed illuminant is shifted by `tint/100 * 0.02` in CIE 1960 _v_ (off the locus; near
  D65 the locus is almost horizontal in uv, so this is close to the locus normal). Positive tint =
  greener assumed illuminant = more magenta in the image.
- Adaptation: `M = XYZ→RGB · B⁻¹ · diag(LMS_D65 / LMS_src) · B · RGB→XYZ` with `B` the Bradford
  matrix, applied to linear sRGB. D65 is taken from the sRGB matrix (linear white `(1,1,1)`), so
  `(0, 0)` is exactly neutral.

### Contrast

`f(x) = x + k (s(x) − x)` with `s(x) = 3x² − 2x³` and `k = amount/100`, per channel. 0, 0.5 and 1
are fixed points; the curve is monotone for |k| ≤ 1 (slope at the ends is `1 − k`, at mid grey
`1 + k/2`). Outside [0,1] it continues linearly with slope `1 − k`. Example: amount 100 maps 0.25
to 0.15625.

### Tone curve

Points are sorted, duplicate x values collapse, and tangents are Fritsch–Carlson (secant average,
zeroed on sign change, limited to `α² + β² ≤ 9`), so a monotone point set never overshoots. Outside
the first/last point the curve continues with the end tangent (no clipping of unclamped values).
The master curve is applied first, then each channel's curve. The composed curve is tabulated at
4096 points for speed (error ~1e-7).

### HSL

Colours go through linear sRGB to OKLab and OKLCH. Band centres (OKLCH hue, degrees): red 29,
orange 55, yellow 110, green 142, aqua 195, blue 264, purple 300, magenta 330. Between two
adjacent centres the two bands' sliders are blended with a smoothstep, so the weights are a
continuous partition of unity: no hard edges, and equal sliders on every band give a uniform change.

- `hue` ±100 rotates OKLCH hue by ±30°.
- `sat` scales chroma by `1 + sat/100` (−100 = grey at the same lightness).
- `lum` adds `lum/100 * 0.2` to OKLab L, faded out below chroma 0.04 so near-greys (which have no
  stable hue) are not shifted.

The band blend depends only on hue, so it is tabulated (720 bins) once per recipe.

### Saturation and vibrance

OKLCH chroma scaling, lightness untouched. `saturation` scales chroma by `1 + saturation/100`.
`vibrance` scales it by `1 + v · w` with `v = vibrance/100`:
`w = 1 − C/0.3` for boosts (muted colours move most), `w = C/0.3` for cuts (vivid colours move
most), where `C` is clamped to [0, 0.3]. Skin hues (OKLCH ≈ 50°, fading out by ±35°) get up to 30 %
less vibrance.

### Split toning

A hue at full saturation `c` (HSL wheel, encoded space) becomes the offset `0.25 · (c − luma(c))`,
which has zero luma, so toning never changes brightness. The shadow and highlight offsets are
blended by encoded luma (Rec. 709 weights) with `smoothstep(p − 0.5, p + 0.5, luma)`, where
`p = 0.5 − balance/200`: balance +100 puts the crossover at black (highlights dominate), −100 at white.
`shadowSat`/`highlightSat` (0..100) scale each offset.

### Fade

`out = lift + in · (1 − lift)` with `lift = amount/100 · 0.2`. **Fade 100 lifts black to 0.2** (encoded);
white is unchanged.

### Monochrome

`y = (red·R + green·G + blue·B) / 100` on encoded values, written to all three channels. The weights
are percentages and are not normalised (like a photographic channel mixer); the default is 30/59/11.

### LUT layer

`sampleLut3D` on the encoded colour, input clamped to the imported LUT's domain, output used as is.
The resolver (`LutResolver`) is called once per layer per bake. A layer that is on but has no
resolvable LUT is skipped and reported as a warning.

## API

- `bakeRecipe(recipe, resolve, size = 33): { lut, warnings }`. `recipe` only needs `name` and
  `layers`. `warnings` has `{ layerId, code: 'missing-lut', message }` entries. (The T1 stub
  returned a bare `Lut3D`; the only caller was its unit test.)
- `recipeToCube(recipe, resolve, size = 33): string` — `.cube` text with `TITLE` = recipe name and
  comments noting that grain and vignette are not included, plus one `Warning:` comment per skipped
  layer. Values are written with 6 decimals.
- `useBakedLut(recipe, resolve, size = 33): { lut, warnings }` — bakes synchronously on the first
  render, then re-bakes when `recipe.layers`, `recipe.name`, `resolve` or `size` change, at most
  once per animation frame (the latest state wins). Spatial changes do not re-bake. Pass a memoised
  `resolve`.
- `src/grading/ops`: one pure function per layer type, `(rgb, params) => rgb`, on encoded sRGB, plus
  `prepare*` variants (precompute once, apply many times) used by the baker.

## Performance

`pnpm bench:bake` bundles `scripts/bakeBench.ts` and times a 10-layer stack (every layer type
except `lut`, plus a second HSL and saturation) at 33³ in headless Chromium. Budget: < 30 ms.
Measured 159.0.8154.6 on a local Mac (arm64, macOS): median ≈ 19 ms, worst ≈ 21 ms. What keeps it there:

- sRGB transfer functions and tone curves are table-interpolated inside [0,1] (≈1e-7 error).
- HSL band weights are tabulated per recipe; no trig per pixel.
- Space conversions are resolved once per bake and skipped between layers sharing a space.

A `lut` layer adds roughly 4–5 ms (one trilinear lookup per grid point).
