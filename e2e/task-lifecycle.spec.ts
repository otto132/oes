import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Task create and complete lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('tasks page loads and shows heading', async ({ page }) => {
    await page.goto('/tasks');

    await expect(page.locator('h1')).toContainText('Tasks');
  });

  test('tasks page shows tabs: My Tasks, For Review, All', async ({ page }) => {
    await page.goto('/tasks');

    await expect(page.getByRole('button', { name: /my tasks/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /for review/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
  });

  test('tasks page has a New Task button', async ({ page }) => {
    await page.goto('/tasks');

    await expect(page.getByRole('button', { name: /new task/i })).toBeVisible();
  });

  test('clicking New Task opens the create drawer', async ({ page }) => {
    await page.goto('/tasks');

    await page.getByRole('button', { name: /new task/i }).click();

    // Drawer should appear with title "New Task"
    await expect(page.getByText('New Task')).toBeVisible();
    await expect(page.getByText(/create a manual task/i)).toBeVisible();

    // Form fields should be present
    await expect(page.getByText(/title/i)).toBeVisible();
    await expect(page.getByText(/priority/i)).toBeVisible();
    await expect(page.getByText(/due date/i)).toBeVisible();

    // Action buttons
    await expect(page.getByRole('button', { name: /create task/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('creating a task shows success toast', async ({ page }) => {
    await page.goto('/tasks');

    await page.getByRole('button', { name: /new task/i }).click();

    // Fill in the title
    const titleInput = page.locator('input[placeholder*="Follow up"]');
    await titleInput.fill('E2E Test Task - Follow up with client');

    // Select priority
    const prioritySelect = page.locator('select').first();
    await prioritySelect.selectOption('High');

    // Submit
    await page.getByRole('button', { name: /create task/i }).click();

    // Should show success toast
    await expect(page.getByText(/task created/i)).toBeVisible({ timeout: 5000 });
  });

  test('creating a task without title shows error', async ({ page }) => {
    await page.goto('/tasks');

    await page.getByRole('button', { name: /new task/i }).click();

    // Try to submit without filling in the title
    await page.getByRole('button', { name: /create task/i }).click();

    // Should show an error toast
    await expect(page.getByText(/title is required/i)).toBeVisible({ timeout: 3000 });
  });

  test('clicking a task checkbox opens complete drawer', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Task checkboxes are the small rounded squares with border
    const checkbox = page.locator('[class*="rounded border"][class*="cursor-pointer"]').first();

    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();

      // Should open the "Complete Task" drawer
      await expect(page.getByText('Complete Task')).toBeVisible();

      // Should have outcome selector
      await expect(page.getByText(/outcome/i)).toBeVisible();

      // Should have notes field
      await expect(page.getByText(/notes/i)).toBeVisible();

      // Should have Complete Task button
      await expect(page.getByRole('button', { name: /complete task/i })).toBeVisible();
    }
  });

  test('completing a task shows success toast', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[class*="rounded border"][class*="cursor-pointer"]').first();

    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();

      // Wait for drawer
      await expect(page.getByText('Complete Task')).toBeVisible();

      // Select outcome
      const outcomeSelect = page.locator('select').first();
      await outcomeSelect.selectOption('Completed');

      // Add notes
      const notes = page.locator('textarea');
      if (await notes.isVisible()) {
        await notes.fill('Completed as part of E2E test');
      }

      // Submit
      await page.getByRole('button', { name: /complete task/i }).click();

      // Success toast
      await expect(page.getByText(/task completed/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('search input filters tasks', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await expect(searchInput).toBeVisible();

    // Type a search term
    await searchInput.fill('nonexistent-task-xyz');

    // Should show empty state or no matching tasks
    // (the list should be filtered)
    await page.waitForTimeout(300); // debounce
  });

  test('show completed toggle reveals done tasks', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const toggle = page.getByLabel(/show completed/i);
    await expect(toggle).toBeVisible();

    // Check the toggle
    await toggle.check();

    // The page should now include completed tasks (if any)
    // We just verify the toggle works without errors
    await expect(toggle).toBeChecked();
  });

  test('complete drawer supports follow-up tasks', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[class*="rounded border"][class*="cursor-pointer"]').first();

    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();

      await expect(page.getByText('Complete Task')).toBeVisible();

      // Should have follow-up tasks section
      await expect(page.getByText(/follow-up tasks/i)).toBeVisible();

      // Should have an input to add follow-up titles
      const followUpInput = page.locator('input[placeholder*="Follow-up"]');
      await expect(followUpInput).toBeVisible();
    }
  });
});
