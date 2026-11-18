// Regenerates public/samples/orientation-6.jpg: a 64x32 stored image (left half red, right half
// blue) tagged EXIF Orientation = 6, which must display as 32x64 with red on top, blue below.
// Usage: node scripts/generate-orientation-fixture.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage();
const base64 = await page.evaluate(async () => {
  const canvas = new OffscreenCanvas(64, 32);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f00';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#00f';
  ctx.fillRect(32, 0, 32, 32);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
});
await browser.close();

const jpeg = Buffer.from(base64, 'base64');
// APP1 "Exif" segment, big-endian TIFF, one IFD0 entry: Orientation (0x0112) SHORT = 6.
const app1 = Buffer.from([
  0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00,
  0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);
writeFileSync(
  new URL('../public/samples/orientation-6.jpg', import.meta.url),
  Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]),
);
