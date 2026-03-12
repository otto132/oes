/**
 * Structured JSON logger for Eco-Insight.
 *
 * Outputs one JSON object per line to stdout/stderr, compatible with
 * Vercel log drain and any structured-logging pipeline.
 *
 * Zero external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

interface ApiLogInfo {
  method: string;
  path: string;
  status: number;
  duration: number;
  userId?: string | null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Minimum level that will actually be emitted.
 * Reads LOG_LEVEL env var at call-time so it can be changed without restart
 * in serverless environments.
 */
function minLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (env in LEVEL_PRIORITY) return env as LogLevel;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel()];
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Public API – general-purpose logger
// ---------------------------------------------------------------------------

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    emit("debug", message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    emit("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    emit("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    emit("error", message, meta);
  },
};

// ---------------------------------------------------------------------------
// Public API – API-specific helpers
// ---------------------------------------------------------------------------

/**
 * Log a completed API request with standard fields.
 */
export function apiLogger(info: ApiLogInfo): void {
  const level: LogLevel = info.status >= 500 ? "error" : info.status >= 400 ? "warn" : "info";

  emit(level, "API request", {
    method: info.method,
    path: info.path,
    status: info.status,
    duration: info.duration,
    ...(info.userId != null ? { userId: info.userId } : {}),
  });
}

/**
 * Wrap a Next.js-style API handler so that every invocation is automatically
 * logged with method, path, status, duration, and (optionally) userId.
 *
 * Usage in an App Router route handler:
 *
 * ```ts
 * import { withApiLogging } from "@/lib/logger";
 *
 * export const GET = withApiLogging(async (request) => {
 *   return Response.json({ ok: true });
 * });
 * ```
 *
 * The wrapper extracts `userId` from the response header `x-user-id` if
 * present (set it in your handler if you want it logged), or you can supply
 * a custom `getUserId` function via options.
 */
export function withApiLogging<
  T extends (request: Request, context?: unknown) => Promise<Response> | Response,
>(
  handler: T,
  options?: {
    /** Pull a userId from the request for inclusion in the log line. */
    getUserId?: (request: Request) => string | null | undefined;
  },
): T {
  const wrapped = async (request: Request, context?: unknown): Promise<Response> => {
    const start = performance.now();
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    let response: Response;
    try {
      response = await handler(request, context);
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      const userId = options?.getUserId?.(request) ?? null;

      apiLogger({ method, path, status: 500, duration, userId });
      logger.error("Unhandled route error", {
        method,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const duration = Math.round(performance.now() - start);
    const userId =
      options?.getUserId?.(request) ?? response.headers.get("x-user-id") ?? null;

    apiLogger({ method, path, status: response.status, duration, userId });

    return response;
  };

  return wrapped as unknown as T;
}
