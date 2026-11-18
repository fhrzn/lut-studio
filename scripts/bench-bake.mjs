// Times a 10-layer bake at 33^3 in headless Chromium: `pnpm bench:bake`.
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const result = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve(root, 'scripts/bakeBench.ts'), formats: ['iife'], name: 'bakeBench' },
  },
});
const output = Array.isArray(result) ? result[0] : result;
const code = output.output[0].code;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // localhost counts as a secure context, which crypto.randomUUID (used by createLayer) needs.
  await page.route('http://localhost/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>bench</title>' }),
  );
  await page.goto('http://localhost/');
  await page.addScriptTag({ content: code });
  const stats = await page.evaluate(() => globalThis.benchBake(50));
  console.log(
    `${browser.version()}: ${stats.layers}-layer bake @33^3: median ${stats.median.toFixed(1)} ms, worst ${stats.max.toFixed(1)} ms`,
  );
} finally {
  await browser.close();
}
