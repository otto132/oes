import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    account: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    activity: { create: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/adapters', () => ({
  adaptAccount: (a: any) => ({ id: a.id, name: a.name }),
}));

describe('PATCH /api/accounts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mockDb.account.findFirst.mockResolvedValue(null);
    mockDb.activity.create.mockResolvedValue({});
  });

  it('updates account fields', async () => {
    const account = { id: 'a1', name: 'Acme' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.update.mockResolvedValue({ ...account, name: 'Acme Corp' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(200);
    expect(mockDb.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' } }),
    );
  });

  it('rejects duplicate name', async () => {
    const account = { id: 'a1', name: 'Acme' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.findFirst.mockResolvedValue({ id: 'a2', name: 'Acme Corp' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(409);
  });

  it('returns 404 for non-existent account', async () => {
    mockDb.account.findUnique.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(404);
  });

  it('logs activity on update', async () => {
    const account = { id: 'a1', name: 'Acme' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.update.mockResolvedValue({ ...account, notes: 'new notes' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'new notes' }),
    });
    await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(mockDb.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'Note',
          summary: 'Account updated',
          accountId: 'a1',
        }),
      }),
    );
  });
});
