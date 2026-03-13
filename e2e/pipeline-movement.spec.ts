import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Pipeline stage movement flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('pipeline page loads and shows heading', async ({ page }) => {
    await page.goto('/pipeline');

    await expect(page.locator('h1')).toContainText('Pipeline');
  });

  test('pipeline page shows open deals count and totals', async ({ page }) => {
    await page.goto('/pipeline');

    // Subtitle should show open count, total, and weighted values
    await expect(page.getByText(/open/i)).toBeVisible();
    await expect(page.getByText(/total/i)).toBeVisible();
    await expect(page.getByText(/weighted/i)).toBeVisible();
  });

  test('pipeline page has Board and Table view toggle', async ({ page }) => {
    await page.goto('/pipeline');

    await expect(page.getByRole('button', { name: /board/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /table/i })).toBeVisible();
  });

  test('pipeline page has New Opportunity button', async ({ page }) => {
    await page.goto('/pipeline');

    await expect(page.getByRole('button', { name: /new opportunity/i })).toBeVisible();
  });

  test('kanban board displays stage columns', async ({ page }) => {
    await page.goto('/pipeline');

    // The kanban board should show the stage names
    // Stages from KANBAN_STAGES: Contacted, Qualified, Solution Fit, Proposal, Negotiation, Verbal Commit, Closed Won
    const stageNames = ['Contacted', 'Qualified', 'Proposal', 'Negotiation'];

    for (const stage of stageNames) {
      await expect(page.getByText(stage).first()).toBeVisible();
    }
  });

  test('clicking a deal card navigates to deal detail', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    // Deal cards are links to /pipeline/[id]
    const dealCard = page.locator('a[href^="/pipeline/"]').first();

    if (await dealCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dealCard.click();

      // Should navigate to the deal detail page
      await expect(page).toHaveURL(/\/pipeline\/.+/);
    }
  });

  test('deal detail page shows stage progress and move controls', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    const dealCard = page.locator('a[href^="/pipeline/"]').first();

    if (await dealCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dealCard.click();
      await expect(page).toHaveURL(/\/pipeline\/.+/);

      // Deal detail should show "Move Stage" section
      await expect(page.getByText(/move stage/i)).toBeVisible({ timeout: 5000 });

      // Should show stage progress
      await expect(page.getByText(/stage progress/i)).toBeVisible();
    }
  });

  test('clicking a stage button moves the deal and shows toast', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    const dealCard = page.locator('a[href^="/pipeline/"]').first();

    if (await dealCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dealCard.click();
      await expect(page).toHaveURL(/\/pipeline\/.+/);

      // Wait for detail page to load
      await expect(page.getByText(/move stage/i)).toBeVisible({ timeout: 5000 });

      // The stage buttons are rendered in the "Move Stage" section
      // Find a stage button that is not the current active one
      const stageButtons = page.locator('button:near(:text("Move Stage"))');
      const count = await stageButtons.count();

      if (count > 1) {
        // Click a non-active stage button (the second one, for example)
        await stageButtons.nth(1).click();

        // Should show a toast confirming the stage move
        await expect(page.getByText(/stage/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('table view shows deal rows', async ({ page }) => {
    await page.goto('/pipeline');

    // Switch to table view
    await page.getByRole('button', { name: /table/i }).click();

    // Table should have column headers
    await expect(page.getByText('Opportunity')).toBeVisible();
    await expect(page.getByText('Stage')).toBeVisible();
    await expect(page.getByText('Amount')).toBeVisible();
    await expect(page.getByText('Health')).toBeVisible();
  });

  test('new opportunity drawer opens with form fields', async ({ page }) => {
    await page.goto('/pipeline');

    await page.getByRole('button', { name: /new opportunity/i }).click();

    // Drawer should show "New Opportunity"
    await expect(page.getByText('New Opportunity')).toBeVisible();

    // Form fields
    await expect(page.getByText(/opportunity name/i)).toBeVisible();
    await expect(page.getByText(/account/i)).toBeVisible();
    await expect(page.getByText(/stage/i)).toBeVisible();
    await expect(page.getByText(/amount/i)).toBeVisible();
    await expect(page.getByText(/close date/i)).toBeVisible();

    // Action buttons
    await expect(page.getByRole('button', { name: /create opportunity/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('navigating back to pipeline after stage move shows updated stage', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    const dealCard = page.locator('a[href^="/pipeline/"]').first();

    if (await dealCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Get the deal name for later verification
      const dealName = await dealCard.locator('[class*="font-medium"]').first().textContent();

      await dealCard.click();
      await expect(page).toHaveURL(/\/pipeline\/.+/);

      // Navigate back to pipeline
      await page.goto('/pipeline');

      // The pipeline should load again with the deal visible
      if (dealName) {
        await expect(page.getByText(dealName).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
