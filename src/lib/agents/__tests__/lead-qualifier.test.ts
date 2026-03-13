import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leadQualifierAgent } from '../lead-qualifier';
import type { AgentContext } from '../types';

const mockLeadFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    lead: { findMany: (...args: unknown[]) => mockLeadFindMany(...args) },
  },
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

describe('Lead Qualifier Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and triggers', () => {
    expect(leadQualifierAgent.name).toBe('lead_qualifier');
    expect(leadQualifierAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 */4 * * *' });
    expect(leadQualifierAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'signal_review' });
  });

  it('creates qualify recommendation for high-scoring leads', async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        id: 'l1', company: 'Hot Corp', type: 'Enterprise', country: 'Finland',
        pain: 'High energy costs', scoreFit: 80, scoreIntent: 75,
        scoreUrgency: 70, scoreAccess: 85, scoreCommercial: 90,
        stage: 'New', createdAt: new Date(),
      },
    ]);

    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('lead_qualification');
    const payload = result.items[0].payload as Record<string, unknown>;
    expect(payload.recommendation).toBe('qualify');
  });

  it('creates disqualify recommendation for low-scoring leads', async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        id: 'l2', company: 'Cold Corp', type: 'SMB', country: 'Unknown',
        pain: '', scoreFit: 10, scoreIntent: 15,
        scoreUrgency: 20, scoreAccess: 10, scoreCommercial: 5,
        stage: 'New', createdAt: new Date(),
      },
    ]);

    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    const payload = result.items[0].payload as Record<string, unknown>;
    expect(payload.recommendation).toBe('disqualify');
  });

  it('returns empty for no leads', async () => {
    mockLeadFindMany.mockResolvedValue([]);
    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
