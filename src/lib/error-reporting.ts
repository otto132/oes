/**
 * Client-side error reporting stub — no-op until Sentry is configured.
 * To enable, set NEXT_PUBLIC_SENTRY_DSN and install @sentry/nextjs.
 *
 * Usage:
 *   import { captureException, captureMessage } from '@/lib/error-reporting';
 *   captureException(error);
 *   captureMessage('Something unexpected happened');
 */

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  // Future: Sentry.captureException(error, { extra: context })
  if (process.env.NODE_ENV === 'development') {
    console.error('[error-reporting]', error, context);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (typeof window === 'undefined') return;

  // Future: Sentry.captureMessage(message, level)
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[error-reporting:${level}]`, message);
  }
}

/**
 * Global error boundary helper — call from ErrorBoundary componentDidCatch
 */
export function reportErrorBoundary(error: Error, componentStack: string): void {
  captureException(error, { componentStack });
}
