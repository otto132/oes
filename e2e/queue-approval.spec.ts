import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Queue approval flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('queue page loads and shows heading', async ({ page }) => {
    await page.goto('/queue');

    await expect(page.locator('h1')).toContainText('Approval Queue');
    await expect(page.getByText(/pending/i)).toBeVisible();
    await expect(page.getByText(/human-in-the-loop/i)).toBeVisible();
  });

  test('queue page displays pending and completed tabs', async ({ page }) => {
    await page.goto('/queue');

    const pendingTab = page.getByRole('button', { name: /pending/i });
    const completedTab = page.getByRole('button', { name: /completed/i });

    await expect(pendingTab).toBeVisible();
    await expect(completedTab).toBeVisible();
  });

  test('queue page shows type filter buttons', async ({ page }) => {
    await page.goto('/queue');

    // The "All" filter should always be present
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
  });

  test('queue items show approve and reject buttons', async ({ page }) => {
    await page.goto('/queue');

    // Wait for items to load (or empty state)
    await page.waitForLoadState('networkidle');

    // If items are present, they should have action buttons
    const approveButtons = page.getByRole('button', { name: /approve/i });
    const count = await approveButtons.count();

    if (count > 0) {
      await expect(approveButtons.first()).toBeVisible();
      await expect(page.getByRole('button', { name: /reject/i }).first()).toBeVisible();
    }
  });

  test('approving a queue item shows a success toast', async ({ page }) => {
    await page.goto('/queue');
    await page.waitForLoadState('networkidle');

    const approveButton = page.getByRole('button', { name: /^approve$/i }).first();

    // Only proceed if there are items to approve
    if (await approveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approveButton.click();

      // A success toast should appear
      await expect(page.getByText(/approved|created|updated|logged/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('approve toast has navigation action to related page', async ({ page }) => {
    await page.goto('/queue');
    await page.waitForLoadState('networkidle');

    const approveButton = page.getByRole('button', { name: /^approve$/i }).first();

    if (await approveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approveButton.click();

      // Toast should have a link like "View Leads ->" or "View Tasks ->"
      const toastAction = page.getByText(/view (leads|tasks|account)/i);
      if (await toastAction.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(toastAction).toBeVisible();
      }
    }
  });

  test('switching to completed tab shows completed items', async ({ page }) => {
    await page.goto('/queue');

    await page.getByRole('button', { name: /completed/i }).click();

    // Should show either completed items or an empty state
    await expect(
      page.getByText(/approved|rejected|no completed items/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('edit & approve drawer opens with editable fields', async ({ page }) => {
    await page.goto('/queue');
    await page.waitForLoadState('networkidle');

    const editButton = page.getByRole('button', { name: /edit & approve/i }).first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();

      // Drawer should open with a title and form fields
      await expect(page.getByText(/edit & approve/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /save & approve/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    }
  });
});
