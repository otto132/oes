import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { auth } from '@/lib/auth';
import { unauthorized, internalError, zodError } from '@/lib/api-errors';

export interface HandlerContext<T> {
  body: T;
  session: { user: { id: string; name?: string; role?: string } };
  pagination: { cursor?: string; limit: number };
}

export function withHandler<T = unknown>(
  schema: ZodSchema<T> | null,
  handler: (req: NextRequest, ctx: HandlerContext<T>) => Promise<NextResponse>,
) {
  return async (req: NextRequest) => {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();

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
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return zodError(err);
      }
      console.error('API error:', err);
      return internalError();
    }
  };
}
