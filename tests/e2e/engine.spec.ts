import { expect, test } from '@playwright/test';
import type { EngineDevApi } from '@/engine/devHarness';

declare global {
  interface Window {
    __lutEngine?: EngineDevApi;
  }
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('./?dev=engine');
  await page.waitForFunction(() => window.__lutEngine !== undefined);
});

const NO_SPATIAL = { grainAmount: 0, grainSize: 0, vignetteAmount: 0, vignetteMidpoint: 50 };

test('identity: no LUT and a 33^3 identity LUT reproduce the input within 1/255', async ({
  page,
}) => {
  const result = await page.evaluate(async (noSpatial) => {
    const e = window.__lutEngine!;
    const bitmap = await e.gradientBitmap(256, 192);
    const expected = e.bitmapPixels(bitmap);
    e.renderer.setImage(bitmap);
    e.renderer.setSpatial(noSpatial);

    e.renderer.setLut(null);
    e.renderer.render();
    const withoutLut = e.maxDiff(e.readPixels().data, expected);

    e.renderer.setLut(e.identityLut(33));
    e.renderer.render();
    const withLut = e.maxDiff(e.readPixels().data, expected);
    return { withoutLut, withLut, size: [e.canvas.width, e.canvas.height] };
  }, NO_SPATIAL);

  expect(result.size).toEqual([256, 192]);
  expect(result.withoutLut).toBeLessThanOrEqual(1);
  expect(result.withLut).toBeLessThanOrEqual(1);
});

test('invert 2^3 LUT produces 1 - input within 2/255', async ({ page }) => {
  const diff = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const bitmap = await e.gradientBitmap(256, 192);
    const src = e.bitmapPixels(bitmap);
    const expected = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i++) expected[i] = i % 4 === 3 ? 255 : 255 - (src[i] ?? 0);
    e.renderer.setImage(bitmap);
    e.renderer.setLut(e.invertLut());
    e.renderer.render();
    return e.maxDiff(e.readPixels().data, expected);
  });
  expect(diff).toBeLessThanOrEqual(2);
});

test('domain other than 0..1 is honoured', async ({ page }) => {
  // Identity cube over domain 0..0.5: output = min(2 * input, 1).
  const diff = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const bitmap = await e.gradientBitmap(256, 192);
    const src = e.bitmapPixels(bitmap);
    const expected = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i++) {
      expected[i] = i % 4 === 3 ? 255 : Math.min(255, 2 * (src[i] ?? 0));
    }
    e.renderer.setImage(bitmap);
    e.renderer.setLut({ ...e.identityLut(17), domainMin: [0, 0, 0], domainMax: [0.5, 0.5, 0.5] });
    e.renderer.render();
    const scaled = e.maxDiff(e.readPixels().data, expected);

    // A non-zero domainMin: identity cube over domain 0.25..0.75 clamps input into that range.
    const clamped = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i++) {
      const t = ((src[i] ?? 0) / 255 - 0.25) / 0.5;
      clamped[i] = i % 4 === 3 ? 255 : Math.round(Math.min(1, Math.max(0, t)) * 255);
    }
    e.renderer.setLut({
      ...e.identityLut(17),
      domainMin: [0.25, 0.25, 0.25],
      domainMax: [0.75, 0.75, 0.75],
    });
    e.renderer.render();
    const offset = e.maxDiff(e.readPixels().data, clamped);
    return { scaled, offset };
  });
  expect(diff.scaled).toBeLessThanOrEqual(2);
  expect(diff.offset).toBeLessThanOrEqual(2);
});

test('before, after and split compare modes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const w = 200;
    const h = 100;
    const bitmap = await e.gradientBitmap(w, h);
    const src = e.bitmapPixels(bitmap);
    e.renderer.setImage(bitmap);
    e.renderer.setLut(e.invertLut());

    e.renderer.setCompare({ kind: 'before' });
    e.renderer.render();
    const before = e.maxDiff(e.readPixels().data, src);

    e.renderer.setCompare({ kind: 'after' });
    e.renderer.render();
    const after = e.readPixels().data;
    const afterVsSource = e.maxDiff(after, src);

    e.renderer.setCompare({ kind: 'split', x: 0.25 });
    e.renderer.render();
    const split = e.readPixels().data;
    // Left of x = before (source), right of x = after.
    const splitCol = w * 0.25;
    const expected = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from = x + 0.5 < splitCol ? src : after;
        for (let c = 0; c < 4; c++) expected[(y * w + x) * 4 + c] = from[(y * w + x) * 4 + c] ?? 0;
      }
    }
    return { before, afterVsSource, split: e.maxDiff(split, expected) };
  });
  expect(result.before).toBeLessThanOrEqual(1);
  expect(result.afterVsSource).toBeGreaterThan(50);
  expect(result.split).toBeLessThanOrEqual(1);
});

test('grain is deterministic and vignette darkens the corners, not the centre', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const flat = new OffscreenCanvas(300, 200);
    const ctx = flat.getContext('2d')!;
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, 300, 200);
    e.renderer.setImage(await createImageBitmap(flat));
    e.renderer.setLut(null);

    e.renderer.setSpatial({
      grainAmount: 60,
      grainSize: 20,
      vignetteAmount: 0,
      vignetteMidpoint: 50,
    });
    e.renderer.render();
    const first = e.readPixels().data;
    e.renderer.render();
    const second = e.readPixels().data;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < first.length; i += 4) {
      const v = first[i] ?? 0;
      sum += v;
      sumSq += v * v;
    }
    const n = first.length / 4;
    const mean = sum / n;
    const std = Math.sqrt(sumSq / n - mean * mean);

    e.renderer.setSpatial({
      grainAmount: 0,
      grainSize: 0,
      vignetteAmount: 80,
      vignetteMidpoint: 30,
    });
    e.renderer.render();
    const v = e.readPixels();
    const at = (x: number, y: number) => v.data[(y * v.width + x) * 4] ?? 0;
    return {
      identical: e.maxDiff(first, second),
      mean,
      std,
      centre: at(150, 100),
      corner: at(0, 0),
    };
  });
  expect(result.identical).toBe(0);
  expect(result.std).toBeGreaterThan(3);
  expect(Math.abs(result.mean - 128)).toBeLessThan(4);
  expect(result.centre).toBe(128);
  expect(result.corner).toBeLessThan(80);
});

test('exportFullRes matches the on-screen render across tile seams', async ({ page }) => {
  // 300x200 with 128 px tiles -> 3x2 tiles; grain + vignette depend on full-image position.
  const diff = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const renderer = e.resetRenderer({ maxTileSize: 128 });
    const bitmap = await e.gradientBitmap(300, 200);
    const lut = e.invertLut();
    const spatial = { grainAmount: 50, grainSize: 30, vignetteAmount: 60, vignetteMidpoint: 40 };
    renderer.setImage(bitmap);
    renderer.setLut(lut);
    renderer.setSpatial(spatial);
    renderer.render();
    const screen = e.readPixels().data;

    const blob = await renderer.exportFullRes(bitmap, lut, spatial, { type: 'image/png' });
    const decoded = await createImageBitmap(blob);
    return {
      size: [decoded.width, decoded.height],
      diff: e.maxDiff(e.bitmapPixels(decoded), screen),
    };
  });
  expect(diff.size).toEqual([300, 200]);
  expect(diff.diff).toBeLessThanOrEqual(1);
});

test('exportFullRes returns an 8000x6000 image for an 8000x6000 source', async ({ page }) => {
  test.setTimeout(120_000);
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const bitmap = await e.gradientBitmap(8000, 6000);
    e.renderer.setImage(await createImageBitmap(bitmap, { resizeWidth: 800, resizeHeight: 600 }));
    const blob = await e.renderer.exportFullRes(
      bitmap,
      e.invertLut(),
      {
        grainAmount: 20,
        grainSize: 20,
        vignetteAmount: 20,
        vignetteMidpoint: 50,
      },
      { type: 'image/jpeg', quality: 0.8 },
    );
    const decoded = await createImageBitmap(blob);
    return { type: blob.type, width: decoded.width, height: decoded.height };
  });
  expect(result).toEqual({ type: 'image/jpeg', width: 8000, height: 6000 });
});

test('EXIF orientation 6 displays upright', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const response = await fetch('./samples/orientation-6.jpg');
    const file = new File([await response.blob()], 'orientation-6.jpg', { type: 'image/jpeg' });
    const loaded = await e.loadImage(file);
    e.renderer.setImage(loaded.preview);
    e.renderer.setLut(null);
    e.renderer.render();
    const { width, height, data } = e.readPixels();
    const px = (x: number, y: number) =>
      Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3));
    return {
      size: [loaded.width, loaded.height, loaded.bitmap.width, loaded.bitmap.height],
      top: px(width / 2, 4),
      bottom: px(width / 2, height - 5),
    };
  });
  // Stored 64x32 (red left, blue right) rotated 90 degrees clockwise -> 32x64, red on top.
  expect(result.size).toEqual([32, 64, 32, 64]);
  expect(result.top[0]).toBeGreaterThan(200);
  expect(result.top[2]).toBeLessThan(60);
  expect(result.bottom[2]).toBeGreaterThan(200);
  expect(result.bottom[0]).toBeLessThan(60);
});

test('loadImage builds a preview with the long edge capped at 2048', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const source = await e.gradientBitmap(4000, 3000);
    const canvas = new OffscreenCanvas(4000, 3000);
    canvas.getContext('2d')!.drawImage(source, 0, 0);
    const file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'big.png', {
      type: 'image/png',
    });
    const loaded = await e.loadImage(file);
    return [loaded.width, loaded.height, loaded.preview.width, loaded.preview.height];
  });
  expect(result).toEqual([4000, 3000, 2048, 1536]);
});

test('recovers after WebGL context loss and restore', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const bitmap = await e.gradientBitmap(128, 96);
    const src = e.bitmapPixels(bitmap);
    e.renderer.setImage(bitmap);
    e.renderer.setLut(e.invertLut());
    e.renderer.render();
    const before = e.readPixels().data.slice();

    const gl = e.canvas.getContext('webgl2')!;
    const lose = gl.getExtension('WEBGL_lose_context')!;
    lose.loseContext();
    await new Promise((r) => setTimeout(r, 50));
    e.renderer.render(); // must not throw while lost
    lose.restoreContext();
    await new Promise((r) => setTimeout(r, 200));

    // The renderer re-renders itself on restore; render() again is also safe.
    e.renderer.render();
    const after = e.readPixels().data;
    return { restored: e.maxDiff(after, before), differsFromSource: e.maxDiff(after, src) };
  });
  expect(result.restored).toBeLessThanOrEqual(1);
  expect(result.differsFromSource).toBeGreaterThan(50);
});

test('setImage during context loss resizes the canvas on restore', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    e.renderer.setImage(await e.gradientBitmap(128, 96));
    e.renderer.setLut(null);
    e.renderer.render();

    const gl = e.canvas.getContext('webgl2')!;
    const lose = gl.getExtension('WEBGL_lose_context')!;
    lose.loseContext();
    await new Promise((r) => setTimeout(r, 50));

    const next = await e.gradientBitmap(64, 160);
    const expected = e.bitmapPixels(next);
    e.renderer.setImage(next); // stored only; GL is unavailable
    lose.restoreContext();
    await new Promise((r) => setTimeout(r, 200));

    const { width, height, data } = e.readPixels();
    return {
      canvas: [e.canvas.width, e.canvas.height],
      read: [width, height],
      diff: e.maxDiff(data, expected),
    };
  });
  expect(result.canvas).toEqual([64, 160]);
  expect(result.read).toEqual([64, 160]);
  expect(result.diff).toBeLessThanOrEqual(1);
});

test('perf: 2048 px preview + LUT frame time (logged, not gated)', async ({ page }, testInfo) => {
  const ms = await page.evaluate(async () => {
    const e = window.__lutEngine!;
    const bitmap = await e.gradientBitmap(2048, 1365);
    e.renderer.setImage(bitmap);
    e.renderer.setLut(e.identityLut(33));
    e.renderer.setSpatial({
      grainAmount: 30,
      grainSize: 30,
      vignetteAmount: 30,
      vignetteMidpoint: 50,
    });
    const gl = e.canvas.getContext('webgl2')!;
    const probe = new Uint8Array(4);
    // gl.finish() does not reliably block in Chrome; a 1 px readPixels forces the frame to complete.
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    const frames = 60;
    for (let i = 0; i < 5; i++) e.renderer.render(); // warm-up
    sync();
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      e.renderer.render();
      sync();
    }
    return (performance.now() - start) / frames;
  });
  console.log(`[perf] 2048x1365 + 33^3 LUT + grain + vignette: ${ms.toFixed(2)} ms/frame`);
  testInfo.annotations.push({ type: 'perf', description: `${ms.toFixed(2)} ms/frame` });
  expect(Number.isFinite(ms)).toBe(true);
});
