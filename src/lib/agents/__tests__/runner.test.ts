import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgent } from '../runner';
import type { Agent, AgentResult } from '../types';

const mockAgentRunCreate = vi.fn();
const mockAgentRunUpdate = vi.fn();
const mockAgentRunFindFirst = vi.fn();
const mockAgentConfigUpdate = vi.fn();
const mockAgentConfigFindUnique = vi.fn();
const mockQueueItemCreateMany = vi.fn();
const mockUserFindMany = vi.fn();
const mockNotificationFindFirst = vi.fn();
const mockNotificationCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    agentRun: {
      create: (...args: unknown[]) => mockAgentRunCreate(...args),
      update: (...args: unknown[]) => mockAgentRunUpdate(...args),
      findFirst: (...args: unknown[]) => mockAgentRunFindFirst(...args),
    },
    agentConfig: {
      update: (...args: unknown[]) => mockAgentConfigUpdate(...args),
      findUnique: (...args: unknown[]) => mockAgentConfigFindUnique(...args),
    },
    queueItem: {
      createMany: (...args: unknown[]) => mockQueueItemCreateMany(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
    notification: {
      findFirst: (...args: unknown[]) => mockNotificationFindFirst(...args),
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

const successResult: AgentResult = {
  items: [
    {
      type: 'task_creation',
      title: 'Follow up on stale deal',
      accName: 'Acme',
      accId: 'acc1',
      agent: 'pipeline_hygiene',
      confidence: 0.8,
      confidenceBreakdown: { staleness: 0.9 },
      sources: [],
      payload: { opportunityId: 'opp1' },
      reasoning: 'No activity in 10 days',
      priority: 'Normal',
    },
  ],
  metrics: { scanned: 5, matched: 1, skipped: 4 },
  errors: [],
};

const makeAgent = (result: AgentResult = successResult): Agent => ({
  name: 'pipeline_hygiene',
  triggers: [{ type: 'cron', schedule: '0 8 * * *' }],
  analyze: vi.fn().mockResolvedValue(result),
});

describe('Agent Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRunFindFirst.mockResolvedValue(null); // no running agent
    mockAgentConfigFindUnique.mockResolvedValue({
      name: 'pipeline_hygiene',
      status: 'active',
      parameters: {},
    });
    mockAgentRunCreate.mockResolvedValue({ id: 'run1' });
    mockAgentRunUpdate.mockResolvedValue({});
    mockAgentConfigUpdate.mockResolvedValue({});
    mockQueueItemCreateMany.mockResolvedValue({ count: 1 });
    mockUserFindMany.mockResolvedValue([{ id: 'admin1' }]);
    mockNotificationFindFirst.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({ id: 'notif1' });
  });

  it('runs an agent and creates queue items', async () => {
    const agent = makeAgent();
    const run = await runAgent(agent, 'cron');
    expect(agent.analyze).toHaveBeenCalled();
    expect(mockQueueItemCreateMany).toHaveBeenCalled();
    expect(mockAgentRunUpdate).toHaveBeenCalled();
    expect(mockAgentConfigUpdate).toHaveBeenCalled();
  });

  it('skips if agent config is paused', async () => {
    mockAgentConfigFindUnique.mockResolvedValue({
      name: 'pipeline_hygiene',
      status: 'paused',
      parameters: {},
    });
    const agent = makeAgent();
    const run = await runAgent(agent, 'cron');
    expect(run).toBeNull();
    expect(agent.analyze).not.toHaveBeenCalled();
  });

  it('skips if agent is already running (< 10 min)', async () => {
    mockAgentRunFindFirst.mockResolvedValue({
      id: 'existing',
      status: 'running',
      startedAt: new Date(), // just started
    });
    const agent = makeAgent();
    const run = await runAgent(agent, 'cron');
    expect(run).toBeNull();
    expect(agent.analyze).not.toHaveBeenCalled();
  });

  it('marks stale run as failed and proceeds (>= 10 min)', async () => {
    mockAgentRunFindFirst.mockResolvedValue({
      id: 'stale',
      status: 'running',
      startedAt: new Date(Date.now() - 11 * 60 * 1000), // 11 min ago
    });
    const agent = makeAgent();
    await runAgent(agent, 'cron');
    // Should have updated stale run to failed
    expect(mockAgentRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stale' },
        data: expect.objectContaining({ status: 'failed' }),
      })
    );
    expect(agent.analyze).toHaveBeenCalled();
  });

  it('captures errors from agent result without failing run', async () => {
    const result: AgentResult = {
      items: [],
      metrics: { scanned: 1, matched: 0, skipped: 1 },
      errors: [{ message: 'RSS timeout', source: 'feed1', recoverable: true }],
    };
    const agent = makeAgent(result);
    await runAgent(agent, 'cron');
    const updateCall = mockAgentRunUpdate.mock.calls.find(
      (c: any) => c[0]?.data?.status === 'completed'
    );
    expect(updateCall).toBeTruthy();
  });

  it('marks run as failed on uncaught exception', async () => {
    const agent: Agent = {
      name: 'pipeline_hygiene',
      triggers: [],
      analyze: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    };
    await runAgent(agent, 'cron');
    const updateCall = mockAgentRunUpdate.mock.calls.find(
      (c: any) => c[0]?.data?.status === 'failed'
    );
    expect(updateCall).toBeTruthy();
  });
});
