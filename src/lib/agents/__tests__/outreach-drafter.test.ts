import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outreachDrafterAgent } from '../outreach-drafter';
import type { AgentContext } from '../types';

const mockLeadFindMany = vi.fn();
const mockAccountFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    lead: { findMany: (...args: unknown[]) => mockLeadFindMany(...args) },
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
  },
}));

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  })),
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'outreach_drafter', displayName: 'Outreach Drafter',
    description: '', status: 'active',
    parameters: { templateStyle: 'consultative', maxSequenceLength: 4 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Outreach Drafter Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('has correct name and triggers', () => {
    expect(outreachDrafterAgent.name).toBe('outreach_drafter');
    expect(outreachDrafterAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 9 * * 1-5' });
    expect(outreachDrafterAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'lead_qualification' });
  });

  it('returns error when ANTHROPIC_API_KEY not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockLeadFindMany.mockResolvedValue([]);

    const result = await outreachDrafterAgent.analyze(ctx);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('ANTHROPIC_API_KEY');
  });

  it('creates outreach_draft items for qualified leads', async () => {
    mockLeadFindMany.mockResolvedValue([
      { id: 'l1', company: 'Acme Corp', pain: 'High costs', status: 'Qualified' },
    ]);
    mockAccountFindFirst.mockResolvedValue({
      id: 'acc1', name: 'Acme Corp', pain: 'High costs', whyNow: 'Budget season',
      contacts: [{ id: 'c1', name: 'Jane Doe', title: 'VP Sales', warmth: 3 }],
      signals: [{ title: 'Funding round', source: 'News', sourceUrl: 'https://example.com' }],
    });
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"subjectA": "Save on costs", "subjectB": "Quick question", "body": "Hi Jane...", "reasoning": "Using pain point"}' }],
    });

    const result = await outreachDrafterAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('outreach_draft');
    expect(result.items[0].agent).toBe('outreach_drafter');
  });

  it('returns empty when no qualified leads', async () => {
    mockLeadFindMany.mockResolvedValue([]);
    const result = await outreachDrafterAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
