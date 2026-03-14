import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const configs = await db.agentConfig.findMany({
    orderBy: { name: 'asc' },
  });

  // Get last run for each agent
  const lastRuns = await db.agentRun.findMany({
    where: {
      agentName: { in: configs.map((c) => c.name) },
    },
    orderBy: { startedAt: 'desc' },
    distinct: ['agentName'],
  });

  const lastRunMap = new Map(lastRuns.map((r) => [r.agentName, r]));

  const agents = configs.map((config) => ({
    ...config,
    lastRun: lastRunMap.get(config.name) || null,
  }));

  return NextResponse.json({ data: agents });
}
