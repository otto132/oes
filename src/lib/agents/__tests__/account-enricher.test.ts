import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountEnricherAgent } from '../account-enricher';
import type { AgentContext } from '../types';

const mockAccountFindMany = vi.fn();
const mockSignalFindMany = vi.fn();
const mockContactFindMany = vi.fn();
const mockUserFindMany = vi.fn();
const mockInboxFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    account: { findMany: (...args: unknown[]) => mockAccountFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
    contact: { findMany: (...args: unknown[]) => mockContactFindMany(...args) },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    inboxEmail: { findMany: (...args: unknown[]) => mockInboxFindMany(...args) },
  },
}));

const mockCreate = vi.fn();
vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
  getModelForAgent: (_config: unknown, defaultModel: string) => defaultModel,
  logUsage: vi.fn(),
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'account_enricher', displayName: 'Account Enricher',
    description: '', status: 'active',
    parameters: { stalenessThresholdDays: 30 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Account Enricher Agent (upgraded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and triggers', () => {
    expect(accountEnricherAgent.name).toBe('account_enricher');
    expect(accountEnricherAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 6 * * 1' });
    expect(accountEnricherAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'lead_qualification' });
    expect(accountEnricherAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'signal_review' });
  });

  it('enriches stale accounts with Claude synthesis', async () => {
    const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: null, whyNow: null, updatedAt: staleDate },
    ]);
    mockSignalFindMany.mockResolvedValue([
      { title: 'Acme renewable initiative', summary: 'Investing in solar', source: 'Reuters', sourceUrl: 'https://example.com' },
    ]);
    mockContactFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
    mockInboxFindMany.mockResolvedValue([]);

    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          contactData: { name: '', title: '', emailGuess: null, emailConfidence: 0, location: null, headline: null },
          personalProfile: {
            interests: ['renewable energy'],
            values: ['sustainability'],
            communicationStyle: 'Professional',
            rapportHooks: [],
            networkConnections: [],
          },
          accountInsights: {
            pain: 'High certificate sourcing costs with expiring supplier contracts',
            whyNow: 'Active solar investment signals urgency to secure GoO supply',
            stakeholders: [{ role: 'Procurement', identified: false, name: null }],
          },
          approachBrief: {
            recommendedChannel: 'cold_email',
            toneGuidance: 'Technical',
            opener: 'Reference their solar investment initiative',
            talkingPoints: ['GoO cost reduction'],
            icebreakers: [],
            topicsToAvoid: [],
            timingRationale: 'Active investment phase — good timing',
            connectionPath: null,
          },
          confidence: { extraction: 0, emailGuess: 0, personalProfile: 0.3, accountInsights: 0.6 },
        }),
      }],
    });

    const result = await accountEnricherAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('enrichment');
    expect(result.items[0].payload).toHaveProperty('accountInsights');
    expect(result.items[0].payload).toHaveProperty('approachBrief');
  });

  it('returns empty for fresh accounts', async () => {
    mockAccountFindMany.mockResolvedValue([]);
    const result = await accountEnricherAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
