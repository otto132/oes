import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  autoQualifyThreshold: 70,
  autoDisqualifyThreshold: 25,
};

export const leadQualifierAgent: Agent = {
  name: 'lead_qualifier',
  triggers: [
    { type: 'cron', schedule: '0 */4 * * *' },
    { type: 'chain', afterApproval: 'signal_review' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const qualifyThreshold = Number(params.autoQualifyThreshold) || 70;
    const disqualifyThreshold = Number(params.autoDisqualifyThreshold) || 25;

    // Fetch leads that need scoring (New or Contacted status)
    const leads = await prisma.lead.findMany({
      where: { status: { in: ['New', 'Contacted'] } },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const lead of leads) {
      const f = lead.scoreFit || 0;
      const i = lead.scoreIntent || 0;
      const u = lead.scoreUrgency || 0;
      const a = lead.scoreAccess || 0;
      const c = lead.scoreCapacity || 0;
      const avgScore = (f + i + u + a + c) / 5;

      let recommendation: 'qualify' | 'disqualify' | 'review';
      if (avgScore >= qualifyThreshold) recommendation = 'qualify';
      else if (avgScore <= disqualifyThreshold) recommendation = 'disqualify';
      else recommendation = 'review';

      matched++;
      const dataPoints: string[] = [];
      if (lead.pain) dataPoints.push(`Pain: ${lead.pain}`);
      if (lead.type) dataPoints.push(`Type: ${lead.type}`);

      items.push({
        type: 'lead_qualification',
        title: `${recommendation === 'qualify' ? 'Qualify' : recommendation === 'disqualify' ? 'Disqualify' : 'Review'}: ${lead.company}`,
        accName: lead.company,
        accId: null,
        agent: 'lead_qualifier',
        confidence: recommendation === 'review' ? 0.5 : 0.8,
        confidenceBreakdown: { fit: f / 100, intent: i / 100, urgency: u / 100, access: a / 100, capacity: c / 100 },
        sources: [],
        payload: {
          leadId: lead.id,
          scores: { f, i, u, a, c },
          recommendation,
          reasoning: `FIUAC avg: ${avgScore.toFixed(0)}. ${recommendation === 'qualify' ? 'Above' : recommendation === 'disqualify' ? 'Below' : 'Between'} thresholds.`,
          dataPoints,
          lookAlikeScore: null,
          engagementVelocity: null,
          timingSignals: [],
        },
        reasoning: `Lead "${lead.company}" scored ${avgScore.toFixed(0)} avg FIUAC. Recommendation: ${recommendation}.`,
        priority: recommendation === 'qualify' ? 'High' : 'Normal',
      });
    }

    return {
      items,
      metrics: { scanned: leads.length, matched, skipped: 0 },
      errors: [],
    };
  },
};
