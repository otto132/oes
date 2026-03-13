import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountEnricherAgent } from '../account-enricher';
import type { AgentContext } from '../types';

const mockAccountFindMany = vi.fn();
const mockSignalFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    account: { findMany: (...args: unknown[]) => mockAccountFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
  },
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

describe('Account Enricher Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and triggers', () => {
    expect(accountEnricherAgent.name).toBe('account_enricher');
    expect(accountEnricherAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 6 * * 1' });
    expect(accountEnricherAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'lead_qualification' });
    expect(accountEnricherAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'signal_review' });
  });

  it('creates enrichment items for accounts with missing pain field', async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: 'acc1', name: 'Stale Corp', pain: null, whyNow: null,
        updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    ]);
    mockSignalFindMany.mockResolvedValue([
      { summary: 'Recent funding round announced', source: 'News', sourceUrl: 'https://example.com' },
    ]);

    const result = await accountEnricherAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('enrichment');
    expect(result.items[0].agent).toBe('account_enricher');
  });

  it('returns empty when all accounts are fresh', async () => {
    mockAccountFindMany.mockResolvedValue([]);
    const result = await accountEnricherAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
