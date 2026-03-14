import { describe, it, expect, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    notification: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { notifyUsers } from '../notifications';

describe('notifyUsers', () => {
  it('delivers remaining notifications when one fails', async () => {
    mockDb.notification.findFirst.mockResolvedValue(null);
    mockDb.notification.create
      .mockResolvedValueOnce({ id: 'n1' })
      .mockRejectedValueOnce(new Error('DB down'))
      .mockResolvedValueOnce({ id: 'n3' });

    await expect(
      notifyUsers(mockDb as any, ['user-2', 'user-3', 'user-4'], 'user-1', {
        type: 'TASK_ASSIGNED',
        title: 'Test',
        message: 'test',
      }),
    ).resolves.not.toThrow();

    expect(mockDb.notification.create).toHaveBeenCalledTimes(3);
  });
});
