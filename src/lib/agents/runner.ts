import prisma from '@/lib/prisma';
import type { AgentRun } from '@prisma/client';
import type { Agent, AgentEventData } from './types';

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

  // 2. Concurrency guard
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
        errors: [{ message: 'Run timed out (stale)', recoverable: true }],
      },
    });
  }

  // 3. Create run record
  const run = await prisma.agentRun.create({
    data: {
      agentName: agent.name,
      status: 'running',
      trigger,
    },
  });

  const startTime = Date.now();

  try {
    // 4. Execute agent
    const result = await agent.analyze({
      config,
      userId: 'system',
      triggerEvent: event,
    });

    // 5. Create queue items
    if (result.items.length > 0) {
      await prisma.queueItem.createMany({
        data: result.items.map((item) => ({
          type: item.type,
          title: item.title,
          accName: item.accName,
          accId: item.accId,
          agent: item.agent,
          confidence: item.confidence,
          confidenceBreakdown: item.confidenceBreakdown,
          sources: item.sources,
          payload: item.payload,
          reasoning: item.reasoning,
          priority: item.priority,
        })),
      });
    }

    // 6. Update run record
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
        errors: result.errors,
      },
    });

    // 7. Update lastRunAt
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
        ],
      },
    });
    return run;
  }
}
