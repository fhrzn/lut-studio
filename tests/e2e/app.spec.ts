import { test, expect } from '@playwright/test';

test('app title renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('LUT Studio');
});
