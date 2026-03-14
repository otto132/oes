import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    invitation: { findFirst: vi.fn(), update: vi.fn() },
    tenant: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { testSignInCallback } from '../auth-callbacks';

describe('testSignInCallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows existing active user to sign in', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true });
    const result = await testSignInCallback({ user: { email: 'a@b.com', name: 'A' } });
    expect(result).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalled();
  });

  it('blocks inactive user', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false });
    const result = await testSignInCallback({ user: { email: 'a@b.com', name: 'A' } });
    expect(result).toBe(false);
  });

  it('allows invited user and creates account', async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.invitation.findFirst.mockResolvedValue({ id: 'inv-1', role: 'MEMBER', tenantId: 't1' });
    mockDb.user.create.mockResolvedValue({ id: 'u2' });

    const result = await testSignInCallback({ user: { email: 'new@b.com', name: 'New' } });
    expect(result).toBe(true);
    expect(mockDb.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'MEMBER' }) }),
    );
  });

  it('rejects unknown user with no invitation', async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.invitation.findFirst.mockResolvedValue(null);

    const result = await testSignInCallback({ user: { email: 'rando@evil.com', name: 'Rando' } });
    expect(result).toBe(false);
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });
});
