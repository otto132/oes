import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { auth } from '@/lib/auth';
import { unauthorized, internalError, zodError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { scopedDb, ScopedDb } from '@/lib/scoped-db';

export interface HandlerContext<T> {
  body: T;
  session: { user: { id: string; name?: string; role?: string } };
  pagination: { cursor?: string; limit: number };
  db: ScopedDb;
}

export function withHandler<T = unknown>(
  schema: ZodSchema<T> | null,
  handler: (req: NextRequest, ctx: HandlerContext<T>) => Promise<NextResponse>,
) {
  return async (req: NextRequest) => {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();

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

      return await handler(req, {
        body,
        session: {
          user: {
            id: session.user.id,
            name: session.user.name ?? undefined,
            role: (session.user as { role?: string }).role ?? undefined,
          },
        },
        pagination: { cursor, limit },
        db: scopedClient,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return zodError(err);
      }
      logger.error('API handler error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return internalError();
    }
  };
}
