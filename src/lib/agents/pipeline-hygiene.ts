import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  staleThresholdDays: 7,
  healthAlertThreshold: 40,
  decayPointsPerWeek: 5,
  stuckStageThresholds: { Discovery: 14, Proposal: 21, Negotiation: 14 },
};

export const pipelineHygieneAgent: Agent = {
  name: 'pipeline_hygiene',
  triggers: [{ type: 'cron', schedule: '0 8 * * *' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const staleThreshold = Number(params.staleThresholdDays) || 7;
    const healthThreshold = Number(params.healthAlertThreshold) || 40;

    // Fetch open opportunities with account and recent activities
    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: { notIn: ['Closed Won', 'Closed Lost'] },
      },
      include: {
        account: { select: { id: true, name: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const opp of opportunities) {
      const lastActivity = opp.activities[0];
      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - lastActivity.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const avgHealth = Math.round(
        (opp.healthEngagement + opp.healthStakeholders + opp.healthCompetition + opp.healthTimeline) / 4
      );

      // Check: stale (no activity)
      if (daysSinceActivity > staleThreshold) {
        matched++;
        items.push({
          type: 'task_creation',
          title: `Stale deal: ${opp.name} (${daysSinceActivity}d inactive)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: Math.min(0.5 + daysSinceActivity * 0.05, 0.95),
          confidenceBreakdown: { staleness: daysSinceActivity / (staleThreshold * 2) },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: 'stale',
            daysSinceActivity,
            currentHealth: avgHealth,
            suggestedAction: getSuggestedAction(opp.stage, 'stale'),
          },
          reasoning: `No activity for ${daysSinceActivity} days (threshold: ${staleThreshold}). Stage: ${opp.stage}.`,
          priority: daysSinceActivity > staleThreshold * 2 ? 'High' : 'Normal',
        });
        continue; // Only flag once per opp
      }

      // Check: low health
      if (avgHealth < healthThreshold) {
        matched++;
        items.push({
          type: 'task_creation',
          title: `Low health: ${opp.name} (health: ${avgHealth}%)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: 0.7,
          confidenceBreakdown: { health: avgHealth / 100 },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: 'low_health',
            daysSinceActivity,
            currentHealth: avgHealth,
            suggestedAction: getSuggestedAction(opp.stage, 'low_health'),
          },
          reasoning: `Deal health at ${avgHealth}% (threshold: ${healthThreshold}%). Needs attention.`,
          priority: avgHealth < healthThreshold / 2 ? 'High' : 'Normal',
        });
        continue;
      }

      // Check: overdue close date
      if (opp.closeDate && opp.closeDate < new Date()) {
        matched++;
        const daysOverdue = Math.floor((Date.now() - opp.closeDate.getTime()) / (24 * 60 * 60 * 1000));
        items.push({
          type: 'task_creation',
          title: `Overdue close: ${opp.name} (${daysOverdue}d past)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: 0.85,
          confidenceBreakdown: { overdue: Math.min(daysOverdue / 30, 1) },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: 'overdue_close',
            daysSinceActivity,
            currentHealth: avgHealth,
            suggestedAction: 'Update close date or mark as Closed Lost',
          },
          reasoning: `Close date was ${daysOverdue} days ago. Update or close the deal.`,
          priority: 'High',
        });
      }
    }

    return {
      items,
      metrics: { scanned: opportunities.length, matched, skipped: opportunities.length - matched },
      errors: [],
    };
  },
};

function getSuggestedAction(stage: string, reason: string): string {
  if (reason === 'stale') {
    const actions: Record<string, string> = {
      Discovery: 'Schedule discovery call or send check-in email',
      Proposal: 'Follow up on proposal — ask if they have questions',
      Negotiation: 'Reach out about pricing/terms concerns',
    };
    return actions[stage] || 'Schedule check-in call';
  }
  if (reason === 'low_health') {
    return 'Review deal health — identify which areas need improvement';
  }
  return 'Review and take action';
}
