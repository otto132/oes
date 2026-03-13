import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { parsePagination } from '@/lib/schemas/pagination';

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await ctx.params;
  const { cursor, limit } = parsePagination(req);

  const runs = await prisma.agentRun.findMany({
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
