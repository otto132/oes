import { db } from '@/lib/db';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { logger } from '@/lib/logger';

const BATCH_LIMIT = 1000;

async function deleteStale(
  model: any,
  where: Record<string, unknown>,
  label: string,
): Promise<number> {
  const stale = await model.findMany({
    where,
    select: { id: true },
    take: BATCH_LIMIT,
  });
  if (stale.length === 0) return 0;

  const ids = stale.map((r: { id: string }) => r.id);
  const { count } = await model.deleteMany({ where: { id: { in: ids } } });

  if (stale.length >= BATCH_LIMIT) {
    logger.warn(`Retention batch limit hit for ${label} — more records remain`);
  }

  return count;
}

export async function runRetentionCleanup() {
  const now = new Date();

  const archivedEmails = await deleteStale(
    db.inboxEmail,
    { isArchived: true, createdAt: { lt: new Date(now.getTime() - 90 * 864e5) } },
    'archived emails',
  );

  // ── Auto-dismiss stale new signals (>90 days) ──────────────
  const staleSignalCutoff = new Date(now.getTime() - 90 * 864e5);
  const staleSignals = await db.signal.updateMany({
    where: {
      status: 'new_signal',
      detectedAt: { lt: staleSignalCutoff },
    },
    data: { status: 'dismissed' },
  });
  if (staleSignals.count > 0) {
    logger.info(`Auto-dismissed ${staleSignals.count} stale signals (>90 days)`);
  }

  const dismissedSignals = await deleteStale(
    db.signal,
    { status: 'dismissed', createdAt: { lt: new Date(now.getTime() - 180 * 864e5) } },
    'dismissed signals',
  );

  const successSyncLogs = await deleteStale(
    db.syncLog,
    { status: 'success', startedAt: { lt: new Date(now.getTime() - 30 * 864e5) } },
    'completed sync logs',
  );
  const failedSyncLogs = await deleteStale(
    db.syncLog,
    { status: 'failed', startedAt: { lt: new Date(now.getTime() - 90 * 864e5) } },
    'failed sync logs',
  );

  const accessLogs = await deleteStale(
    db.accessLog,
    { createdAt: { lt: new Date(now.getTime() - 90 * 864e5) } },
    'access logs',
  );

  const syncLogs = successSyncLogs + failedSyncLogs;

  const run = await db.dataRetentionRun.create({
    data: {
      archivedEmails,
      dismissedSignals,
      syncLogs,
      accessLogs,
      completedAt: new Date(),
    },
  });

  auditLog({
    userId: null,
    action: AUDIT_ACTIONS.RETENTION_RUN_COMPLETED,
    entityType: 'DataRetentionRun',
    entityId: run.id,
    metadata: { archivedEmails, dismissedSignals, syncLogs, accessLogs },
  });

  logger.info('Retention cleanup completed', {
    archivedEmails,
    dismissedSignals,
    syncLogs,
    accessLogs,
  });

  return { ...run, archivedEmails, dismissedSignals, syncLogs, accessLogs };
}
