import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      task: { findUnique: fn(), update: fn() },
      subtask: { deleteMany: fn(), create: fn(), update: fn(), findMany: fn() },
      $transaction: fn(),
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/scoped-db', () => ({ scopedDb: () => mockDb }));
vi.mock('@/lib/notifications', () => ({ notifyUsers: vi.fn() }));

import { PATCH } from '../tasks/[id]/route';

const USER_ID = 'user-1';
const mockOwner = { id: USER_ID, name: 'Test', initials: 'TU', role: 'rep', color: 'default' };

function makeRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tasks/[id] — subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFn.mockResolvedValue({ user: { id: USER_ID } });
  });

  it('creates new subtasks when no id is provided', async () => {
    const existing = { id: 'task-1', title: 'Test', ownerId: USER_ID };
    mockDb.task.findUnique.mockResolvedValue(existing);
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
    mockDb.subtask.findMany.mockResolvedValue([]);
    mockDb.subtask.create.mockResolvedValue({ id: 'sub-1', title: 'Step 1', done: false, position: 0 });
    mockDb.task.update.mockResolvedValue({
      ...existing, owner: mockOwner, assignees: [], reviewer: null,
      account: null, comments: [], subtasks: [{ id: 'sub-1', title: 'Step 1', done: false, position: 0 }],
      _count: { subtasks: 1 }, due: null, completedAt: null, source: 'Manual', priority: 'Medium', status: 'Open', goalId: null,
    });

    const res = await PATCH(
      makeRequest('task-1', {
        subtasks: [{ title: 'Step 1', done: false, position: 0 }],
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockDb.subtask.create).toHaveBeenCalled();
  });

  it('updates existing subtasks when id is provided', async () => {
    const existing = { id: 'task-1', title: 'Test', ownerId: USER_ID };
    mockDb.task.findUnique.mockResolvedValue(existing);
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
    mockDb.subtask.findMany.mockResolvedValue([{ id: 'sub-1' }]);
    mockDb.subtask.update.mockResolvedValue({ id: 'sub-1', title: 'Updated', done: true, position: 0 });
    mockDb.task.update.mockResolvedValue({
      ...existing, owner: mockOwner, assignees: [], reviewer: null,
      account: null, comments: [], subtasks: [{ id: 'sub-1', title: 'Updated', done: true, position: 0 }],
      _count: { subtasks: 1 }, due: null, completedAt: null, source: 'Manual', priority: 'Medium', status: 'Open', goalId: null,
    });

    const res = await PATCH(
      makeRequest('task-1', {
        subtasks: [{ id: 'sub-1', title: 'Updated', done: true, position: 0 }],
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockDb.subtask.update).toHaveBeenCalled();
  });

  it('deletes subtasks not in the array', async () => {
    const existing = { id: 'task-1', title: 'Test', ownerId: USER_ID };
    mockDb.task.findUnique.mockResolvedValue(existing);
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
    mockDb.subtask.findMany.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
    mockDb.subtask.deleteMany.mockResolvedValue({ count: 1 });
    mockDb.subtask.update.mockResolvedValue({ id: 'sub-1', title: 'Keep', done: false, position: 0 });
    mockDb.task.update.mockResolvedValue({
      ...existing, owner: mockOwner, assignees: [], reviewer: null,
      account: null, comments: [], subtasks: [{ id: 'sub-1', title: 'Keep', done: false, position: 0 }],
      _count: { subtasks: 1 }, due: null, completedAt: null, source: 'Manual', priority: 'Medium', status: 'Open', goalId: null,
    });

    const res = await PATCH(
      makeRequest('task-1', {
        subtasks: [{ id: 'sub-1', title: 'Keep', done: false, position: 0 }],
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockDb.subtask.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          taskId: 'task-1',
          id: { notIn: ['sub-1'] },
        }),
      }),
    );
  });
});
