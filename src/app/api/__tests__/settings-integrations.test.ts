import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      integrationToken: { findFirst: fn() },
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

describe('GET /api/settings/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns Disconnected when no Microsoft token exists', async () => {
    mockAuth();
    mockDb.integrationToken.findFirst.mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0]).toMatchObject({ name: 'Microsoft 365 / Outlook', status: 'Disconnected', active: false });
    expect(json.data[1]).toMatchObject({ name: 'Calendar Sync', status: 'Disconnected', active: false });
    expect(json.data[2]).toMatchObject({ name: 'LinkedIn (manual)', status: 'Manual enrichment', active: false });
  });

  it('returns Disconnected when Microsoft token is expired', async () => {
    mockAuth();
    const token = {
      id: 't1',
      provider: 'microsoft',
      expiresAt: new Date(Date.now() - 3600_000),
      updatedAt: new Date('2026-03-13T10:00:00Z'),
    };
    mockDb.integrationToken.findFirst.mockResolvedValue(token);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({ name: 'Microsoft 365 / Outlook', status: 'Disconnected', active: false });
    expect(json.data[1]).toMatchObject({ name: 'Calendar Sync', status: 'Disconnected', active: false });
  });

  it('returns Connected when valid Microsoft token exists', async () => {
    mockAuth();
    const token = {
      id: 't1',
      provider: 'microsoft',
      expiresAt: new Date(Date.now() + 3600_000),
      updatedAt: new Date('2026-03-13T10:00:00Z'),
    };
    mockDb.integrationToken.findFirst.mockResolvedValue(token);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({ name: 'Microsoft 365 / Outlook', status: 'Connected', active: true });
    expect(json.data[1]).toMatchObject({ name: 'Calendar Sync', status: 'Connected', active: true });
    expect(json.data[0].lastSyncAt).toBe(token.updatedAt.toISOString());
  });
});
