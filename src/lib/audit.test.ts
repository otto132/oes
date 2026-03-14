import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('auditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an audit log entry', async () => {
    const { auditLog } = await import('./audit');
    const { db } = await import('@/lib/db');

    await auditLog({
      userId: 'user-1',
      action: 'user.role_changed',
      entityType: 'User',
      entityId: 'user-2',
      before: { role: 'MEMBER' },
      after: { role: 'ADMIN' },
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'user.role_changed',
        entityType: 'User',
        entityId: 'user-2',
      }),
    });
  });

  it('does not throw on db error', async () => {
    const { db } = await import('@/lib/db');
    (db.auditLog.create as any).mockRejectedValueOnce(new Error('DB down'));

    const { auditLog } = await import('./audit');
    await auditLog({
      userId: null,
      action: 'retention.run_completed',
      entityType: 'System',
      entityId: 'retention',
    });
  });

  it('accepts null userId for system actions', async () => {
    const { auditLog } = await import('./audit');
    const { db } = await import('@/lib/db');

    await auditLog({
      userId: null,
      action: 'retention.run_completed',
      entityType: 'System',
      entityId: 'retention-run-1',
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null }),
    });
  });
});

describe('AUDIT_ACTIONS', () => {
  it('exports all expected action constants', async () => {
    const { AUDIT_ACTIONS } = await import('./audit');
    expect(AUDIT_ACTIONS.USER_ROLE_CHANGED).toBe('user.role_changed');
    expect(AUDIT_ACTIONS.CONTACT_DELETED).toBe('contact.deleted');
    expect(AUDIT_ACTIONS.DATA_EXPORTED).toBe('data.exported');
    expect(AUDIT_ACTIONS.RETENTION_RUN_COMPLETED).toBe('retention.run_completed');
  });
});
