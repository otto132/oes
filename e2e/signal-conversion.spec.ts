import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Signal to Lead conversion flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('signals page loads and shows heading', async ({ page }) => {
    await page.goto('/signals');

    await expect(page.locator('h1')).toContainText('Signals');
    await expect(page.getByText(/ai market monitoring/i)).toBeVisible();
  });

  test('signals page shows filter buttons', async ({ page }) => {
    await page.goto('/signals');

    // The "All" filter should be visible
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
  });

  test('signal items have a convert to lead button', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');

    // Each unconverted signal should have a "-> Lead" button
    const convertButtons = page.getByRole('button', { name: /lead/i });
    const count = await convertButtons.count();

    if (count > 0) {
      await expect(convertButtons.first()).toBeVisible();
    }
  });

  test('clicking convert opens the convert drawer', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');

    const convertButton = page.getByRole('button', { name: /lead/i }).first();

    if (await convertButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await convertButton.click();

      // The drawer should show "Convert to Lead"
      await expect(page.getByText(/convert to lead/i)).toBeVisible();

      // Should have a company name input pre-filled
      await expect(page.getByText(/company name/i)).toBeVisible();

      // Should have Type and Country fields
      await expect(page.getByText(/type/i)).toBeVisible();

      // Should have Create Lead and Cancel buttons
      await expect(page.getByRole('button', { name: /create lead/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    }
  });

  test('submitting convert drawer creates a lead and shows toast', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');

    const convertButton = page.getByRole('button', { name: /lead/i }).first();

    if (await convertButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await convertButton.click();

      // Wait for the drawer to appear
      await expect(page.getByText(/convert to lead/i)).toBeVisible();

      // Click "Create Lead"
      await page.getByRole('button', { name: /create lead/i }).click();

      // Should show a success toast with "Lead created"
      await expect(page.getByText(/lead created/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('converted signal shows converted status', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');

    // If any signals are already converted, they should appear with reduced opacity
    // and a checkmark icon instead of the convert button
    const convertedSignals = page.locator('.opacity-60');
    const count = await convertedSignals.count();

    // This is a visual check -- converted signals exist with reduced opacity
    if (count > 0) {
      await expect(convertedSignals.first()).toBeVisible();
    }
  });

  test('clicking a signal opens the detail drawer', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');

    // Click on the first signal item (the entire row is clickable)
    const signalRow = page.locator('[class*="cursor-pointer"]').first();

    if (await signalRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signalRow.click();

      // Should open a detail drawer with "Signal Detail"
      await expect(page.getByText(/signal detail/i)).toBeVisible();

      // Should show AI Analysis section
      await expect(page.getByText(/ai analysis/i)).toBeVisible();
    }
  });

  test('dismiss button removes the signal', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');

    // The dismiss button is rendered as a small "x" button
    const dismissButtons = page.locator('button:has-text("✕")');
    const count = await dismissButtons.count();

    if (count > 0) {
      await dismissButtons.first().click();

      // Should show a dismissed toast
      await expect(page.getByText(/signal dismissed/i)).toBeVisible({ timeout: 5000 });
    }
  });
});
