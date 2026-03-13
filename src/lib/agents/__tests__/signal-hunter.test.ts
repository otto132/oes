import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signalHunterAgent } from '../signal-hunter';
import type { AgentContext } from '../types';

const mockAccountFindMany = vi.fn();
const mockSignalFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    account: { findMany: (...args: unknown[]) => mockAccountFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
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

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'signal_hunter', displayName: 'Signal Hunter',
    description: '', status: 'active',
    parameters: {
      rssSources: [{ name: 'Test News', url: 'https://news.example.com/rss', category: 'energy' }],
      minRelevanceThreshold: 60,
      autoDismissBelow: 30,
    },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Signal Hunter Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', () => {
    expect(signalHunterAgent.name).toBe('signal_hunter');
    expect(signalHunterAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 */4 * * *' });
  });

  it('creates signal_review items when RSS matches accounts', async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: 'High energy costs', industry: 'Energy' },
    ]);
    mockSignalFindMany.mockResolvedValue([]); // no existing signals (dedup)

    const result = await signalHunterAgent.analyze(ctx);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].type).toBe('signal_review');
    expect(result.items[0].agent).toBe('signal_hunter');
  });

  it('deduplicates against existing signals by URL', async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: 'High energy costs', industry: 'Energy' },
    ]);
    mockSignalFindMany.mockResolvedValue([
      { sourceUrl: 'https://news.example.com/acme-renewable' },
    ]);

    const result = await signalHunterAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
