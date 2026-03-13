import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configs = await prisma.agentConfig.findMany({
    orderBy: { name: 'asc' },
  });

  // Get last run for each agent
  const lastRuns = await prisma.agentRun.findMany({
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
