import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const makeFindFirst = () => vi.fn();
  const makeFindMany = () => vi.fn();
  const makeQuery = () => vi.fn().mockResolvedValue({ id: 'result' });
  const makeExtends = () => vi.fn().mockImplementation((ext) => ({ _ext: ext }));

  const mockDb = {
    $extends: makeExtends(),
    account: {
      findFirst: makeFindFirst(),
      findMany: makeFindMany(),
    },
    lead: {
      findFirst: makeFindFirst(),
    },
    opportunity: {
      findFirst: makeFindFirst(),
    },
    task: {
      findFirst: makeFindFirst(),
    },
    goal: {
      findFirst: makeFindFirst(),
    },
    meeting: {
      findFirst: makeFindFirst(),
    },
  };

  return { mockDb };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('scopedDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$extends.mockImplementation((ext: unknown) => ({ _ext: ext }));
  });

  it('ADMIN role returns the raw db without calling $extends', async () => {
    const { scopedDb } = await import('../scoped-db');
    const result = scopedDb('admin-id', 'ADMIN');
    expect(result).toBe(mockDb);
    expect(mockDb.$extends).not.toHaveBeenCalled();
  });

  it('MEMBER role calls $extends and returns extended client', async () => {
    const { scopedDb } = await import('../scoped-db');
    const result = scopedDb('member-id', 'MEMBER');
    expect(mockDb.$extends).toHaveBeenCalledOnce();
    expect(result).not.toBe(mockDb);
  });

  it('VIEWER role calls $extends and returns extended client', async () => {
    const { scopedDb } = await import('../scoped-db');
    const result = scopedDb('viewer-id', 'VIEWER');
    expect(mockDb.$extends).toHaveBeenCalledOnce();
    expect(result).not.toBe(mockDb);
  });

  it('AccessDeniedError is exported and has correct name', async () => {
    const { AccessDeniedError } = await import('../scoped-db');
    const err = new AccessDeniedError('account');
    expect(err.name).toBe('AccessDeniedError');
    expect(err.message).toBe('Access denied: account');
    expect(err).toBeInstanceOf(Error);
  });

  describe('account write scoping', () => {
    it('update throws AccessDeniedError when record is not owned', async () => {
      const { scopedDb, AccessDeniedError } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      // Extract the update interceptor directly from the extension
      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.account.update;

      mockDb.account.findFirst.mockResolvedValue(null);

      await expect(
        updateFn({
          args: { where: { id: 'acct-1' }, data: { name: 'New' } },
          query: vi.fn(),
        })
      ).rejects.toThrow(AccessDeniedError);
    });

    it('update proceeds when record is owned', async () => {
      const { scopedDb } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.account.update;

      mockDb.account.findFirst.mockResolvedValue({ id: 'acct-1' });
      const queryMock = vi.fn().mockResolvedValue({ id: 'acct-1', name: 'New' });

      const result = await updateFn({
        args: { where: { id: 'acct-1' }, data: { name: 'New' } },
        query: queryMock,
      });

      expect(queryMock).toHaveBeenCalled();
      expect(result).toEqual({ id: 'acct-1', name: 'New' });
    });

    it('update throws AccessDeniedError when no id in where clause', async () => {
      const { scopedDb, AccessDeniedError } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.account.update;

      await expect(
        updateFn({
          args: { where: {}, data: { name: 'New' } },
          query: vi.fn(),
        })
      ).rejects.toThrow(AccessDeniedError);
    });

    it('delete throws AccessDeniedError when record is not owned', async () => {
      const { scopedDb, AccessDeniedError } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const deleteFn = capturedExt.query.account.delete;

      mockDb.account.findFirst.mockResolvedValue(null);

      await expect(
        deleteFn({
          args: { where: { id: 'acct-1' } },
          query: vi.fn(),
        })
      ).rejects.toThrow(AccessDeniedError);
    });
  });

  describe('task write scoping (OR assignee logic)', () => {
    it('update proceeds when user is an assignee', async () => {
      const { scopedDb } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.task.update;

      mockDb.task.findFirst.mockResolvedValue({ id: 'task-1' });
      const queryMock = vi.fn().mockResolvedValue({ id: 'task-1' });

      await updateFn({
        args: { where: { id: 'task-1' }, data: { title: 'Updated' } },
        query: queryMock,
      });

      expect(mockDb.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'task-1',
            OR: expect.arrayContaining([
              { ownerId: 'user-1' },
              { assignees: { some: { id: 'user-1' } } },
            ]),
          }),
        })
      );
      expect(queryMock).toHaveBeenCalled();
    });

    it('delete throws AccessDeniedError when task is not accessible', async () => {
      const { scopedDb, AccessDeniedError } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const deleteFn = capturedExt.query.task.delete;

      mockDb.task.findFirst.mockResolvedValue(null);

      await expect(
        deleteFn({
          args: { where: { id: 'task-1' } },
          query: vi.fn(),
        })
      ).rejects.toThrow(AccessDeniedError);
    });
  });

  describe('meeting write scoping', () => {
    it('update allows access when meeting has no accountId (org-wide)', async () => {
      const { scopedDb } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.meeting.update;

      mockDb.meeting.findFirst.mockResolvedValue({ accountId: null });
      const queryMock = vi.fn().mockResolvedValue({ id: 'meet-1' });

      await updateFn({
        args: { where: { id: 'meet-1' }, data: {} },
        query: queryMock,
      });

      expect(queryMock).toHaveBeenCalled();
    });

    it('update throws AccessDeniedError when account is not owned', async () => {
      const { scopedDb, AccessDeniedError } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.meeting.update;

      mockDb.meeting.findFirst.mockResolvedValue({ accountId: 'acct-99' });
      mockDb.account.findFirst.mockResolvedValue(null);

      await expect(
        updateFn({
          args: { where: { id: 'meet-1' }, data: {} },
          query: vi.fn(),
        })
      ).rejects.toThrow(AccessDeniedError);
    });

    it('update throws AccessDeniedError when meeting does not exist', async () => {
      const { scopedDb, AccessDeniedError } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const updateFn = capturedExt.query.meeting.update;

      mockDb.meeting.findFirst.mockResolvedValue(null);

      await expect(
        updateFn({
          args: { where: { id: 'meet-1' }, data: {} },
          query: vi.fn(),
        })
      ).rejects.toThrow(AccessDeniedError);
    });
  });

  describe('goal findUnique scoping', () => {
    it('findUnique delegates to findFirst with ownerId filter', async () => {
      const { scopedDb } = await import('../scoped-db');
      mockDb.$extends.mockImplementation((ext: any) => ext);
      scopedDb('user-1', 'MEMBER');

      const capturedExt = mockDb.$extends.mock.calls[0][0] as any;
      const findUniqueFn = capturedExt.query.goal.findUnique;

      mockDb.goal.findFirst.mockResolvedValue({ id: 'goal-1' });

      await findUniqueFn({ args: { where: { id: 'goal-1' } } });

      expect(mockDb.goal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'goal-1', ownerId: 'user-1' },
        })
      );
    });
  });
});
