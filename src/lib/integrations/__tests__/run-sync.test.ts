import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockRefresh } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      integrationToken: { findMany: fn(), update: fn() },
      syncLog: { create: fn() },
    },
    mockRefresh: fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('../microsoft-graph', () => ({ refreshAccessToken: mockRefresh }));
vi.mock('@/lib/crypto', () => ({
  decrypt: (v: string) => v,
  encrypt: (v: string) => `encrypted:${v}`,
}));

import { runSync } from '../run-sync';

const activeToken = {
  id: 't1',
  provider: 'microsoft',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: new Date(Date.now() + 3600_000),
  userEmail: 'test@example.com',
  userId: 'user-1',
  status: 'active',
  user: { id: 'user-1', isActive: true },
};

describe('runSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.syncLog.create.mockResolvedValue({});
  });

  it('returns early with message when no tokens found', async () => {
    mockDb.integrationToken.findMany.mockResolvedValue([]);
    const result = await runSync({ type: 'email', syncFn: vi.fn() });
    expect(result.synced).toBe(0);
    expect(result.errors[0]).toContain('No active Microsoft tokens');
  });

  it('calls syncFn for each active user token', async () => {
    mockDb.integrationToken.findMany.mockResolvedValue([activeToken]);
    const syncFn = vi.fn().mockResolvedValue({ synced: 3, errors: [] });

    const result = await runSync({ type: 'email', syncFn });

    expect(syncFn).toHaveBeenCalledOnce();
    expect(syncFn).toHaveBeenCalledWith(activeToken, 'access');
    expect(result.synced).toBe(3);
  });

  it('refreshes expired tokens', async () => {
    const expired = { ...activeToken, expiresAt: new Date(Date.now() - 1000) };
    mockDb.integrationToken.findMany.mockResolvedValue([expired]);
    mockDb.integrationToken.update.mockResolvedValue({});
    mockRefresh.mockResolvedValue({ access_token: 'new', refresh_token: 'new-r', expires_in: 3600 });
    const syncFn = vi.fn().mockResolvedValue({ synced: 1, errors: [] });

    await runSync({ type: 'email', syncFn });

    expect(mockRefresh).toHaveBeenCalledWith('refresh');
    expect(syncFn).toHaveBeenCalledWith(expired, 'new');
  });

  it('marks token as error on refresh failure and creates failed SyncLog', async () => {
    const expired = { ...activeToken, expiresAt: new Date(Date.now() - 1000) };
    mockDb.integrationToken.findMany.mockResolvedValue([expired]);
    mockDb.integrationToken.update.mockResolvedValue({});
    mockRefresh.mockRejectedValue(new Error('invalid_grant'));

    const result = await runSync({ type: 'email', syncFn: vi.fn() });

    expect(mockDb.integrationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'error' }) })
    );
    expect(mockDb.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
    expect(result.errors[0]).toContain('Token refresh failed');
  });

  it('creates SyncLog entry on successful sync', async () => {
    mockDb.integrationToken.findMany.mockResolvedValue([activeToken]);
    const syncFn = vi.fn().mockResolvedValue({ synced: 5, errors: [] });

    await runSync({ type: 'calendar', syncFn });

    expect(mockDb.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'calendar', status: 'success', itemsSynced: 5 }),
      })
    );
  });

  it('creates partial SyncLog when syncFn has errors', async () => {
    mockDb.integrationToken.findMany.mockResolvedValue([activeToken]);
    const syncFn = vi.fn().mockResolvedValue({ synced: 2, errors: ['one failed'] });

    await runSync({ type: 'email', syncFn });

    expect(mockDb.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'partial', itemsSynced: 2 }),
      })
    );
  });
});
