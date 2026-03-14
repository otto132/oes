import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden } from '@/lib/api-errors';
import { resolveTenantDb } from '@/lib/tenant';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if ((session.user as any).role !== 'ADMIN') return forbidden();

  const db = resolveTenantDb(session as any);

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      accountCount,
      leadCount,
      oppCount,
      taskCount,
      contactCount,
      pendingQueue,
      totalQueue,
      lastSync,
      agentLastRuns,
      syncErrors,
      agentErrors,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
      db.account.count(),
      db.lead.count(),
      db.opportunity.count(),
      db.task.count(),
      db.contact.count(),
      db.queueItem.count({ where: { status: 'pending' } }),
      db.queueItem.count(),
      db.syncLog.findFirst({ orderBy: { completedAt: 'desc' }, where: { completedAt: { not: null } } }),
      db.agentRun.findMany({
        where: { status: { not: 'running' } },
        distinct: ['agentName'],
        orderBy: { completedAt: 'desc' },
        select: { agentName: true, status: true, completedAt: true },
      }),
      db.syncLog.findMany({
        where: { status: { in: ['failed', 'partial'] } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { errors: true, completedAt: true, startedAt: true },
      }),
      db.agentRun.findMany({
        where: { status: 'failed' },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { agentName: true, errors: true, completedAt: true },
      }),
    ]);

    // Normalize errors from both sources
    const recentErrors: { source: string; agentName?: string; message: string; createdAt: string }[] = [];

    for (const sl of syncErrors) {
      for (const errMsg of sl.errors) {
        recentErrors.push({
          source: 'sync',
          message: errMsg,
          createdAt: (sl.completedAt ?? sl.startedAt).toISOString(),
        });
      }
    }

    for (const ar of agentErrors) {
      const errs = Array.isArray(ar.errors) ? ar.errors : [];
      for (const e of errs as { message?: string }[]) {
        recentErrors.push({
          source: 'agent',
          agentName: ar.agentName,
          message: typeof e === 'string' ? e : e?.message ?? 'Unknown error',
          createdAt: ar.completedAt?.toISOString() ?? new Date().toISOString(),
        });
      }
    }

    // Sort by date desc and take 10
    recentErrors.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    recentErrors.splice(10);

    return NextResponse.json({
      db: 'connected',
      users: { total: totalUsers, active: activeUsers },
      entities: {
        accounts: accountCount,
        leads: leadCount,
        opportunities: oppCount,
        tasks: taskCount,
        contacts: contactCount,
      },
      queue: { pending: pendingQueue, total: totalQueue },
      sync: {
        lastRun: lastSync
          ? {
              status: lastSync.status,
              completedAt: lastSync.completedAt?.toISOString() ?? null,
              itemsSynced: lastSync.itemsSynced,
              errors: lastSync.errors.length,
            }
          : null,
      },
      agents: {
        lastRuns: agentLastRuns.map((r) => ({
          agentName: r.agentName,
          status: r.status,
          completedAt: r.completedAt?.toISOString() ?? null,
        })),
      },
      recentErrors,
    });
  } catch {
    return NextResponse.json({
      db: 'error',
      users: { total: 0, active: 0 },
      entities: { accounts: 0, leads: 0, opportunities: 0, tasks: 0, contacts: 0 },
      queue: { pending: 0, total: 0 },
      sync: { lastRun: null },
      agents: { lastRuns: [] },
      recentErrors: [],
    });
  }
}
