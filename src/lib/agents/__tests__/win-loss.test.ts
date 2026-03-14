import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeWinLoss } from '../win-loss';

const mockOppFindUnique = vi.fn();
const mockSignalFindMany = vi.fn();
const mockActivityFindMany = vi.fn();
const mockQueueFindMany = vi.fn();
const mockWinLossCreate = vi.fn();
const mockWinLossCount = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    opportunity: { findUnique: (...args: unknown[]) => mockOppFindUnique(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
    activity: { findMany: (...args: unknown[]) => mockActivityFindMany(...args) },
    queueItem: { findMany: (...args: unknown[]) => mockQueueFindMany(...args) },
    winLossAnalysis: {
      create: (...args: unknown[]) => mockWinLossCreate(...args),
      count: (...args: unknown[]) => mockWinLossCount(...args),
    },
  },
}));

const mockParse = vi.fn();
vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
}));

describe('Win/Loss Analysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('analyzes a won deal and stores results', async () => {
    mockOppFindUnique.mockResolvedValue({
      id: 'opp1', name: 'Acme GoO Deal', stage: 'ClosedWon',
      account: { id: 'acc1', name: 'Acme Corp', pain: 'High costs' },
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });
    mockSignalFindMany.mockResolvedValue([]);
    mockActivityFindMany.mockResolvedValue([]);
    mockQueueFindMany.mockResolvedValue([]);
    mockWinLossCount.mockResolvedValue(0);

    mockParse.mockResolvedValue({
      parsed_output: {
        outcome: 'won',
        keyFactors: ['Strong champion'],
        whatWorked: ['Warm intro'],
        whatDidnt: ['Initial cold email ignored'],
        timingInsights: 'Engaged 2 months before renewal',
        channelEffectiveness: 'Warm intro > cold email',
        competitorInsight: null,
        recommendations: ['Prioritize warm intros'],
      },
    });

    await analyzeWinLoss('opp1');
    expect(mockWinLossCreate).toHaveBeenCalledOnce();
    expect(mockParse).toHaveBeenCalledOnce();
  });
});
