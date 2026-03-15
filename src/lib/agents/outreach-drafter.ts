import { db as prisma } from '@/lib/db';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET, getModelForAgent, logUsage, sanitizeForPrompt } from './ai';
import { OutreachDraftSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  templateStyle: 'consultative',
  maxSequenceLength: 4,
  maxEmailWords: 200,
};

const SYSTEM_PROMPT = `You are a B2B sales outreach specialist for the GoO (Guarantees of Origin) and renewable certificates market. Write personalized, compelling outreach emails. Always adapt your tone to the contact's communication style and use specific details from the context provided.`;

export const outreachDrafterAgent: Agent = {
  name: 'outreach_drafter',
  triggers: [
    { type: 'cron', schedule: '0 9 * * 1-5' },
    { type: 'chain', afterApproval: 'lead_qualification' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const learnings = (ctx.config.parameters as Record<string, unknown>)?.learnings as string | undefined;
    const model = getModelForAgent(ctx.config, MODEL_SONNET);

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
      where: { stage: 'Qualified' },
      take: 10,
    });

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];

    for (const lead of leads) {
      try {
        const account = lead.company
          ? await prisma.account.findFirst({
              where: { name: { contains: lead.company, mode: 'insensitive' } },
              include: { contacts: { take: 1, orderBy: { warmth: 'desc' } } },
            })
          : null;

        const contact = account?.contacts?.[0];
        const signals = account
          ? await prisma.signal.findMany({
              where: { companies: { has: account.name } },
              take: 3,
              orderBy: { createdAt: 'desc' },
            })
          : [];

        const systemPrompt = learnings
          ? `${SYSTEM_PROMPT}\n\nLearnings from past deals:\n${learnings}`
          : SYSTEM_PROMPT;

        const userPrompt = `Write a ${params.templateStyle} email.

Context:
- Company: ${sanitizeForPrompt(lead.company)}
- Pain: ${sanitizeForPrompt(account?.pain || lead.pain) || 'Unknown'}
- Why Now: ${sanitizeForPrompt(account?.whyNow) || 'Not specified'}
- Contact: ${contact ? `${sanitizeForPrompt(contact.name)}, ${sanitizeForPrompt(contact.title)}` : 'Unknown'}
- Recent signals: ${signals.map((s) => sanitizeForPrompt(s.title)).join('; ') || 'None'}
- Sequence step: 1 of ${params.maxSequenceLength}
- Max words: ${params.maxEmailWords}
${upstreamContext ? `\nUpstream context: ${JSON.stringify(upstreamContext)}` : ''}

Generate the outreach email with two subject line variants.`;

        const callStart = Date.now();
        const response = await client.messages.parse({
          model,
          max_tokens: 1024,
          thinking: { type: 'adaptive' },
          cache_control: { type: 'ephemeral' },
          system: systemPrompt,
          output_config: { format: zodOutputFormat(OutreachDraftSchema) },
          messages: [{ role: 'user', content: userPrompt }],
        });
        await logUsage('outreach_drafter', model, response, Date.now() - callStart);

        const draft = response.parsed_output;
        if (!draft) throw new Error('No parsed output from AI');

        items.push({
          type: 'outreach_draft',
          title: `Draft outreach: ${lead.company}`,
          accName: account?.name || lead.company,
          accId: account?.id || null,
          agent: 'outreach_drafter',
          confidence: 0.7,
          confidenceBreakdown: { contextRichness: signals.length > 0 ? 0.8 : 0.4 },
          sources: signals.map((s) => ({ name: s.source || 'Signal', url: s.sourceUrl })),
          payload: {
            contactId: contact?.id || null,
            accountId: account?.id || null,
            subject: draft.subjectA,
            subjectVariantB: draft.subjectB,
            body: draft.body,
            introRequestMessage: draft.introRequestMessage,
            templateStyle: String(params.templateStyle),
            toneUsed: draft.toneUsed,
            personalizationHooks: draft.personalizationHooks,
            contextUsed: [
              ...(account?.pain ? ['pain'] : []),
              ...(account?.whyNow ? ['whyNow'] : []),
              ...(signals.length > 0 ? ['signals'] : []),
            ],
            sequenceStep: 1,
            sequenceTotal: Number(params.maxSequenceLength),
            previousOutreachId: null,
            contextBundle: upstreamContext || undefined,
          },
          reasoning: draft.reasoning,
          priority: 'Normal',
        });
      } catch (err) {
        errors.push({
          message: `Failed to draft for ${lead.company}: ${err instanceof Error ? err.message : String(err)}`,
          source: lead.id,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned: leads.length, matched: items.length, skipped: leads.length - items.length },
      errors,
    };
  },
};
