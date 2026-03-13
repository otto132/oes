import { type Page, type BrowserContext } from '@playwright/test';

/**
 * Bypass authentication for E2E tests.
 *
 * In a real test environment, this would either:
 * 1. Set a test session cookie that the server recognizes
 * 2. Use a test-only auth endpoint
 * 3. Seed a session token in the database
 *
 * For now this sets the next-auth session cookie with a test token.
 * The server should check for NEXT_PUBLIC_E2E_TEST=true and accept
 * this token without validating against the OAuth provider.
 */
export async function loginAsTestUser(page: Page) {
  // Set a mock session cookie that the app recognizes in test mode.
  // This requires the server to be started with E2E_TEST=true which
  // skips real OAuth validation and accepts this session token.
  await page.context().addCookies([
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
}

/**
 * Store authenticated state so it can be reused across tests.
 * Call this once in a global setup, then load the state in each test.
 */
export async function saveAuthState(context: BrowserContext, path: string) {
  await context.storageState({ path });
}

/**
 * Default test user info matching the seeded test database user.
 */
export const TEST_USER = {
  id: 'e2e-test-user-id',
  name: 'Test User',
  email: 'test@eco-insight.test',
  role: 'admin',
} as const;
