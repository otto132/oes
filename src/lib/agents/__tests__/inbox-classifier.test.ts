import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inboxClassifierAgent } from '../inbox-classifier';
import type { AgentContext } from '../types';

const mockEmailFindMany = vi.fn();
const mockAccountFindFirst = vi.fn();
const mockAccountUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    inboxEmail: { findMany: (...args: unknown[]) => mockEmailFindMany(...args) },
    account: {
      findFirst: (...args: unknown[]) => mockAccountFindFirst(...args),
      update: (...args: unknown[]) => mockAccountUpdate(...args),
    },
  },
}));

const mockParse = vi.fn();
vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_HAIKU: 'claude-haiku-4-5',
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'inbox_classifier', displayName: 'Inbox Classifier',
    description: '', status: 'active',
    parameters: {},
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Inbox Classifier Agent (upgraded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and event trigger', () => {
    expect(inboxClassifierAgent.name).toBe('inbox_classifier');
    expect(inboxClassifierAgent.triggers).toContainEqual({ type: 'event', event: 'emails_synced' });
  });

  it('uses Claude to classify emails with sentiment', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'e1', subject: 'Re: GoO pricing', preview: 'We have budget approved for Q3',
        fromEmail: 'anna@acme.com', domain: 'acme.com', accountId: 'acc1',
        classification: null, createdAt: new Date(),
      },
    ]);
    mockAccountFindFirst.mockResolvedValue({
      id: 'acc1', name: 'Acme Corp', sentimentTrajectory: null,
    });

    mockParse.mockResolvedValue({
      parsed_output: {
        classifications: [{
          emailIndex: 0,
          intent: 'positive_reply',
          sentiment: 'very_positive',
          urgency: 'high',
          buyingSignals: ['budget approved for Q3'],
          competitorMentions: [],
          suggestedResponse: 'Respond within 24h — they have budget. Offer discovery call.',
          suggestedPriority: 'High',
          accountLinkSuggestion: null,
        }],
      },
    });

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].type).toBe('task_creation');
    expect(result.items[0].payload).toHaveProperty('buyingSignals');
    expect(result.items[0].priority).toBe('High');
  });
});
