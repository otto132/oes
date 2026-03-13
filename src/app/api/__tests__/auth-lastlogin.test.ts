import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    invitation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('signIn callback updates lastLoginAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates lastLoginAt for existing active user', async () => {
    const existingUser = { id: 'u1', email: 'test@co.com', isActive: true, role: 'MEMBER' };
    mockDb.user.findUnique.mockResolvedValue(existingUser);
    mockDb.user.update.mockResolvedValue(existingUser);

    // Import after mocks
    const { testSignInCallback } = await import('@/lib/auth-callbacks');

    const result = await testSignInCallback({ user: { email: 'test@co.com', name: 'Test' } });

    expect(result).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        lastLoginAt: expect.any(Date),
      }),
    });
  });
});
