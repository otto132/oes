import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export const AUDIT_ACTIONS = {
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_INVITED: 'user.invited',
  USER_DEACTIVATED: 'user.deactivated',
  AGENT_CONFIG_UPDATED: 'agent.config_updated',
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_REVOKED: 'integration.revoked',
  CONTACT_DELETED: 'contact.deleted',
  DATA_EXPORTED: 'data.exported',
  RETENTION_RUN_COMPLETED: 'retention.run_completed',
} as const;

export async function auditLog(entry: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (err) {
    logger.error('Failed to write audit log', {
      error: err instanceof Error ? err.message : String(err),
      action: entry.action,
      entityType: entry.entityType,
    });
  }
}
