import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inboxClassifierAgent } from '../inbox-classifier';
import type { AgentContext } from '../types';

const mockEmailFindMany = vi.fn();
const mockAccountFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    inboxEmail: { findMany: (...args: unknown[]) => mockEmailFindMany(...args) },
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
  },
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'inbox_classifier', displayName: 'Inbox Classifier',
    description: '', status: 'active',
    parameters: { urgencyKeywords: ['urgent', 'deadline', 'asap'] },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
  triggerEvent: { id: 'evt1', event: 'emails_synced', payload: { count: 3 } },
};

describe('Inbox Classifier Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and event trigger', () => {
    expect(inboxClassifierAgent.name).toBe('inbox_classifier');
    expect(inboxClassifierAgent.triggers).toContainEqual({
      type: 'event', event: 'emails_synced',
    });
  });

  it('creates task_creation items for urgent emails', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'em1', subject: 'URGENT: Need response today',
        fromEmail: 'john@acme.com', fromName: 'John',
        preview: 'Please respond ASAP', domain: 'acme.com',
        classification: 'question', accountId: 'acc1',
        createdAt: new Date(),
      },
    ]);
    mockAccountFindFirst.mockResolvedValue({ id: 'acc1', name: 'Acme' });

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items.some((i) => i.type === 'task_creation')).toBe(true);
  });

  it('creates enrichment items for unlinked emails from new domains', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'em2', subject: 'Partnership inquiry',
        fromEmail: 'jane@newcorp.com', fromName: 'Jane',
        preview: 'Interested in your product', domain: 'newcorp.com',
        classification: 'positive_reply', accountId: null,
        createdAt: new Date(),
      },
    ]);
    mockAccountFindFirst.mockResolvedValue(null);

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items.some((i) => i.type === 'enrichment')).toBe(true);
  });

  it('returns empty when no actionable emails', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'em3', subject: 'Newsletter',
        fromEmail: 'noreply@news.com', fromName: 'News',
        preview: 'Weekly update', domain: 'news.com',
        classification: 'auto_reply', accountId: null,
        createdAt: new Date(),
      },
    ]);

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
