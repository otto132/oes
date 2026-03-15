/**
 * Simple in-memory sliding-window rate limiter.
 * For production at scale, swap for Redis-backed (e.g. @upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000);

interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSec * 1000;

  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, config.limit - entry.count);
  const success = entry.count <= config.limit;

  return { success, limit: config.limit, remaining, reset: entry.resetAt };
}

export function rateLimitResponse(result: RateLimitResult) {
  return new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
      'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
    },
  });
}
