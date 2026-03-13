import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    user: { findUnique: vi.fn() },
    invitation: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('GET /api/settings/team/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
  });

  it('returns pending invitations for admin', async () => {
    const invitations = [
      { id: 'inv1', email: 'new@co.com', role: 'MEMBER', expiresAt: new Date(Date.now() + 86400000), createdAt: new Date() },
    ];
    mockDb.invitation.findMany.mockResolvedValue(invitations);

    const { GET } = await import('@/app/api/settings/team/invitations/route');
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].email).toBe('new@co.com');
  });

  it('returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'MEMBER' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'u2', role: 'MEMBER' });

    const { GET } = await import('@/app/api/settings/team/invitations/route');
    const res = await GET();

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/settings/team/invite/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
  });

  it('revokes a pending invitation', async () => {
    const invitation = { id: 'inv1', status: 'PENDING', email: 'new@co.com' };
    mockDb.invitation.findUnique.mockResolvedValue(invitation);
    mockDb.invitation.update.mockResolvedValue({ ...invitation, status: 'REVOKED' });

    const { PATCH } = await import('@/app/api/settings/team/invite/[id]/route');
    const req = new NextRequest('http://localhost/api/settings/team/invite/inv1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REVOKED' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'inv1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('REVOKED');
  });

  it('rejects revoking a non-pending invitation', async () => {
    mockDb.invitation.findUnique.mockResolvedValue({ id: 'inv1', status: 'ACCEPTED' });

    const { PATCH } = await import('@/app/api/settings/team/invite/[id]/route');
    const req = new NextRequest('http://localhost/api/settings/team/invite/inv1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REVOKED' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'inv1' }) });

    expect(res.status).toBe(400);
  });
});
