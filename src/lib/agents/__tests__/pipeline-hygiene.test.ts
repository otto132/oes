import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pipelineHygieneAgent } from '../pipeline-hygiene';
import type { AgentContext } from '../types';

const mockOppFindMany = vi.fn();
const mockActivityFindMany = vi.fn();
const mockSignalFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    opportunity: { findMany: (...args: unknown[]) => mockOppFindMany(...args) },
    activity: { findMany: (...args: unknown[]) => mockActivityFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
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
    id: 'c1', name: 'pipeline_hygiene', displayName: 'Pipeline Hygiene',
    description: '', status: 'active',
    parameters: { staleThresholdDays: 7, healthAlertThreshold: 40 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Pipeline Hygiene Agent (upgraded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', () => {
    expect(pipelineHygieneAgent.name).toBe('pipeline_hygiene');
    expect(pipelineHygieneAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 8 * * *' });
  });

  it('generates Claude recovery playbook for stale deals', async () => {
    const staleDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    mockOppFindMany.mockResolvedValue([{
      id: 'opp1', name: 'Acme GoO Deal', stage: 'Proposal',
      healthEngagement: 30, healthStakeholders: 50,
      healthCompetitive: 60, healthTimeline: 40,
      closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      account: { id: 'acc1', name: 'Acme Corp', lastActivityAt: staleDate, pain: 'High costs', whyNow: 'Contract renewal' },
    }]);
    mockActivityFindMany.mockResolvedValue([
      { type: 'Email', summary: 'Sent pricing proposal', createdAt: staleDate },
    ]);
    mockSignalFindMany.mockResolvedValue([]);

    mockParse.mockResolvedValue({
      parsed_output: {
        diagnosis: 'Deal stalled after proposal — no follow-up on pricing',
        recoverySteps: [{
          action: 'Send follow-up addressing pricing concerns',
          rationale: 'Last activity was pricing proposal 14 days ago',
          owner: null,
          deadline: 'within 48h',
        }],
        riskLevel: 'at_risk',
        competitorThreat: null,
      },
    });

    const result = await pipelineHygieneAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('task_creation');
    expect(result.items[0].payload).toHaveProperty('diagnosis');
    expect(result.items[0].payload).toHaveProperty('recoverySteps');
    expect(result.items[0].payload).toHaveProperty('riskLevel', 'at_risk');
  });
});
