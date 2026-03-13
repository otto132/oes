import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pipelineHygieneAgent } from '../pipeline-hygiene';
import type { AgentContext } from '../types';

const mockFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    opportunity: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'pipeline_hygiene', displayName: 'Pipeline Hygiene',
    description: '', status: 'active',
    parameters: { staleThresholdDays: 7, healthAlertThreshold: 40, decayPointsPerWeek: 5 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Pipeline Hygiene Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', () => {
    expect(pipelineHygieneAgent.name).toBe('pipeline_hygiene');
    expect(pipelineHygieneAgent.triggers).toContainEqual({
      type: 'cron', schedule: '0 8 * * *',
    });
  });

  it('flags stale opportunities with no recent activity', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'opp1', name: 'Stale Deal', stage: 'Discovery',
        healthEngagement: 60, healthStakeholders: 50,
        healthCompetition: 70, healthTimeline: 40,
        closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        account: { id: 'acc1', name: 'Acme Corp' },
        activities: [], // no recent activities
      },
    ]);

    const result = await pipelineHygieneAgent.analyze(ctx);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].type).toBe('task_creation');
    expect(result.items[0].agent).toBe('pipeline_hygiene');
  });

  it('returns empty when no issues found', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await pipelineHygieneAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
    expect(result.metrics.scanned).toBe(0);
  });
});
