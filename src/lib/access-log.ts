import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function logAccess(entry: {
  userId: string;
  entityType: string;
  entityId: string;
}): Promise<void> {
  try {
    await db.accessLog.create({
      data: {
        userId: entry.userId,
        entityType: entry.entityType,
        entityId: entry.entityId,
      },
    });
  } catch (err) {
    logger.error('Failed to write access log', {
      error: err instanceof Error ? err.message : String(err),
      entityType: entry.entityType,
    });
  }
}
