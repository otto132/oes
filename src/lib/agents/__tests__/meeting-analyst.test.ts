import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../types';

const mockMeetingFindUnique = vi.fn();
const mockMeetingUpdate = vi.fn();
const mockAccountFindUnique = vi.fn();
const mockParse = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    meeting: { findUnique: mockMeetingFindUnique, update: mockMeetingUpdate },
    account: { findUnique: mockAccountFindUnique },
  },
}));

vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
}));

describe('Meeting Analyst Agent', () => {
  const ctx: AgentContext = {
    config: {
      id: 'cfg-1',
      name: 'meeting_analyst',
      displayName: 'Meeting Analyst',
      description: 'Process meeting notes',
      status: 'active',
      parameters: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    userId: 'user-1',
    triggerEvent: {
      id: 'evt-1',
      event: 'meeting_outcome_pasted',
      payload: { meetingId: 'mtg-1', rawNotes: 'Discussed pricing. John will send proposal by Friday. Follow up next week.' },
    },
  };

  beforeEach(() => vi.clearAllMocks());

  it('has correct name and event trigger', async () => {
    const { meetingAnalystAgent } = await import('../meeting-analyst');
    expect(meetingAnalystAgent.name).toBe('meeting_analyst');
    expect(meetingAnalystAgent.triggers).toContainEqual({ type: 'event', event: 'meeting_outcome_pasted' });
  });

  it('returns enrichment and task_creation queue items from notes', async () => {
    mockMeetingFindUnique.mockResolvedValue({
      id: 'mtg-1', title: 'Pricing Review', accountId: 'acc-1', accountName: 'Vattenfall',
      attendees: ['John Smith'], attendeeEmails: ['john@vattenfall.com'],
    });
    mockAccountFindUnique.mockResolvedValue({
      id: 'acc-1', name: 'Vattenfall', pain: 'High energy costs',
    });
    mockMeetingUpdate.mockResolvedValue({});
    mockParse.mockResolvedValue({
      parsed_output: {
        summary: 'Discussed pricing strategy. John committed to sending proposal by Friday.',
        actionItems: [{ title: 'Send proposal', suggestedOwner: 'John', suggestedDueDate: '2026-03-20' }],
        followUpMeetings: [{ topic: 'Proposal review', attendees: ['John Smith'] }],
        enrichmentSuggestions: [{ field: 'whyNow', suggestedValue: 'Budget approved for Q2', reasoning: 'Mentioned budget' }],
        contactIntelligence: [],
        sentiment: 'positive',
      },
    });

    const { meetingAnalystAgent } = await import('../meeting-analyst');
    const result = await meetingAnalystAgent.analyze(ctx);

    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items.find(i => i.type === 'task_creation')).toBeDefined();
    expect(result.items.find(i => i.type === 'enrichment')).toBeDefined();
    expect(result.metrics.matched).toBeGreaterThan(0);
  });

  it('skips when agent is paused', async () => {
    const pausedCtx = { ...ctx, config: { ...ctx.config, status: 'paused' as const } };
    const { meetingAnalystAgent } = await import('../meeting-analyst');
    const result = await meetingAnalystAgent.analyze(pausedCtx);
    expect(result.items).toHaveLength(0);
  });
});
