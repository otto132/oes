import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { parsePagination } from '@/lib/schemas/pagination';

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const { name } = await ctx.params;
  const { cursor, limit } = parsePagination(req);

  const runs = await db.agentRun.findMany({
    where: { agentName: name },
    orderBy: { startedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = runs.length > limit;
  const data = hasMore ? runs.slice(0, limit) : runs;

  return NextResponse.json({
    data,
    meta: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
    },
  });
}
