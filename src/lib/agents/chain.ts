import type { QueueItem } from '@prisma/client';
import { emitEvent } from './events';
import { getAgentsByTrigger } from './registry';
import { runAgent } from './runner';
import type { AgentEventData } from './types';

export async function handleApproval(
  approvedItem: QueueItem,
  _approvalPayload: Record<string, unknown>
): Promise<void> {
  // 1. Emit event for audit trail + fallback
  await emitEvent('queue_item_approved', {
    type: approvedItem.type,
    id: approvedItem.id,
    accId: approvedItem.accId,
    payload: approvedItem.payload as Record<string, unknown>,
  });

  // 2. Find agents with matching chain triggers
  const chainAgents = getAgentsByTrigger('chain', approvedItem.type);
  if (chainAgents.length === 0) return;

  // 3. Build event data for downstream agents
  const eventData: AgentEventData = {
    id: approvedItem.id,
    event: 'queue_item_approved',
    payload: {
      type: approvedItem.type,
      accId: approvedItem.accId,
      payload: approvedItem.payload as Record<string, unknown>,
    },
  };

  // 4. Execute all matching agents in parallel (fan-out)
  const triggerName = `chain:${approvedItem.type}`;
  await Promise.allSettled(
    chainAgents.map((agent) => runAgent(agent, triggerName, eventData))
  );
}
