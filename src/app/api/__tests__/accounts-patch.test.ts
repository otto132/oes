import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    account: { findUnique: vi.fn(), update: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('PATCH /api/accounts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
  });

  it('updates account fields', async () => {
    const account = { id: 'a1', name: 'Acme', ownerId: 'u1' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.update.mockResolvedValue({ ...account, name: 'Acme Corp' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockDb.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' } }),
    );
  });

  it('reassigns owner', async () => {
    const account = { id: 'a1', name: 'Acme', ownerId: 'u1' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.update.mockResolvedValue({ ...account, ownerId: 'u2' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: 'u2' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(200);
    expect(mockDb.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: 'u2' }) }),
    );
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
});
