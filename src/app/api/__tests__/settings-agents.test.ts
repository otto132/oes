import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      agentConfig: {
        findMany: fn(),
        count: fn(),
        createMany: fn(),
        findUnique: fn(),
        update: fn(),
      },
      user: { findUnique: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET } from '../settings/agents/route';
import { PATCH } from '../settings/agents/[name]/route';

function mockAuth(userId = 'user-1') {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

describe('GET /api/settings/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns existing agent configs from DB', async () => {
    mockAuth();
    const agents = [
      { id: '1', name: 'signal_hunter', displayName: 'Signal Hunter', description: 'desc', status: 'active', parameters: {}, lastRunAt: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockDb.agentConfig.count.mockResolvedValue(1);
    mockDb.agentConfig.findMany.mockResolvedValue(agents);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe('signal_hunter');
  });

  it('seeds defaults when no agents exist', async () => {
    mockAuth();
    mockDb.agentConfig.count.mockResolvedValue(0);
    mockDb.agentConfig.createMany.mockResolvedValue({ count: 6 });
    mockDb.agentConfig.findMany.mockResolvedValue([
      { id: '1', name: 'signal_hunter', displayName: 'Signal Hunter', description: 'desc', status: 'active', parameters: {}, lastRunAt: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockDb.agentConfig.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'signal_hunter' }),
          expect.objectContaining({ name: 'lead_qualifier' }),
          expect.objectContaining({ name: 'account_enricher' }),
          expect.objectContaining({ name: 'outreach_drafter' }),
          expect.objectContaining({ name: 'pipeline_hygiene' }),
          expect.objectContaining({ name: 'inbox_classifier' }),
        ]),
      }),
    );
    expect(json.data).toBeDefined();
  });
});

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/settings/agents/signal_hunter', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const mockParams = Promise.resolve({ name: 'signal_hunter' });

describe('PATCH /api/settings/agents/[name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'MEMBER' });
    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown agent name', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    mockDb.agentConfig.findUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it('updates agent status', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    mockDb.agentConfig.findUnique.mockResolvedValue({ id: '1', name: 'signal_hunter' });
    const updated = { id: '1', name: 'signal_hunter', status: 'paused', parameters: {} };
    mockDb.agentConfig.update.mockResolvedValue(updated);

    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('paused');
    expect(mockDb.agentConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'signal_hunter' },
        data: expect.objectContaining({ status: 'paused' }),
      }),
    );
  });

  it('returns 400 for invalid status value', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    const res = await PATCH(makeRequest({ status: 'deleted' }), { params: mockParams });
    expect(res.status).toBe(400);
  });
});
