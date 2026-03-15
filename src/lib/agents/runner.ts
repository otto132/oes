import { db as prisma } from '@/lib/db';
import type { AgentRun, Prisma } from '@prisma/client';
import type { Agent, AgentEventData } from './types';
import { consumePendingEvents, markProcessed, expireOldEvents } from './events';
import { getAgentsByTrigger } from './registry';
import { notifyUsers } from '@/lib/notifications';
import {
  checkSpendCap,
  checkRunLimit,
  checkCircuitBreaker,
  SpendCapExceededError,
  RunLimitExceededError,
  CircuitBreakerOpenError,
} from './ai';

const STALE_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function runAgent(
  agent: Agent,
  trigger: string,
  event?: AgentEventData
): Promise<AgentRun | null> {
  // 1. Check config status
  const config = await prisma.agentConfig.findUnique({
    where: { name: agent.name },
  });
  if (!config || config.status === 'paused' || config.status === 'disabled') {
    return null;
  }

  // 2. Guardrails: spend cap, run limit, circuit breaker
  try {
    await checkSpendCap();
    await checkRunLimit(agent.name);
    await checkCircuitBreaker(agent.name);
  } catch (err) {
    if (
      err instanceof SpendCapExceededError ||
      err instanceof RunLimitExceededError ||
      err instanceof CircuitBreakerOpenError
    ) {
      console.warn(`[agent-guard] ${agent.name} skipped: ${err.message}`);
      return null;
    }
    throw err;
  }

  // 3. Concurrency guard
  const existingRun = await prisma.agentRun.findFirst({
    where: { agentName: agent.name, status: 'running' },
    orderBy: { startedAt: 'desc' },
  });

  if (existingRun) {
    const elapsed = Date.now() - existingRun.startedAt.getTime();
    if (elapsed < STALE_RUN_TIMEOUT_MS) {
      return null; // still running
    }
    // Mark stale run as failed
    await prisma.agentRun.update({
      where: { id: existingRun.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs: elapsed,
        errors: [{ message: 'Run timed out (stale)', recoverable: true }] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // 4. Create run record
  const run = await prisma.agentRun.create({
    data: {
      agentName: agent.name,
      status: 'running',
      trigger,
    },
  });

  const startTime = Date.now();

  try {
    // 5. Execute agent
    const result = await agent.analyze({
      config,
      userId: 'system',
      triggerEvent: event,
    });

    // 6. Create queue items
    if (result.items.length > 0) {
      await prisma.queueItem.createMany({
        data: result.items.map((item) => ({
          type: item.type,
          title: item.title,
          accName: item.accName,
          accId: item.accId,
          agent: item.agent,
          confidence: item.confidence,
          confidenceBreakdown: item.confidenceBreakdown as Prisma.InputJsonValue,
          sources: item.sources as unknown as Prisma.InputJsonValue,
          payload: item.payload as Prisma.InputJsonValue,
          reasoning: item.reasoning,
          priority: item.priority,
        })),
      });
      // Notify all admins of new queue items (batched)
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });
      const adminIds = admins.map((a) => a.id);
      const count = result.items.length;
      await notifyUsers(prisma, adminIds, undefined, {
        type: 'QUEUE_ITEM',
        title: `${count} new queue item${count > 1 ? 's' : ''} pending review`,
        message: result.items.map(i => i.title).slice(0, 3).join(', ') + (count > 3 ? ` (+${count - 3} more)` : ''),
        entityType: 'QueueItem',
        entityId: run.id,
      });
    }

    // 7. Update run record
    const durationMs = Date.now() - startTime;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        durationMs,
        itemsCreated: result.items.length,
        itemsScanned: result.metrics.scanned,
        itemsMatched: result.metrics.matched,
        errors: result.errors as unknown as Prisma.InputJsonValue,
      },
    });

    // 8. Update lastRunAt
    await prisma.agentConfig.update({
      where: { name: agent.name },
      data: { lastRunAt: new Date() },
    });

    return run;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
          },
        ] as unknown as Prisma.InputJsonValue,
      },
    });
    return run;
  }
}

export async function runDueAgents(): Promise<AgentRun[]> {
  const results: AgentRun[] = [];

  // 1. Expire old events
  await expireOldEvents();

  // 2. Process pending events
  const events = await consumePendingEvents();
  for (const evt of events) {
    const eventData: AgentEventData = {
      id: evt.id,
      event: evt.event,
      payload: evt.payload as Record<string, unknown>,
    };

    let agents: Agent[] = [];
    if (evt.event === 'queue_item_approved') {
      const itemType = (evt.payload as Record<string, unknown>).type as string;
      agents = getAgentsByTrigger('chain', itemType);
    } else {
      agents = getAgentsByTrigger('event', evt.event);
    }

    for (const agent of agents) {
      const run = await runAgent(agent, `event:${evt.event}`, eventData);
      if (run) results.push(run);
    }

    await markProcessed(evt.id);
  }

  // 3. Check cron-triggered agents
  const cronAgents = getAgentsByTrigger('cron');
  for (const agent of cronAgents) {
    const config = await prisma.agentConfig.findUnique({
      where: { name: agent.name },
    });
    if (!config || !isDue(config, agent)) continue;
    const run = await runAgent(agent, 'cron');
    if (run) results.push(run);
  }

  return results;
}

function isDue(config: { lastRunAt: Date | null; parameters: unknown }, agent: Agent): boolean {
  if (!config.lastRunAt) return true;

  // Check for user-configured schedule override first
  const params = (config.parameters as Record<string, unknown>) ?? {};
  const scheduleOverride = params.schedule as string | undefined;

  const cronTrigger = agent.triggers.find((t) => t.type === 'cron');
  if (!cronTrigger || cronTrigger.type !== 'cron') return false;

  const schedule = scheduleOverride || cronTrigger.schedule;
  const intervalMs = parseCronIntervalMs(schedule);
  return Date.now() - config.lastRunAt.getTime() >= intervalMs;
}

function parseCronIntervalMs(schedule: string): number {
  const parts = schedule.split(' ');
  const minute = parts[0];
  const hour = parts[1];

  if (minute.startsWith('*/')) {
    return parseInt(minute.slice(2), 10) * 60 * 1000;
  }
  if (hour.startsWith('*/')) {
    return parseInt(hour.slice(2), 10) * 60 * 60 * 1000;
  }
  // Daily or weekly: default to 24h
  return 24 * 60 * 60 * 1000;
}
