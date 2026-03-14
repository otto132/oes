import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock db & auth (hoisted so vi.mock factories can reference them) ──
const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      task: { findMany: fn(), create: fn(), update: fn() },
      goal: { findMany: fn() },
      activity: { create: fn() },
      account: { update: fn() },
      opportunity: { findFirst: fn(), update: fn() },
      taskComment: { create: fn() },
      user: { findMany: fn() },
      notification: { findFirst: fn(), create: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/scoped-db', () => ({ scopedDb: () => mockDb, ScopedDb: {} }));

import { POST } from '../tasks/route';

// ── Helpers ──────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const USER_ID = 'user-1';

function mockAuth(userId = USER_ID) {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

const mockOwner = { id: USER_ID, name: 'Test User', initials: 'TU', role: 'rep', color: 'default' };

function makeTaskRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Follow up with Acme',
    status: 'Done',
    priority: 'Medium',
    due: new Date('2024-06-01'),
    source: 'Manual',
    completedAt: new Date(),
    accountId: 'acc-1',
    account: { id: 'acc-1', name: 'Acme Corp' },
    ownerId: USER_ID,
    owner: mockOwner,
    assignees: [mockOwner],
    reviewer: null,
    goalId: null,
    comments: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────
describe('POST /api/tasks (complete action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  // ── Complete task creates Activity ───────────────────────
  it('completing a task creates an Activity record', async () => {
    const task = makeTaskRecord();
    mockDb.task.update.mockResolvedValue(task);
    mockDb.activity.create.mockResolvedValue({ id: 'act-1' });
    mockDb.account.update.mockResolvedValue({});
    mockDb.opportunity.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ action: 'complete', id: 'task-1', outcome: 'done', notes: 'Sent email' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.task).toBeDefined();

    // Task was marked as Done
    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1' },
        data: expect.objectContaining({ status: 'Done' }),
      }),
    );

    // Activity was created
    expect(mockDb.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'Note',
          source: 'Task',
          accountId: 'acc-1',
          authorId: USER_ID,
        }),
      }),
    );

    // Account lastActivityAt was bumped
    expect(mockDb.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { lastActivityAt: expect.any(Date) },
    });
  });

  // ── Complete with follow-ups ─────────────────────────────
  it('completing a task with follow-ups creates follow-up tasks', async () => {
    const task = makeTaskRecord();
    mockDb.task.update.mockResolvedValue(task);
    mockDb.activity.create.mockResolvedValue({ id: 'act-1' });
    mockDb.account.update.mockResolvedValue({});
    mockDb.opportunity.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: 'task-2' });

    const followUps = [
      { title: 'Schedule demo', source: 'ai_suggested' },
      { title: 'Send proposal', source: 'custom' },
    ];

    const res = await POST(
      makeRequest({
        action: 'complete',
        id: 'task-1',
        outcome: 'done',
        notes: '',
        followUpTasks: followUps,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.createdFollowUps).toHaveLength(2);

    // First follow-up: AI suggested source
    expect(mockDb.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Schedule demo',
          source: 'AI Suggested',
          ownerId: USER_ID,
          accountId: 'acc-1',
        }),
      }),
    );

    // Second follow-up: manual source becomes "Follow-up"
    expect(mockDb.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Send proposal',
          source: 'Follow-up',
        }),
      }),
    );
  });

  // ── Complete already-completed task ──────────────────────
  it('completing already-completed task still processes (route does not guard)', async () => {
    // The route does not check existing status before marking Done.
    // If Prisma update throws (e.g. record not found), that propagates.
    // We test the scenario where update succeeds for an already-done task.
    const task = makeTaskRecord({ status: 'Done', completedAt: new Date('2024-05-01') });
    mockDb.task.update.mockResolvedValue(task);
    mockDb.activity.create.mockResolvedValue({ id: 'act-1' });
    mockDb.account.update.mockResolvedValue({});
    mockDb.opportunity.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ action: 'complete', id: 'task-1', outcome: 'done' }),
    );

    expect(res.status).toBe(200);
    // Activity is still created (no guard in the route)
    expect(mockDb.activity.create).toHaveBeenCalled();
  });

  // ── Complete with opportunity health bump ────────────────
  it('completing a task bumps opportunity engagement health', async () => {
    const task = makeTaskRecord();
    mockDb.task.update.mockResolvedValue(task);
    mockDb.activity.create.mockResolvedValue({ id: 'act-1' });
    mockDb.account.update.mockResolvedValue({});

    const opp = { id: 'opp-1', healthEngagement: 60, accountId: 'acc-1' };
    mockDb.opportunity.findFirst.mockResolvedValue(opp);
    mockDb.opportunity.update.mockResolvedValue({ ...opp, healthEngagement: 70 });

    const res = await POST(
      makeRequest({ action: 'complete', id: 'task-1', outcome: 'done' }),
    );

    expect(res.status).toBe(200);

    expect(mockDb.opportunity.update).toHaveBeenCalledWith({
      where: { id: 'opp-1' },
      data: { healthEngagement: 70 },
    });
  });

  // ── No account: skip account/opportunity updates ─────────
  it('completing a task without accountId skips account and opportunity updates', async () => {
    const task = makeTaskRecord({ accountId: null, account: null });
    mockDb.task.update.mockResolvedValue(task);
    mockDb.activity.create.mockResolvedValue({ id: 'act-1' });

    const res = await POST(
      makeRequest({ action: 'complete', id: 'task-1', outcome: 'done' }),
    );

    expect(res.status).toBe(200);
    expect(mockDb.account.update).not.toHaveBeenCalled();
    expect(mockDb.opportunity.findFirst).not.toHaveBeenCalled();
  });

  // ── Unauthorized ─────────────────────────────────────────
  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);

    const res = await POST(makeRequest({ action: 'complete', id: 'task-1' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toEqual({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  });
});

describe('POST /api/tasks (comment action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('uses mentionedUserIds for notifications instead of regex parsing', async () => {
    const comment = {
      id: 'comment-1',
      text: 'Hey @Nick check this',
      mentions: ['user-2'],
      createdAt: new Date(),
      author: mockOwner,
    };
    mockDb.taskComment.create.mockResolvedValue(comment);
    mockDb.notification.findFirst.mockResolvedValue(null);
    mockDb.notification.create.mockResolvedValue({ id: 'notif-1' });

    const res = await POST(
      makeRequest({
        action: 'comment',
        id: 'task-1',
        text: 'Hey @Nick check this',
        mentionedUserIds: ['user-2'],
      }),
    );

    expect(res.status).toBe(201);
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
    expect(mockDb.taskComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mentions: ['user-2'],
        }),
      }),
    );
  });
});
