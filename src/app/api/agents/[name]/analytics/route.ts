import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await ctx.params;
  const period = req.nextUrl.searchParams.get('period') || '30d';
  const days = parseInt(period.replace('d', ''), 10) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [runs, items] = await Promise.all([
    prisma.agentRun.findMany({
      where: { agentName: name, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.queueItem.findMany({
      where: { agent: name, createdAt: { gte: since } },
      select: { status: true, createdAt: true, reviewedAt: true, rejReason: true },
    }),
  ]);

  const reviewed = items.filter((q) => q.status !== 'pending');
  const approved = items.filter((q) => q.status === 'approved');

  return NextResponse.json({
    data: {
      totalRuns: runs.length,
      successfulRuns: runs.filter((r) => r.status === 'completed').length,
      failedRuns: runs.filter((r) => r.status === 'failed').length,
      totalItemsCreated: runs.reduce((s, r) => s + r.itemsCreated, 0),
      approvalRate: reviewed.length > 0 ? approved.length / reviewed.length : 0,
    },
  });
}
