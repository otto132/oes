import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    inboxEmail: {
      findMany: vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    signal: {
      findMany: vi.fn().mockResolvedValue([{ id: '3' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    syncLog: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    accessLog: {
      findMany: vi.fn().mockResolvedValue([{ id: '4' }, { id: '5' }, { id: '6' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    dataRetentionRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
  AUDIT_ACTIONS: { RETENTION_RUN_COMPLETED: 'retention.run_completed' },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('runRetentionCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes stale records and returns counts', async () => {
    const { runRetentionCleanup } = await import('./retention');
    const result = await runRetentionCleanup();

    expect(result).toEqual(
      expect.objectContaining({
        archivedEmails: 2,
        dismissedSignals: 1,
        syncLogs: 0,
        accessLogs: 3,
      }),
    );
  });

  it('creates an audit log entry', async () => {
    const { runRetentionCleanup } = await import('./retention');
    const { auditLog } = await import('@/lib/audit');
    await runRetentionCleanup();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'retention.run_completed',
      }),
    );
  });
});
