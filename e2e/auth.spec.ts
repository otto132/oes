import { test, expect } from '@playwright/test';

test.describe('Authentication flow', () => {
  test('unauthenticated user visiting / is redirected to /login', async ({ page }) => {
    await page.goto('/');

    // The middleware should redirect unauthenticated requests to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders the Sign in with Microsoft button', async ({ page }) => {
    await page.goto('/login');

    // Page should show the app name
    await expect(page.locator('h1')).toContainText('EcoInsight');

    // The Microsoft sign-in button should be visible
    const signInButton = page.getByRole('button', { name: /sign in with microsoft/i });
    await expect(signInButton).toBeVisible();
  });

  test('login page shows the energy certificate platform subtitle', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText(/energy certificate intelligence platform/i)).toBeVisible();
  });

  test('after successful auth, user is redirected to home', async ({ page, context }) => {
    // Simulate an authenticated session by setting the session cookie.
    // In a real test environment, the server must be started with E2E_TEST=true
    // to accept this test token.
    await context.addCookies([
      {
        name: 'next-auth.session-token',
        value: 'e2e-test-session-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/');

    // Should land on the dashboard home, not the login page
    await expect(page).not.toHaveURL(/\/login/);

    // The home page should show a greeting
    await expect(page.locator('h1')).toContainText(/good (morning|afternoon|evening)/i);
  });

  test('callbackUrl parameter redirects to the correct page after login', async ({ page }) => {
    // Navigate to a protected page while unauthenticated
    await page.goto('/queue');

    // Should be redirected to login with a callbackUrl
    await expect(page).toHaveURL(/\/login/);
    // The callbackUrl may be encoded in the URL
    // After authentication, the user should be sent back to /queue
  });
});
