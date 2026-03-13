import { db as prisma } from '@/lib/db';
import type { AgentEvent, Prisma } from '@prisma/client';

const DEFAULT_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function emitEvent(
  event: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await prisma.agentEvent.create({
    data: { event, payload: payload as Prisma.InputJsonValue },
  });
}

export async function consumePendingEvents(): Promise<AgentEvent[]> {
  return prisma.agentEvent.findMany({
    where: { processed: false },
    orderBy: { createdAt: 'asc' },
  });
}

export async function markProcessed(eventId: string): Promise<void> {
  await prisma.agentEvent.update({
    where: { id: eventId },
    data: { processed: true },
  });
}

export async function expireOldEvents(
  maxAgeMs: number = DEFAULT_EXPIRY_MS
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await prisma.agentEvent.updateMany({
    where: {
      processed: false,
      createdAt: { lt: cutoff },
    },
    data: { processed: true },
  });
  return result.count;
}
