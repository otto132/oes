import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitEvent, consumePendingEvents, markProcessed, expireOldEvents } from '../events';

// Mock Prisma client
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    agentEvent: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

describe('Event Bus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emitEvent creates a DB row', async () => {
    mockCreate.mockResolvedValue({ id: 'evt1' });
    await emitEvent('emails_synced', { count: 5 });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        event: 'emails_synced',
        payload: { count: 5 },
      },
    });
  });

  it('emitEvent defaults payload to empty object', async () => {
    mockCreate.mockResolvedValue({ id: 'evt2' });
    await emitEvent('calendar_synced');
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        event: 'calendar_synced',
        payload: {},
      },
    });
  });

  it('consumePendingEvents returns unprocessed events', async () => {
    const events = [{ id: 'e1', event: 'emails_synced', payload: {}, processed: false }];
    mockFindMany.mockResolvedValue(events);
    const result = await consumePendingEvents();
    expect(result).toEqual(events);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('markProcessed updates the event', async () => {
    mockUpdate.mockResolvedValue({});
    await markProcessed('evt1');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'evt1' },
      data: { processed: true },
    });
  });

  it('expireOldEvents deletes old unprocessed events', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });
    const count = await expireOldEvents(6 * 60 * 60 * 1000);
    expect(count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalled();
  });
});
