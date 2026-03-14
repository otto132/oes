import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signalHunterAgent } from '../signal-hunter';
import type { AgentContext } from '../types';

const mockAccountFindMany = vi.fn();
const mockSignalFindMany = vi.fn();
const mockOppFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    account: { findMany: (...args: unknown[]) => mockAccountFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
    opportunity: { findMany: (...args: unknown[]) => mockOppFindMany(...args) },
  },
}));

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({
    parseURL: vi.fn().mockResolvedValue({
      items: [
        {
          title: 'Acme Corp announces renewable energy initiative',
          link: 'https://news.example.com/acme-renewable',
          contentSnippet: 'Acme Corp is investing in solar energy to reduce costs',
          pubDate: new Date().toISOString(),
        },
      ],
    }),
  })),
}));

const mockParse = vi.fn();
vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'signal_hunter', displayName: 'Signal Hunter',
    description: '', status: 'active',
    parameters: {
      rssSources: [{ name: 'Test News', url: 'https://news.example.com/rss', category: 'ppa_announcement' }],
      minRelevanceThreshold: 60,
      autoDismissBelow: 30,
      competitors: ['CompetitorX'],
    },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Signal Hunter Agent (upgraded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', () => {
    expect(signalHunterAgent.name).toBe('signal_hunter');
    expect(signalHunterAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 */4 * * *' });
  });

  it('uses Claude to score matched signals', async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: 'High energy costs', whyNow: 'Contract renewal' },
    ]);
    mockSignalFindMany.mockResolvedValue([]);
    mockOppFindMany.mockResolvedValue([]);

    mockParse.mockResolvedValue({
      parsed_output: {
        scores: [{
          signalIndex: 0,
          relevance: 85,
          reasoning: 'Direct mention of renewable initiative aligns with account pain',
          category: 'renewable_target',
          actionability: 'Reach out about GoO sourcing',
          accountImpact: 'Supports their stated renewable energy goals',
          isCompetitorSignal: false,
          competitorName: null,
          defensiveAction: null,
        }],
      },
    });

    const result = await signalHunterAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('signal_review');
    expect(result.items[0].confidence).toBeCloseTo(0.85);
    expect(result.items[0].reasoning).toContain('renewable initiative');
    expect(mockParse).toHaveBeenCalledOnce();
  });

  it('deduplicates against existing signals by URL', async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: 'High energy costs' },
    ]);
    mockSignalFindMany.mockResolvedValue([
      { sourceUrl: 'https://news.example.com/acme-renewable' },
    ]);

    const result = await signalHunterAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('returns empty when no RSS sources configured', async () => {
    const emptyCtx = {
      ...ctx,
      config: { ...ctx.config, parameters: { rssSources: [] } },
    };
    const result = await signalHunterAgent.analyze(emptyCtx);
    expect(result.items).toHaveLength(0);
  });
});
