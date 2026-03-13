import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      integrationToken: { findUnique: fn() },
      syncLog: { findFirst: fn(), findMany: fn() },
      inboxEmail: { count: fn() },
      meeting: { count: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET } from '../settings/integrations/route';

function mockAuth(userId = 'user-1') {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

function setupDefaultMocks() {
  mockDb.syncLog.findFirst.mockResolvedValue(null);
  mockDb.syncLog.findMany.mockResolvedValue([]);
  mockDb.inboxEmail.count.mockResolvedValue(0);
  mockDb.meeting.count.mockResolvedValue(0);
}

describe('GET /api/settings/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns disconnected when no Microsoft token exists', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0]).toMatchObject({
      provider: 'microsoft',
      status: 'disconnected',
      active: false,
      needsReconnect: false,
    });
  });

  it('returns error status when token status is error', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue({
      status: 'error',
      expiresAt: new Date(Date.now() + 3600_000),
      updatedAt: new Date(),
    });

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({
      status: 'error',
      active: false,
      needsReconnect: true,
    });
  });

  it('returns connected when valid active token exists', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue({
      status: 'active',
      expiresAt: new Date(Date.now() + 3600_000),
      updatedAt: new Date('2026-03-13T10:00:00Z'),
    });
    mockDb.inboxEmail.count.mockResolvedValue(42);
    mockDb.meeting.count.mockResolvedValue(5);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({
      provider: 'microsoft',
      status: 'connected',
      active: true,
      emailsSynced: 42,
    });
    expect(json.data[1]).toMatchObject({
      provider: 'calendar',
      status: 'connected',
      active: true,
      meetingsSynced: 5,
    });
  });

  it('includes syncHistory in response', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue(null);
    mockDb.syncLog.findMany.mockResolvedValue([
      { id: 's1', type: 'email', status: 'success', itemsSynced: 10, errors: [], startedAt: new Date(), completedAt: new Date() },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(json.syncHistory).toHaveLength(1);
    expect(json.syncHistory[0]).toMatchObject({ id: 's1', type: 'email', errorCount: 0 });
  });
});
