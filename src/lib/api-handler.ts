import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { auth } from '@/lib/auth';
import { unauthorized, internalError, zodError, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { scopedDb, ScopedDb, AccessDeniedError } from '@/lib/scoped-db';
import { Prisma } from '@prisma/client';

export interface HandlerContext<T> {
  body: T;
  session: { user: { id: string; name?: string; role?: string; tenantId?: string } };
  pagination: { cursor?: string; limit: number };
  db: ScopedDb;
}

export function withHandler<T = unknown>(
  schema: ZodSchema<T> | null,
  handler: (req: NextRequest, ctx: HandlerContext<T>) => Promise<NextResponse>,
) {
  return async (req: NextRequest) => {
    const requestId = crypto.randomUUID();
    try {
      const session = await auth();
      if (!session?.user?.id) {
        const resp = unauthorized();
        resp.headers.set('x-request-id', requestId);
        return resp;
      }

      const scopedClient = scopedDb(
        session.user.id,
        (session.user as { role?: string }).role ?? 'VIEWER',
      );

      const url = req.nextUrl;
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const limit = Math.min(Math.max(rawLimit || 50, 1), 100);

      let body: T = undefined as T;
      if (schema && req.method !== 'GET') {
        const raw = await req.json();
        body = schema.parse(raw);
      }

      const response = await handler(req, {
        body,
        session: {
          user: {
            id: session.user.id,
            name: session.user.name ?? undefined,
            role: (session.user as { role?: string }).role ?? undefined,
            tenantId: (session.user as { tenantId?: string }).tenantId ?? undefined,
          },
        },
        pagination: { cursor, limit },
        db: scopedClient,
      });
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (err) {
      if (err instanceof ZodError) {
        const resp = zodError(err, requestId);
        resp.headers.set('x-request-id', requestId);
        return resp;
      }
      // Handle scopedDb ownership check failures
      if (err instanceof AccessDeniedError) {
        const resp = notFound('Record not found or access denied');
        resp.headers.set('x-request-id', requestId);
        return resp;
      }
      // Transform Prisma errors — don't leak schema details
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        logger.error('Prisma error', {
          requestId,
          code: err.code,
          meta: err.meta,
        });
        const resp = internalError();
        resp.headers.set('x-request-id', requestId);
        return resp;
      }
      logger.error('API handler error', {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      const resp = internalError();
      resp.headers.set('x-request-id', requestId);
      return resp;
    }
  };
}
