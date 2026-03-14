import { db as prisma } from '@/lib/db';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_HAIKU } from './ai';
import { LeadQualificationSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  autoQualifyThreshold: 70,
  autoDisqualifyThreshold: 25,
};

const SYSTEM_PROMPT = `You are a B2B lead qualification specialist for the GoO (Guarantees of Origin) and renewable certificates market. Evaluate leads using the FIUAC framework: Fit, Intent, Urgency, Access, Commercial. Infer scores from available evidence when explicit data is missing. Always explain what evidence supports each score and what information gaps remain.`;

export const leadQualifierAgent: Agent = {
  name: 'lead_qualifier',
  triggers: [
    { type: 'cron', schedule: '0 */4 * * *' },
    { type: 'chain', afterApproval: 'signal_review' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const learnings = (ctx.config.parameters as Record<string, unknown>)?.learnings as string | undefined;

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

    const upstreamContext = ctx.triggerEvent?.payload?.contextBundle as Record<string, unknown> | undefined;

    const leads = await prisma.lead.findMany({
      where: { stage: { in: ['New', 'Researching'] } },
    });

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];

    for (const lead of leads) {
      try {
        // Gather context
        const signals = lead.company
          ? await prisma.signal.findMany({
              where: { companies: { has: lead.company } },
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: { title: true, summary: true },
            })
          : [];

        const emails = lead.company
          ? await prisma.inboxEmail.findMany({
              where: { fromEmail: { contains: lead.company.toLowerCase().split(' ')[0] } },
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: { subject: true, preview: true },
            })
          : [];

        const account = lead.company
          ? await prisma.account.findFirst({
              where: { name: { contains: lead.company, mode: 'insensitive' } },
              select: { pain: true, whyNow: true, type: true },
            })
          : null;

        const systemPrompt = learnings
          ? `${SYSTEM_PROMPT}\n\nLearnings from past deals:\n${learnings}`
          : SYSTEM_PROMPT;

        const userPrompt = `Evaluate this lead:

Company: ${lead.company}
Current stage: ${lead.stage}
Type: ${lead.type || 'Unknown'}
Pain: ${lead.pain || account?.pain || 'Unknown'}
WhyNow: ${account?.whyNow || 'Unknown'}
Existing FIUAC scores: F=${lead.scoreFit || 0}, I=${lead.scoreIntent || 0}, U=${lead.scoreUrgency || 0}, A=${lead.scoreAccess || 0}, C=${lead.scoreCommercial || 0}
(Scores of 0 likely mean unscored, not a zero score)

Recent signals: ${signals.map((s) => `"${s.title}": ${s.summary || ''}`).join('\n') || 'None'}
Recent emails: ${emails.map((e) => `"${e.subject}": ${e.preview || ''}`).join('\n') || 'None'}
${upstreamContext ? `\nUpstream context: ${JSON.stringify(upstreamContext)}` : ''}

Qualify threshold: ${params.autoQualifyThreshold}, Disqualify threshold: ${params.autoDisqualifyThreshold}`;

        const response = await client.messages.parse({
          model: MODEL_HAIKU,
          max_tokens: 1024,
          cache_control: { type: 'ephemeral' },
          system: systemPrompt,
          output_config: { format: zodOutputFormat(LeadQualificationSchema) },
          messages: [{ role: 'user', content: userPrompt }],
        });

        const qual = response.parsed_output;
        if (!qual) throw new Error('No parsed output from AI');
        const avgScore = (qual.scores.fit + qual.scores.intent + qual.scores.urgency + qual.scores.access + qual.scores.commercial) / 5;
        void avgScore; // used for potential future threshold checks

        items.push({
          type: 'lead_qualification',
          title: `${qual.recommendation === 'qualify' ? 'Qualify' : qual.recommendation === 'disqualify' ? 'Disqualify' : 'Review'}: ${lead.company}`,
          accName: lead.company,
          accId: null,
          agent: 'lead_qualifier',
          confidence: qual.recommendation === 'review' ? 0.5 : 0.8,
          confidenceBreakdown: {
            fit: qual.scores.fit / 100,
            intent: qual.scores.intent / 100,
            urgency: qual.scores.urgency / 100,
            access: qual.scores.access / 100,
            commercial: qual.scores.commercial / 100,
          },
          sources: [],
          payload: {
            leadId: lead.id,
            scores: qual.scores,
            recommendation: qual.recommendation,
            reasoning: qual.reasoning,
            gaps: qual.gaps,
            suggestedNextStep: qual.suggestedNextStep,
            inferredFrom: qual.inferredFrom,
            dataPoints: [
              ...(lead.pain ? [`Pain: ${lead.pain}`] : []),
              ...(lead.type ? [`Type: ${lead.type}`] : []),
            ],
            contextBundle: {
              ...upstreamContext,
              qualification: {
                scores: qual.scores,
                reasoning: qual.reasoning,
                gaps: qual.gaps,
              },
            },
          },
          reasoning: qual.reasoning,
          priority: qual.recommendation === 'qualify' ? 'High' : 'Normal',
        });
      } catch (err) {
        errors.push({
          message: `Failed to qualify ${lead.company}: ${err instanceof Error ? err.message : String(err)}`,
          source: lead.id,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned: leads.length, matched: items.length, skipped: 0 },
      errors,
    };
  },
};
