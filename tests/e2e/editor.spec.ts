import { expect, test, type Page } from '@playwright/test';

const PHOTO = 'public/samples/orientation-6.jpg';
const GOOD_CUBE = 'src/lut/__fixtures__/identity-17.cube';
const BAD_CUBE = 'src/lut/__fixtures__/bad-size.cube';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('./');
});

const rows = (page: Page) => page.getByTestId('layer-row');

async function addLayer(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: '+ Add layer' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

async function openPhoto(page: Page): Promise<void> {
  await page.getByTestId('image-input').setInputFiles(PHOTO);
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  await expect(page.getByTestId('image-box')).toHaveCSS('visibility', 'visible');
}

test('opening a JPEG shows it fit-to-window and upright', async ({ page }) => {
  await openPhoto(page);

  // EXIF orientation 6: the 64x32 file is 32x64 once upright, red on top, blue below.
  const box = await page.getByTestId('image-box').boundingBox();
  const stage = page.viewportSize()!;
  expect(box!.height).toBeGreaterThan(box!.width);
  expect(box!.height / box!.width).toBeCloseTo(2, 1);
  expect(box!.height).toBeLessThanOrEqual(stage.height); // fits the window

  await expect
    .poll(() =>
      page.getByTestId('preview-canvas').evaluate((canvas: HTMLCanvasElement) => {
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(canvas, 0, 0);
        const top = ctx.getImageData(canvas.width / 2, 4, 1, 1).data;
        const bottom = ctx.getImageData(canvas.width / 2, canvas.height - 4, 1, 1).data;
        return [top[0]! > 200 && top[2]! < 60, bottom[2]! > 200 && bottom[0]! < 60];
      }),
    )
    .toEqual([true, true]);
});

test('an unsupported file shows an error and keeps the editor usable', async ({ page }) => {
  await page.getByTestId('image-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByRole('alert')).toContainText('not a supported image');
  await openPhoto(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('every layer type can be added, hidden, reordered and deleted', async ({ page }) => {
  const labels = [
    'Exposure',
    'White balance',
    'Contrast',
    'Tone curve',
    'HSL',
    'Split toning',
    'Saturation / vibrance',
    'Fade',
    'Monochrome mixer',
    'LUT',
  ];
  for (const label of labels) {
    await addLayer(page, label);
    await expect(page.getByRole('region', { name: `${label} controls` })).toBeVisible();
  }
  await expect(rows(page)).toHaveCount(labels.length);

  const hide = page.getByRole('button', { name: 'Hide Fade' });
  await hide.click();
  await expect(page.getByRole('button', { name: 'Show Fade' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.getByRole('button', { name: 'Move Fade up' }).click();
  await expect(rows(page).nth(6)).toContainText('Fade');
  await expect(rows(page).nth(7)).toContainText('Saturation');

  for (const label of labels) {
    await page.getByRole('button', { name: `Delete ${label}`, exact: true }).click();
  }
  await expect(rows(page)).toHaveCount(0);
});

test('open image, add exposure + curve + LUT, reorder, save, reload', async ({ page }) => {
  await openPhoto(page);

  await addLayer(page, 'Exposure');
  await page.getByRole('textbox', { name: 'Exposure (EV) value' }).fill('1.5');
  await page.getByRole('textbox', { name: 'Exposure (EV) value' }).press('Enter');
  await expect(page.getByRole('slider', { name: 'Exposure (EV)' })).toHaveValue('1.5');

  await addLayer(page, 'Tone curve');
  // Add a point by clicking the curve, then drag it.
  const svg = page.getByRole('group', { name: /curve editor/ });
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('slider', { name: 'Point 2' })).toBeVisible();
  await page.getByRole('slider', { name: 'Point 2' }).press('ArrowUp');

  await addLayer(page, 'LUT');
  await page.getByTestId('cube-input').setInputFiles(GOOD_CUBE);
  await expect(page.getByTestId('lut-name')).toHaveText('identity-17');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await expect(rows(page)).toHaveText([/Exposure/, /Tone curve/, /LUT/]);
  await expect(page.getByTestId('save-state')).toHaveText('● Unsaved changes');

  // Reorder with the keyboard: LUT to the top.
  await rows(page).nth(2).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(rows(page)).toHaveText([/LUT/, /Exposure/, /Tone curve/]);
  await expect(rows(page).nth(0)).toBeFocused();

  // Save with a name.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save recipe' });
  await dialog.getByLabel('Recipe name').fill('Warm test');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');

  await page.reload();

  await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue('Warm test');
  await expect(rows(page)).toHaveText([/LUT/, /Exposure/, /Tone curve/]);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await rows(page).nth(0).click();
  await expect(page.getByTestId('lut-name')).toHaveText('identity-17');
  await rows(page).nth(1).click();
  await expect(page.getByRole('slider', { name: 'Exposure (EV)' })).toHaveValue('1.5');
  await rows(page).nth(2).click();
  await expect(page.getByRole('slider', { name: /^Point/ })).toHaveCount(3);
  // The reloaded recipe also appears in the recipe picker.
  await expect(page.getByRole('combobox', { name: 'Open recipe' })).toContainText('Warm test');
});

test('a malformed .cube shows an error and does not crash', async ({ page }) => {
  await openPhoto(page);
  await addLayer(page, 'LUT');
  await page.getByTestId('cube-input').setInputFiles(BAD_CUBE);
  await expect(page.getByRole('alert')).toContainText('Could not import "bad-size.cube"');
  await expect(page.getByTestId('lut-name')).toHaveText('No LUT loaded');
  // The editor still works, and a good file replaces the error.
  await page.getByTestId('cube-input').setInputFiles(GOOD_CUBE);
  await expect(page.getByTestId('lut-name')).toHaveText('identity-17');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('before/after toggle and split divider work with mouse and keyboard', async ({ page }) => {
  await openPhoto(page);
  const toggle = page.getByRole('button', { name: /^Before/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('\\');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('\\');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();

  await page.getByRole('button', { name: 'Split view' }).click();
  const divider = page.getByRole('slider', { name: 'Before/after divider' });
  await expect(divider).toHaveAttribute('aria-valuenow', '50');

  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '51');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '41');
  await page.keyboard.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '0');

  const image = (await page.getByTestId('image-box').boundingBox())!;
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width * 0.75, image.y + image.height / 2, { steps: 5 });
  await page.mouse.up();
  const value = Number(await divider.getAttribute('aria-valuenow'));
  expect(value).toBeGreaterThan(70);
  expect(value).toBeLessThan(80);
});

test('undo/redo covers layer edits; a slider drag is one step', async ({ page }) => {
  await addLayer(page, 'Contrast');
  const slider = page.getByRole('slider', { name: 'Contrast', exact: true });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const dragged = await slider.inputValue();
  expect(Number(dragged)).toBeGreaterThan(50);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(slider).toHaveValue('0'); // the whole drag, not the last mouse move
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(slider).toHaveValue(dragged);

  await slider.dblclick();
  await expect(slider).toHaveValue('0');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(slider).toHaveValue(dragged);

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(rows(page)).toHaveCount(1);
});

test('sliders respond to arrow keys and the spatial panel edits the recipe', async ({ page }) => {
  await addLayer(page, 'Exposure');
  const slider = page.getByRole('slider', { name: 'Exposure (EV)' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('0.1');

  const grain = page.getByRole('slider', { name: 'Grain amount' });
  await grain.focus();
  await page.keyboard.press('End');
  await expect(grain).toHaveValue('100');
  await expect(page.getByRole('textbox', { name: 'Grain amount value' })).toHaveValue('100');
});
