import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leadQualifierAgent } from '../lead-qualifier';
import type { AgentContext } from '../types';

const mockLeadFindMany = vi.fn();
const mockSignalFindMany = vi.fn();
const mockInboxFindMany = vi.fn();
const mockAccountFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    lead: { findMany: (...args: unknown[]) => mockLeadFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
    inboxEmail: { findMany: (...args: unknown[]) => mockInboxFindMany(...args) },
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
  },
}));

const mockParse = vi.fn();
vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_HAIKU: 'claude-haiku-4-5',
  getModelForAgent: (_config: unknown, defaultModel: string) => defaultModel,
  logUsage: vi.fn(),
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'lead_qualifier', displayName: 'Lead Qualifier',
    description: '', status: 'active',
    parameters: { autoQualifyThreshold: 70, autoDisqualifyThreshold: 25 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Lead Qualifier Agent (upgraded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and triggers', () => {
    expect(leadQualifierAgent.name).toBe('lead_qualifier');
    expect(leadQualifierAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 */4 * * *' });
    expect(leadQualifierAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'signal_review' });
  });

  it('uses Claude to evaluate leads with context', async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        id: 'l1', company: 'Acme Corp', stage: 'New', pain: 'High costs',
        scoreFit: 0, scoreIntent: 0, scoreUrgency: 0, scoreAccess: 0, scoreCommercial: 0,
        type: 'Utility',
      },
    ]);
    mockSignalFindMany.mockResolvedValue([
      { title: 'Acme renewable initiative', summary: 'Investing in solar' },
    ]);
    mockInboxFindMany.mockResolvedValue([]);
    mockAccountFindFirst.mockResolvedValue(null);

    mockParse.mockResolvedValue({
      parsed_output: {
        recommendation: 'qualify',
        scores: { fit: 80, intent: 70, urgency: 60, access: 40, commercial: 85 },
        reasoning: 'Strong fit as Nordic utility with renewable pain. Intent inferred from conference attendance.',
        gaps: ['No direct contact identified'],
        suggestedNextStep: 'Enrich contacts via LinkedIn',
        inferredFrom: { intent: 'Conference attendance signal', urgency: 'Contract renewal mentioned in RSS' },
      },
    });

    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('lead_qualification');
    expect(result.items[0].payload).toHaveProperty('recommendation', 'qualify');
    expect(result.items[0].payload).toHaveProperty('gaps');
    expect(result.items[0].reasoning).toContain('Nordic utility');
    expect(mockParse).toHaveBeenCalledOnce();
  });
});
