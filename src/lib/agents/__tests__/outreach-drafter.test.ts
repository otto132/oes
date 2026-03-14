import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outreachDrafterAgent } from '../outreach-drafter';
import type { AgentContext } from '../types';

const mockLeadFindMany = vi.fn();
const mockAccountFindFirst = vi.fn();
const mockSignalFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    lead: { findMany: (...args: unknown[]) => mockLeadFindMany(...args) },
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
  },
}));

const mockParse = vi.fn();
vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: {
      parse: mockParse,
    },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'outreach_drafter', displayName: 'Outreach Drafter',
    description: '', status: 'active',
    parameters: {},
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Outreach Drafter Agent (upgraded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and triggers', () => {
    expect(outreachDrafterAgent.name).toBe('outreach_drafter');
    expect(outreachDrafterAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 9 * * 1-5' });
    expect(outreachDrafterAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'lead_qualification' });
  });

  it('returns error when ANTHROPIC_API_KEY is not set', async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();

    vi.doMock('../ai', () => ({
      getAnthropicClient: () => { throw new Error('ANTHROPIC_API_KEY not configured'); },
      MODEL_SONNET: 'claude-sonnet-4-6',
    }));

    const { outreachDrafterAgent: agent } = await import('../outreach-drafter');
    mockLeadFindMany.mockResolvedValue([{ id: 'l1', company: 'Test', stage: 'Qualified' }]);
    const result = await agent.analyze(ctx);
    expect(result.errors.length).toBeGreaterThan(0);

    process.env.ANTHROPIC_API_KEY = origKey;
  });

  it('creates outreach_draft items with structured output', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockLeadFindMany.mockResolvedValue([
      { id: 'l1', company: 'Acme Corp', stage: 'Qualified', pain: 'High costs' },
    ]);
    mockAccountFindFirst.mockResolvedValue({
      id: 'a1', name: 'Acme Corp', pain: 'High costs', whyNow: 'Contract renewal Q3',
      contacts: [{ id: 'c1', name: 'Anna', title: 'VP Procurement', warmth: 'warm' }],
    });
    mockSignalFindMany.mockResolvedValue([
      { title: 'PPA market growth', source: 'Reuters', sourceUrl: 'https://example.com' },
    ]);

    mockParse.mockResolvedValue({
      parsed_output: {
        subjectA: 'GoO sourcing for Q3',
        subjectB: 'Quick question about certificates',
        body: 'Hi Anna, I noticed your contract...',
        introRequestMessage: null,
        toneUsed: 'Consultative',
        personalizationHooks: ['Q3 renewal', 'PPA market growth'],
        reasoning: 'Consultative tone for VP-level contact',
      },
    });

    const result = await outreachDrafterAgent.analyze(ctx);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('outreach_draft');
    expect(result.items[0].payload).toHaveProperty('subject', 'GoO sourcing for Q3');
    expect(result.items[0].payload).toHaveProperty('body', 'Hi Anna, I noticed your contract...');
    expect(mockParse).toHaveBeenCalledOnce();
  });
});
