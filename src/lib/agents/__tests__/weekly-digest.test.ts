import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../types';

const mockOppFindMany = vi.fn();
const mockOppAggregate = vi.fn();
const mockEmailFindMany = vi.fn();
const mockMeetingFindMany = vi.fn();
const mockTaskFindMany = vi.fn();
const mockQueueFindMany = vi.fn();
const mockContactFindMany = vi.fn();
const mockDigestCreate = vi.fn();
const mockTenantFindFirst = vi.fn();
const mockParse = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    opportunity: { findMany: mockOppFindMany, aggregate: mockOppAggregate },
    inboxEmail: { findMany: mockEmailFindMany },
    meeting: { findMany: mockMeetingFindMany },
    task: { findMany: mockTaskFindMany },
    queueItem: { findMany: mockQueueFindMany },
    contact: { findMany: mockContactFindMany },
    weeklyDigest: { create: mockDigestCreate },
    tenant: { findFirst: mockTenantFindFirst },
  },
}));

vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
  getModelForAgent: (_config: unknown, defaultModel: string) => defaultModel,
  logUsage: vi.fn(),
}));

describe('Weekly Digest Agent', () => {
  const ctx: AgentContext = {
    config: {
      id: 'cfg-2', name: 'weekly_digest', displayName: 'Weekly Digest',
      description: 'Weekly CRM summary', status: 'active', parameters: {},
      createdAt: new Date(), updatedAt: new Date(), lastRunAt: null,
    },
    userId: 'system',
  };

  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', async () => {
    const { weeklyDigestAgent } = await import('../weekly-digest');
    expect(weeklyDigestAgent.name).toBe('weekly_digest');
    expect(weeklyDigestAgent.triggers).toContainEqual(expect.objectContaining({ type: 'cron' }));
  });

  it('returns empty items array (writes digest directly)', async () => {
    mockOppFindMany.mockResolvedValue([]);
    mockOppAggregate.mockResolvedValue({ _sum: { amount: 500000 } });
    mockEmailFindMany.mockResolvedValue([]);
    mockMeetingFindMany.mockResolvedValue([]);
    mockTaskFindMany.mockResolvedValue([]);
    mockQueueFindMany.mockResolvedValue([]);
    mockContactFindMany.mockResolvedValue([]);
    mockTenantFindFirst.mockResolvedValue({ id: 'tenant-1' });
    mockDigestCreate.mockResolvedValue({ id: 'digest-1' });
    mockParse.mockResolvedValue({
      parsed_output: {
        pipelineSummary: 'Quiet week.',
        accountParagraphs: [],
        weekAheadSummary: 'No meetings scheduled.',
      },
    });

    const { weeklyDigestAgent } = await import('../weekly-digest');
    const result = await weeklyDigestAgent.analyze(ctx);

    expect(result.items).toHaveLength(0);
    expect(mockDigestCreate).toHaveBeenCalled();
  });

  it('skips when paused', async () => {
    const pausedCtx = { ...ctx, config: { ...ctx.config, status: 'paused' as const } };
    const { weeklyDigestAgent } = await import('../weekly-digest');
    const result = await weeklyDigestAgent.analyze(pausedCtx);
    expect(result.items).toHaveLength(0);
    expect(mockDigestCreate).not.toHaveBeenCalled();
  });
});
