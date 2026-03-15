import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  estimateCost,
  checkSpendCap,
  checkRunLimit,
  checkCircuitBreaker,
  logUsage,
  getModelForAgent,
  SpendCapExceededError,
  RunLimitExceededError,
  CircuitBreakerOpenError,
  MODEL_SONNET,
  MODEL_HAIKU,
} from '../ai';

// Mock prisma
vi.mock('@/lib/db', () => ({
  db: {
    aiUsageLog: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    agentConfig: {
      findUnique: vi.fn(),
    },
    agentRun: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { db as prisma } from '@/lib/db';

const mockedPrisma = vi.mocked(prisma);

describe('estimateCost', () => {
  it('calculates Sonnet cost correctly', () => {
    // 1000 input tokens * $3/M + 500 output tokens * $15/M
    const cost = estimateCost(MODEL_SONNET, 1000, 500);
    expect(cost).toBeCloseTo(0.003 + 0.0075, 6);
  });

  it('calculates Haiku cost correctly', () => {
    // 1000 input * $0.80/M + 500 output * $4/M
    const cost = estimateCost(MODEL_HAIKU, 1000, 500);
    expect(cost).toBeCloseTo(0.0008 + 0.002, 6);
  });

  it('falls back to Sonnet pricing for unknown model', () => {
    const cost = estimateCost('unknown-model', 1000, 500);
    expect(cost).toBeCloseTo(estimateCost(MODEL_SONNET, 1000, 500), 6);
  });
});

describe('checkSpendCap', () => {
  const originalEnv = process.env.AI_DAILY_SPEND_CAP_USD;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AI_DAILY_SPEND_CAP_USD = originalEnv;
    } else {
      delete process.env.AI_DAILY_SPEND_CAP_USD;
    }
  });

  it('passes when under cap', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = '10';
    mockedPrisma.aiUsageLog.aggregate.mockResolvedValue({
      _sum: { estimatedCostUsd: 5.0 },
    } as any);

    await expect(checkSpendCap()).resolves.toBeUndefined();
  });

  it('throws SpendCapExceededError when over cap', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = '10';
    mockedPrisma.aiUsageLog.aggregate.mockResolvedValue({
      _sum: { estimatedCostUsd: 12.5 },
    } as any);

    await expect(checkSpendCap()).rejects.toThrow(SpendCapExceededError);
  });

  it('filters by agent when agentName provided', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = '10';
    mockedPrisma.aiUsageLog.aggregate.mockResolvedValue({
      _sum: { estimatedCostUsd: 1.0 },
    } as any);

    await checkSpendCap('signal_hunter');
    expect(mockedPrisma.aiUsageLog.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentName: 'signal_hunter' }),
      }),
    );
  });
});

describe('checkRunLimit', () => {
  it('passes when no limit configured', async () => {
    mockedPrisma.agentConfig.findUnique.mockResolvedValue({
      parameters: {},
    } as any);

    await expect(checkRunLimit('signal_hunter')).resolves.toBeUndefined();
  });

  it('passes when under limit', async () => {
    mockedPrisma.agentConfig.findUnique.mockResolvedValue({
      parameters: { maxRunsPerDay: 5 },
    } as any);
    mockedPrisma.agentRun.count.mockResolvedValue(3);

    await expect(checkRunLimit('signal_hunter')).resolves.toBeUndefined();
  });

  it('throws RunLimitExceededError when at limit', async () => {
    mockedPrisma.agentConfig.findUnique.mockResolvedValue({
      parameters: { maxRunsPerDay: 5 },
    } as any);
    mockedPrisma.agentRun.count.mockResolvedValue(5);

    await expect(checkRunLimit('signal_hunter')).rejects.toThrow(RunLimitExceededError);
  });
});

describe('checkCircuitBreaker', () => {
  it('passes when last runs are successful', async () => {
    mockedPrisma.agentRun.findMany.mockResolvedValue([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'failed' },
    ] as any);

    await expect(checkCircuitBreaker('signal_hunter')).resolves.toBeUndefined();
  });

  it('throws CircuitBreakerOpenError after 3 consecutive failures', async () => {
    mockedPrisma.agentRun.findMany.mockResolvedValue([
      { status: 'failed' },
      { status: 'failed' },
      { status: 'failed' },
    ] as any);

    await expect(checkCircuitBreaker('signal_hunter')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('passes when fewer than 3 runs exist', async () => {
    mockedPrisma.agentRun.findMany.mockResolvedValue([
      { status: 'failed' },
      { status: 'failed' },
    ] as any);

    await expect(checkCircuitBreaker('signal_hunter')).resolves.toBeUndefined();
  });

  it('resets after a successful run', async () => {
    mockedPrisma.agentRun.findMany.mockResolvedValue([
      { status: 'completed' },
      { status: 'failed' },
      { status: 'failed' },
    ] as any);

    await expect(checkCircuitBreaker('signal_hunter')).resolves.toBeUndefined();
  });
});

describe('logUsage', () => {
  it('creates AiUsageLog record with correct token counts and cost', async () => {
    mockedPrisma.aiUsageLog.create.mockResolvedValue({} as any);

    const response = {
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 100,
      },
    };

    await logUsage('signal_hunter', MODEL_SONNET, response, 1234, 'cron');

    expect(mockedPrisma.aiUsageLog.create).toHaveBeenCalledWith({
      data: {
        agentName: 'signal_hunter',
        model: MODEL_SONNET,
        inputTokens: 1000,
        outputTokens: 500,
        cacheRead: 200,
        cacheCreation: 100,
        estimatedCostUsd: estimateCost(MODEL_SONNET, 1000, 500),
        durationMs: 1234,
        trigger: 'cron',
      },
    });
  });

  it('handles missing usage fields gracefully', async () => {
    mockedPrisma.aiUsageLog.create.mockResolvedValue({} as any);

    await logUsage('signal_hunter', MODEL_HAIKU, { usage: {} }, 100);

    expect(mockedPrisma.aiUsageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheCreation: 0,
        estimatedCostUsd: 0,
      }),
    });
  });
});

describe('getModelForAgent', () => {
  it('returns config override when set to valid model', () => {
    const config = { parameters: { model: MODEL_HAIKU } };
    expect(getModelForAgent(config, MODEL_SONNET)).toBe(MODEL_HAIKU);
  });

  it('returns default when no override set', () => {
    const config = { parameters: {} };
    expect(getModelForAgent(config, MODEL_SONNET)).toBe(MODEL_SONNET);
  });

  it('returns default when override is invalid', () => {
    const config = { parameters: { model: 'invalid-model' } };
    expect(getModelForAgent(config, MODEL_SONNET)).toBe(MODEL_SONNET);
  });

  it('returns default when config is null', () => {
    expect(getModelForAgent(null, MODEL_HAIKU)).toBe(MODEL_HAIKU);
  });
});
