import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const range = req.nextUrl.searchParams.get('range') ?? 'today';

  const now = new Date();
  let since: Date;
  switch (range) {
    case '7d':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default: {
      // today
      since = new Date(now);
      since.setHours(0, 0, 0, 0);
      break;
    }
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Get all logs in range
  const logs = await db.aiUsageLog.findMany({
    where: { createdAt: { gte: since } },
    select: {
      agentName: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostUsd: true,
      createdAt: true,
    },
  });

  // Today's total for cap calculation
  const todayLogs = logs.filter((l) => l.createdAt >= todayStart);
  const totalCostToday = todayLogs.reduce((sum, l) => sum + l.estimatedCostUsd, 0);
  const dailyCapUsd = parseFloat(process.env.AI_DAILY_SPEND_CAP_USD ?? '10');
  const capUsedPercent = dailyCapUsd > 0 ? (totalCostToday / dailyCapUsd) * 100 : 0;

  // Per-agent breakdown
  const byAgentMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number; runsToday: number }>();
  for (const log of logs) {
    const entry = byAgentMap.get(log.agentName) ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, runsToday: 0 };
    entry.calls++;
    entry.inputTokens += log.inputTokens;
    entry.outputTokens += log.outputTokens;
    entry.costUsd += log.estimatedCostUsd;
    if (log.createdAt >= todayStart) entry.runsToday++;
    byAgentMap.set(log.agentName, entry);
  }

  // Get maxRunsPerDay from agent configs
  const agentConfigs = await db.agentConfig.findMany({
    select: { name: true, parameters: true },
  });
  const maxRunsMap = new Map<string, number>();
  for (const cfg of agentConfigs) {
    const params = (cfg.parameters as Record<string, unknown>) ?? {};
    const max = Number(params.maxRunsPerDay) || 0;
    if (max) maxRunsMap.set(cfg.name, max);
  }

  const byAgent = Array.from(byAgentMap.entries()).map(([agent, data]) => ({
    agent,
    ...data,
    maxRunsPerDay: maxRunsMap.get(agent) ?? null,
  }));

  // Daily trend
  const dailyMap = new Map<string, number>();
  for (const log of logs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + log.estimatedCostUsd);
  }
  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, costUsd]) => ({ date, costUsd: Math.round(costUsd * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalCostUsd = logs.reduce((sum, l) => sum + l.estimatedCostUsd, 0);

  return NextResponse.json({
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    dailyCapUsd,
    capUsedPercent: Math.round(capUsedPercent * 10) / 10,
    byAgent,
    dailyTrend,
  });
}
