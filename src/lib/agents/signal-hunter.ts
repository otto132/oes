import { db as prisma } from '@/lib/db';
import RSSParser from 'rss-parser';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { SignalScoreSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  minRelevanceThreshold: 60,
  autoDismissBelow: 30,
  rssSources: [] as { name: string; url: string; category: string }[],
  competitors: [] as string[],
};

const parser = new RSSParser();

const SYSTEM_PROMPT = `You are a market signal analyst for the GoO (Guarantees of Origin) and renewable certificates market. Score each signal's relevance to the matched account based on their specific pain points, current opportunities, and market position. Be precise about why a signal matters and what action the sales team should take.`;

export const signalHunterAgent: Agent = {
  name: 'signal_hunter',
  triggers: [{ type: 'cron', schedule: '0 */4 * * *' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const sources = (params.rssSources as typeof DEFAULT_PARAMS.rssSources) || [];
    const dismissBelow = Number(params.autoDismissBelow) || 30;
    const competitors = (params.competitors as string[]) || [];

    if (sources.length === 0) {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 0 }, errors: [] };
    }

    let client: ReturnType<typeof getAnthropicClient>;
    try {
      client = getAnthropicClient();
    } catch {
      return {
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 0 },
        errors: [{ message: 'ANTHROPIC_API_KEY not configured', recoverable: false }],
      };
    }

    const accounts = await prisma.account.findMany({
      select: { id: true, name: true, pain: true, whyNow: true },
    });

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
        const candidates: { entry: RSSParser.Item; matchedAccounts: typeof accounts }[] = [];

        for (const entry of feed.items || []) {
          scanned++;
          const url = entry.link || '';
          if (existingUrls.has(url)) continue;

          const text = `${entry.title || ''} ${entry.contentSnippet || ''}`.toLowerCase();
          const matchedAccounts = accounts.filter((acc) => {
            const nameMatch = text.includes(acc.name.toLowerCase());
            const painMatch = acc.pain && text.includes(acc.pain.toLowerCase().split(' ')[0]);
            const competitorMatch = competitors.some((c) => text.includes(c.toLowerCase()));
            return nameMatch || painMatch || competitorMatch;
          });

          if (matchedAccounts.length === 0) continue;
          candidates.push({ entry, matchedAccounts });
          existingUrls.add(url);
        }

        if (candidates.length === 0) continue;

        // Batch Claude scoring for this source
        const signalDescriptions = candidates.map((c, i) => {
          const accs = c.matchedAccounts.map((a) =>
            `${a.name} (pain: ${a.pain || 'unknown'}, whyNow: ${a.whyNow || 'unknown'})`
          ).join('; ');
          return `Signal ${i}: "${c.entry.title}" — ${c.entry.contentSnippet || 'No snippet'}. Matched accounts: ${accs}`;
        }).join('\n\n');

        const userPrompt = `Score these ${candidates.length} signals for relevance to their matched accounts:\n\n${signalDescriptions}${competitors.length > 0 ? `\n\nKnown competitors: ${competitors.join(', ')}` : ''}`;

        const response = await client.messages.parse({
          model: MODEL_SONNET,
          max_tokens: 2048,
          cache_control: { type: 'ephemeral' },
          system: SYSTEM_PROMPT,
          output_config: { format: zodOutputFormat(SignalScoreSchema) },
          messages: [{ role: 'user', content: userPrompt }],
        });

        for (const score of response.parsed_output.scores) {
          if (score.signalIndex >= candidates.length) continue;
          if (score.relevance < dismissBelow) continue;

          const candidate = candidates[score.signalIndex];
          const url = candidate.entry.link || '';
          const primaryAccount = candidate.matchedAccounts[0];

          items.push({
            type: 'signal_review',
            title: candidate.entry.title || 'Untitled signal',
            accName: primaryAccount.name,
            accId: primaryAccount.id,
            agent: 'signal_hunter',
            confidence: score.relevance / 100,
            confidenceBreakdown: {
              relevance: score.relevance / 100,
              accountMatch: candidate.matchedAccounts.length / accounts.length,
            },
            sources: [{ name: source.name, url }],
            payload: {
              signalType: score.category,
              headline: candidate.entry.title || '',
              summary: (candidate.entry.contentSnippet || '').slice(0, 500),
              sourceUrl: url,
              sourceName: source.name,
              relevanceScore: score.relevance,
              reasoning: score.reasoning,
              actionability: score.actionability,
              accountImpact: score.accountImpact,
              isCompetitorSignal: score.isCompetitorSignal,
              competitorName: score.competitorName,
              defensiveAction: score.defensiveAction,
              matchedAccounts: candidate.matchedAccounts.map((a) => ({
                id: a.id,
                name: a.name,
              })),
              rawData: { pubDate: candidate.entry.pubDate },
              contextBundle: {
                signals: [{
                  title: candidate.entry.title || '',
                  relevance: score.reasoning,
                  source: source.name,
                }],
                competitorActivity: score.isCompetitorSignal && score.competitorName
                  ? [{ competitor: score.competitorName, activity: score.reasoning }]
                  : undefined,
              },
            },
            reasoning: score.reasoning,
            priority: score.relevance >= 80 ? 'High' : 'Normal',
          });
        }
      } catch (err) {
        errors.push({
          message: `Failed to process source: ${source.name} (${source.url}): ${err instanceof Error ? err.message : String(err)}`,
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
