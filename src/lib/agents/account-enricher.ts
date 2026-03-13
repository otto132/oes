import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  stalenessThresholdDays: 30,
  minConfidenceForSuggestion: 0.6,
  fieldsToTrack: ['pain', 'whyNow'],
};

export const accountEnricherAgent: Agent = {
  name: 'account_enricher',
  triggers: [
    { type: 'cron', schedule: '0 6 * * 1' },
    { type: 'chain', afterApproval: 'lead_qualification' },
    { type: 'chain', afterApproval: 'signal_review' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const staleDays = Number(params.stalenessThresholdDays) || 30;
    const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    // If chain-triggered, enrich only the specific account
    let accountFilter: Record<string, unknown> = {};
    if (ctx.triggerEvent?.payload?.accId) {
      accountFilter = { id: String(ctx.triggerEvent.payload.accId) };
    }

    const accounts = await prisma.account.findMany({
      where: {
        ...accountFilter,
        updatedAt: { lt: staleCutoff },
      },
      include: {
        signals: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const account of accounts) {
      // Check for missing/stale fields
      if (!account.pain || !account.whyNow) {
        // Look for hints in recent signals
        const signalHints = account.signals
          .map((s) => s.summary)
          .filter(Boolean)
          .join(' ');

        if (!account.pain && signalHints) {
          matched++;
          items.push({
            type: 'enrichment',
            title: `Update pain for ${account.name}`,
            accName: account.name,
            accId: account.id,
            agent: 'account_enricher',
            confidence: 0.6,
            confidenceBreakdown: { signalBased: 0.6 },
            sources: account.signals.map((s) => ({ name: s.source || 'Signal', url: s.sourceUrl })),
            payload: {
              accountId: account.id,
              field: 'pain',
              currentValue: account.pain || null,
              suggestedValue: `Review recent signals for pain indicators`,
              source: 'cross-reference',
              confidence: 0.6,
            },
            reasoning: `Account "${account.name}" has no pain field set. ${account.signals.length} recent signals available for context.`,
            priority: 'Normal',
          });
        }
      }
    }

    return {
      items,
      metrics: { scanned: accounts.length, matched, skipped: accounts.length - matched },
      errors: [],
    };
  },
};
