import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR';

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  VALIDATION_ERROR: 400,
};

/**
 * Return a standardised JSON error response.
 *
 *   { error: { code: 'NOT_FOUND', message: '...' } }
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  status?: number,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: status ?? DEFAULT_STATUS[code] },
  );
}

/* ── Convenience helpers ──────────────────────────── */

export function badRequest(message = 'Bad request') {
  return apiError('BAD_REQUEST', message);
}

export function unauthorized(message = 'Unauthorized') {
  return apiError('UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden') {
  return apiError('FORBIDDEN', message);
}

export function notFound(message = 'Not found') {
  return apiError('NOT_FOUND', message);
}

export function conflict(message = 'Conflict') {
  return apiError('CONFLICT', message);
}

export function internalError(message = 'Internal server error') {
  return apiError('INTERNAL_ERROR', message);
}

export function zodError(err: ZodError) {
  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR' as const,
        message: 'Validation failed',
        details: err.flatten().fieldErrors,
      },
    },
    { status: 400 },
  );
}
