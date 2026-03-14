import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuthFn, mockCreateNotification } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      task: { findMany: fn() },
    },
    mockAuthFn: fn(),
    mockCreateNotification: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/tenant', () => ({ resolveTenantDb: () => mockDb }));
vi.mock('@/lib/notifications', () => ({ createNotification: mockCreateNotification }));

import { POST } from '../tasks/check-due/route';

const USER_ID = 'user-1';

describe('POST /api/tasks/check-due', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFn.mockResolvedValue({ user: { id: USER_ID } });
  });

  it('creates TASK_OVERDUE notifications for overdue tasks', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockDb.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Overdue task',
        due: yesterday,
        ownerId: USER_ID,
        assignees: [{ id: USER_ID }],
      },
    ]);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });

    const res = await POST(new NextRequest('http://localhost/api/tasks/check-due', { method: 'POST' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBeGreaterThan(0);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'TASK_OVERDUE', entityId: 'task-1' }),
    );
  });

  it('skips tasks that already have unread notifications (dedup returns null)', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockDb.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Overdue task',
        due: yesterday,
        ownerId: USER_ID,
        assignees: [{ id: USER_ID }],
      },
    ]);
    mockCreateNotification.mockResolvedValue(null);

    const res = await POST(new NextRequest('http://localhost/api/tasks/check-due', { method: 'POST' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await POST(new NextRequest('http://localhost/api/tasks/check-due', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
