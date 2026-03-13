import { db as prisma } from '@/lib/db';

export async function getAgentAnalytics(periodDays: number = 30) {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [runs, queueItems, pendingCount] = await Promise.all([
    prisma.agentRun.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.queueItem.findMany({
      where: { createdAt: { gte: since } },
      select: {
        agent: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        rejReason: true,
      },
    }),
    prisma.queueItem.count({ where: { status: 'pending' } }),
  ]);

  // Group runs by agent
  const agentMetrics: Record<string, {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalItemsCreated: number;
    approvalRate: number;
    avgReviewTimeMs: number;
    itemsByDay: { date: string; count: number }[];
  }> = {};

  const agentNames = [...new Set(runs.map((r) => r.agentName))];

  for (const name of agentNames) {
    const agentRuns = runs.filter((r) => r.agentName === name);
    const agentItems = queueItems.filter((q) => q.agent === name);
    const reviewed = agentItems.filter((q) => q.status !== 'pending');
    const approved = agentItems.filter((q) => q.status === 'approved');

    // Review time calculation
    const reviewTimes = reviewed
      .filter((q) => q.reviewedAt)
      .map((q) => q.reviewedAt!.getTime() - q.createdAt.getTime());
    const avgReviewTimeMs = reviewTimes.length > 0
      ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length
      : 0;

    // Items by day
    const dayMap = new Map<string, number>();
    for (const item of agentItems) {
      const day = item.createdAt.toISOString().split('T')[0];
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }

    agentMetrics[name] = {
      totalRuns: agentRuns.length,
      successfulRuns: agentRuns.filter((r) => r.status === 'completed').length,
      failedRuns: agentRuns.filter((r) => r.status === 'failed').length,
      totalItemsCreated: agentRuns.reduce((s, r) => s + r.itemsCreated, 0),
      approvalRate: reviewed.length > 0 ? approved.length / reviewed.length : 0,
      avgReviewTimeMs,
      itemsByDay: Array.from(dayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // Rejection reasons
  const rejReasons = queueItems
    .filter((q) => q.status === 'rejected' && q.rejReason)
    .reduce((acc, q) => {
      acc[q.rejReason!] = (acc[q.rejReason!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return {
    period: { start: since.toISOString(), end: new Date().toISOString() },
    agents: agentMetrics,
    overall: {
      totalItemsCreated: queueItems.length,
      totalItemsReviewed: queueItems.filter((q) => q.status !== 'pending').length,
      pendingBacklog: pendingCount,
      chainCompletionRate: 0,
      topRejectionReasons: Object.entries(rejReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
  };
}
