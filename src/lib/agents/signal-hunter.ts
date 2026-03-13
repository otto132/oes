import prisma from '@/lib/prisma';
import RSSParser from 'rss-parser';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  minRelevanceThreshold: 60,
  autoDismissBelow: 30,
  rssSources: [] as { name: string; url: string; category: string }[],
  matchKeywords: [] as string[],
};

const parser = new RSSParser();

export const signalHunterAgent: Agent = {
  name: 'signal_hunter',
  triggers: [{ type: 'cron', schedule: '0 */4 * * *' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const sources = (params.rssSources as typeof DEFAULT_PARAMS.rssSources) || [];
    const dismissBelow = Number(params.autoDismissBelow) || 30;

    if (sources.length === 0) {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 0 }, errors: [] };
    }

    // Load accounts for matching
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true, pain: true, industry: true },
    });

    // Load existing signal URLs for dedup
    const existingSignals = await prisma.signal.findMany({
      where: { sourceUrl: { not: null } },
      select: { sourceUrl: true },
    });
    const existingUrls = new Set(existingSignals.map((s) => s.sourceUrl));

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];
    let scanned = 0;

    for (const source of sources) {
      try {
        const feed = await parser.parseURL(source.url);
        for (const entry of feed.items || []) {
          scanned++;
          const url = entry.link || '';

          // Dedup
          if (existingUrls.has(url)) continue;

          // Match against accounts
          const text = `${entry.title || ''} ${entry.contentSnippet || ''}`.toLowerCase();
          const matchedAccounts = accounts.filter((acc) => {
            const nameMatch = text.includes(acc.name.toLowerCase());
            const painMatch = acc.pain && text.includes(acc.pain.toLowerCase().split(' ')[0]);
            return nameMatch || painMatch;
          });

          if (matchedAccounts.length === 0) continue;

          // Simple relevance scoring
          const relevance = Math.min(
            matchedAccounts.length * 30 + (entry.contentSnippet ? 20 : 0) + 20,
            100
          );

          if (relevance < dismissBelow) continue;

          items.push({
            type: 'signal_review',
            title: entry.title || 'Untitled signal',
            accName: matchedAccounts[0].name,
            accId: matchedAccounts[0].id,
            agent: 'signal_hunter',
            confidence: relevance / 100,
            confidenceBreakdown: {
              accountMatch: matchedAccounts.length / accounts.length,
              contentQuality: entry.contentSnippet ? 0.8 : 0.3,
            },
            sources: [{ name: source.name, url }],
            payload: {
              signalType: source.category,
              headline: entry.title || '',
              summary: (entry.contentSnippet || '').slice(0, 500),
              sourceUrl: url,
              sourceName: source.name,
              relevanceScore: relevance,
              matchedAccounts: matchedAccounts.map((a) => ({
                id: a.id,
                name: a.name,
                matchReason: text.includes(a.name.toLowerCase()) ? 'name_match' : 'pain_match',
              })),
              rawData: { pubDate: entry.pubDate },
            },
            reasoning: `Found "${entry.title}" matching ${matchedAccounts.length} account(s). Relevance: ${relevance}/100.`,
            priority: relevance >= 80 ? 'High' : 'Normal',
          });

          existingUrls.add(url); // prevent dupes within same run
        }
      } catch (err) {
        errors.push({
          message: `Failed to fetch RSS: ${source.name} (${source.url})`,
          source: source.name,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned, matched: items.length, skipped: scanned - items.length },
      errors,
    };
  },
};
