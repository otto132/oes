import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    accessLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('logAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an access log entry', async () => {
    const { logAccess } = await import('./access-log');
    const { db } = await import('@/lib/db');

    await logAccess({
      userId: 'user-1',
      entityType: 'Account',
      entityId: 'acc-123',
    });

    expect(db.accessLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        entityType: 'Account',
        entityId: 'acc-123',
      },
    });
  });

  it('does not throw on db error', async () => {
    const { db } = await import('@/lib/db');
    (db.accessLog.create as any).mockRejectedValueOnce(new Error('DB down'));

    const { logAccess } = await import('./access-log');
    await logAccess({
      userId: 'user-1',
      entityType: 'Account',
      entityId: 'acc-123',
    });
  });
});
