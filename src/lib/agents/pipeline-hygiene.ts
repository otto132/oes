import { db as prisma } from '@/lib/db';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_HAIKU } from './ai';
import { RecoveryPlaybookSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  staleThresholdDays: 7,
  healthAlertThreshold: 40,
};

const SYSTEM_PROMPT = `You are a deal health analyst for a B2B sales team in the GoO (Guarantees of Origin) and renewable certificates market. When a deal is flagged as at-risk, diagnose exactly why it's struggling and provide a specific, actionable recovery plan. Reference specific activities, emails, and timeline data rather than giving generic advice.`;

export const pipelineHygieneAgent: Agent = {
  name: 'pipeline_hygiene',
  triggers: [{ type: 'cron', schedule: '0 8 * * *' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const staleThreshold = Number(params.staleThresholdDays) || 7;
    const healthThreshold = Number(params.healthAlertThreshold) || 40;

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

    const opportunities = await prisma.opportunity.findMany({
      where: { stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
      include: {
        account: { select: { id: true, name: true, lastActivityAt: true, pain: true, whyNow: true } },
      },
    });

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];

    for (const opp of opportunities) {
      const lastActivityDate = opp.account?.lastActivityAt;
      const daysSinceActivity = lastActivityDate
        ? Math.floor((Date.now() - lastActivityDate.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const avgHealth = Math.round(
        (opp.healthEngagement + opp.healthStakeholders + opp.healthCompetitive + opp.healthTimeline) / 4
      );

      // Determine issue type
      let issueType: 'stale' | 'low_health' | 'overdue_close' | null = null;
      if (daysSinceActivity > staleThreshold) issueType = 'stale';
      else if (avgHealth < healthThreshold) issueType = 'low_health';
      else if (opp.closeDate && opp.closeDate < new Date()) issueType = 'overdue_close';

      if (!issueType) continue;

      try {
        // Get recent activities for context
        const recentActivities = opp.account
          ? await prisma.activity.findMany({
              where: { accountId: opp.account.id },
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: { type: true, summary: true, createdAt: true },
            })
          : [];

        const competitorSignals = opp.account
          ? await prisma.signal.findMany({
              where: { companies: { has: opp.account.name } },
              take: 3,
              orderBy: { createdAt: 'desc' },
              select: { title: true, summary: true },
            })
          : [];

        const daysOverdue = opp.closeDate && opp.closeDate < new Date()
          ? Math.floor((Date.now() - opp.closeDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0;

        const userPrompt = `Analyze this at-risk deal and create a recovery plan:

Deal: ${opp.name}
Stage: ${opp.stage}
Issue: ${issueType} ${issueType === 'stale' ? `(${daysSinceActivity} days since last activity)` : issueType === 'low_health' ? `(health: ${avgHealth}%)` : `(${daysOverdue} days overdue)`}
Health: Engagement=${opp.healthEngagement}%, Stakeholders=${opp.healthStakeholders}%, Competitive=${opp.healthCompetitive}%, Timeline=${opp.healthTimeline}%
Account: ${opp.account?.name || 'Unknown'}
Pain: ${opp.account?.pain || 'Unknown'}
WhyNow: ${opp.account?.whyNow || 'Unknown'}
Close date: ${opp.closeDate?.toISOString().slice(0, 10) || 'Not set'}

Recent activities:
${recentActivities.map((a) => `- ${a.type}: ${a.summary || 'No summary'} (${a.createdAt.toISOString().slice(0, 10)})`).join('\n') || 'None'}

Recent signals:
${competitorSignals.map((s) => `- ${s.title}: ${s.summary || ''}`).join('\n') || 'None'}`;

        const response = await client.messages.parse({
          model: MODEL_HAIKU,
          max_tokens: 1024,
          cache_control: { type: 'ephemeral' },
          system: SYSTEM_PROMPT,
          output_config: { format: zodOutputFormat(RecoveryPlaybookSchema) },
          messages: [{ role: 'user', content: userPrompt }],
        });

        const playbook = response.parsed_output;
        if (!playbook) throw new Error('No parsed output from AI');

        items.push({
          type: 'task_creation',
          title: issueType === 'stale'
            ? `Stale deal: ${opp.name} (${daysSinceActivity}d inactive)`
            : issueType === 'low_health'
            ? `Low health: ${opp.name} (${avgHealth}%)`
            : `Overdue close: ${opp.name} (${daysOverdue}d past)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: playbook.riskLevel === 'likely_lost' ? 0.9 : playbook.riskLevel === 'at_risk' ? 0.7 : 0.5,
          confidenceBreakdown: {
            staleness: daysSinceActivity / (staleThreshold * 2),
            health: avgHealth / 100,
          },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: issueType,
            daysSinceActivity,
            currentHealth: avgHealth,
            diagnosis: playbook.diagnosis,
            recoverySteps: playbook.recoverySteps,
            riskLevel: playbook.riskLevel,
            competitorThreat: playbook.competitorThreat,
          },
          reasoning: playbook.diagnosis,
          priority: playbook.riskLevel === 'likely_lost' || daysOverdue > 0 ? 'High' : 'Normal',
        });
      } catch (err) {
        errors.push({
          message: `Failed to analyze ${opp.name}: ${err instanceof Error ? err.message : String(err)}`,
          source: opp.id,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned: opportunities.length, matched: items.length, skipped: opportunities.length - items.length },
      errors,
    };
  },
};
