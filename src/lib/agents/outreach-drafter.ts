import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  templateStyle: 'consultative',
  maxSequenceLength: 4,
  maxEmailWords: 200,
  claudeModel: 'claude-sonnet-4-6',
};

export const outreachDrafterAgent: Agent = {
  name: 'outreach_drafter',
  triggers: [
    { type: 'cron', schedule: '0 9 * * 1-5' },
    { type: 'chain', afterApproval: 'lead_qualification' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 0 },
        errors: [{ message: 'ANTHROPIC_API_KEY not configured', recoverable: false }],
      };
    }

    const anthropic = new Anthropic({ apiKey });

    // Find leads/accounts needing outreach
    const leads = await prisma.lead.findMany({
      where: { status: 'Qualified' },
      take: 10,
    });

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];

    for (const lead of leads) {
      try {
        // Get account context if exists
        const account = lead.company
          ? await prisma.account.findFirst({
              where: { name: { contains: lead.company, mode: 'insensitive' } },
              include: {
                contacts: { take: 1, orderBy: { warmth: 'desc' } },
                signals: { take: 3, orderBy: { createdAt: 'desc' } },
              },
            })
          : null;

        const contact = account?.contacts?.[0];
        const signals = account?.signals || [];

        const prompt = `You are a B2B sales outreach specialist. Write a ${params.templateStyle} email.

Context:
- Company: ${lead.company}
- Pain: ${account?.pain || lead.pain || 'Unknown'}
- Why Now: ${account?.whyNow || 'Not specified'}
- Contact: ${contact ? `${contact.name}, ${contact.title}` : 'Unknown'}
- Recent signals: ${signals.map((s) => s.title).join('; ') || 'None'}
- Sequence step: 1 of ${params.maxSequenceLength}

Generate a JSON response with:
- subjectA: first subject line option
- subjectB: second subject line option
- body: email body (max ${params.maxEmailWords} words)
- reasoning: one line explaining your approach`;

        const response = await anthropic.messages.create({
          model: String(params.claudeModel),
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        let parsed: Record<string, string>;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subjectA: lead.company, subjectB: lead.company, body: text, reasoning: '' };
        } catch {
          parsed = { subjectA: `Introduction: ${lead.company}`, subjectB: `Quick question for ${lead.company}`, body: text, reasoning: 'Generated from raw response' };
        }

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
            subject: parsed.subjectA || `Introduction: ${lead.company}`,
            subjectVariantB: parsed.subjectB || parsed.subjectA || '',
            body: parsed.body || '',
            templateStyle: String(params.templateStyle),
            contextUsed: [
              ...(account?.pain ? ['pain'] : []),
              ...(account?.whyNow ? ['whyNow'] : []),
              ...(signals.length > 0 ? ['signals'] : []),
            ],
            sequenceStep: 1,
            sequenceTotal: Number(params.maxSequenceLength),
            previousOutreachId: null,
          },
          reasoning: parsed.reasoning || `Generated ${params.templateStyle} outreach for ${lead.company}.`,
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
