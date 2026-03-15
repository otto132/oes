/**
 * Analytics stub — no-op in development.
 * To enable, set NEXT_PUBLIC_ANALYTICS_PROVIDER to 'posthog' or 'mixpanel'
 * and configure the corresponding env vars (NEXT_PUBLIC_POSTHOG_KEY, etc.)
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *   analytics.track('lead_created', { source: 'import' });
 *   analytics.identify(userId, { role: 'ADMIN' });
 *   analytics.page('/dashboard');
 */

type Properties = Record<string, string | number | boolean | null | undefined>;

interface AnalyticsClient {
  track(event: string, properties?: Properties): void;
  identify(userId: string, traits?: Properties): void;
  page(path?: string, properties?: Properties): void;
}

const noop: AnalyticsClient = {
  track() {},
  identify() {},
  page() {},
};

function createClient(): AnalyticsClient {
  if (typeof window === 'undefined') return noop;

  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;
  if (!provider) return noop;

  // Future: initialize PostHog/Mixpanel here based on provider
  // For now, log to console in development
  if (process.env.NODE_ENV === 'development') {
    return {
      track(event, properties) {
        console.debug('[analytics:track]', event, properties);
      },
      identify(userId, traits) {
        console.debug('[analytics:identify]', userId, traits);
      },
      page(path, properties) {
        console.debug('[analytics:page]', path, properties);
      },
    };
  }

  return noop;
}

export const analytics = createClient();
