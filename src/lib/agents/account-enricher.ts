import { db as prisma } from '@/lib/db';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { EnrichmentResultSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  stalenessThresholdDays: 30,
};

const SYSTEM_PROMPT = `You are an account intelligence specialist for a B2B sales team in the GoO (Guarantees of Origin) and renewable certificates market.

Your job is to synthesize all available information about an account and its contacts to produce:
1. Account pain points and whyNow timing triggers (with evidence)
2. A personal profile of key contacts (interests, values, communication style, rapport hooks)
3. An approach brief (recommended channel, tone, talking points, icebreakers)
4. Email pattern guesses for contacts (based on domain conventions)
5. Mutual connection paths with the sales team

When web search is available, research the contact's public presence: conference talks, articles, social media, awards, education. Use this to build the personal profile.

Always output valid JSON matching the EnrichmentResult schema. Set confidence scores honestly — lower for inferred data, higher for directly extracted data.`;

const STAGE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per stage

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

    // If chain-triggered, enrich only the specific account
    let accountFilter: Record<string, unknown> = {};
    if (ctx.triggerEvent?.payload?.accId) {
      accountFilter = { id: String(ctx.triggerEvent.payload.accId) };
    }

    const accounts = await prisma.account.findMany({
      where: {
        ...accountFilter,
        OR: [
          { updatedAt: { lt: staleCutoff } },
          { pain: "" },
          { whyNow: "" },
        ],
      },
    });

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];

    // Load team LinkedIn data for mutual connection detection
    const teamMembers = await prisma.user.findMany({
      where: { linkedinConnections: { not: null } },
      select: { id: true, name: true, linkedinConnections: true },
    });

    for (const account of accounts) {
      try {
        // Gather all internal context
        const signals = await prisma.signal.findMany({
          where: { companies: { has: account.name } },
          take: 5,
          orderBy: { createdAt: 'desc' },
        });

        const contacts = await prisma.contact.findMany({
          where: { accountId: account.id },
          select: { id: true, name: true, title: true, email: true, linkedinData: true },
        });

        const emails = await prisma.inboxEmail.findMany({
          where: { accountId: account.id },
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: { subject: true, preview: true, fromEmail: true },
        });

        const primaryContact = contacts[0];
        const domain = primaryContact?.email?.split('@')[1] ||
          emails[0]?.fromEmail?.split('@')[1] || '';

        const userPrompt = `Enrich this account and generate an approach strategy.

Account: ${account.name}
Current pain: ${account.pain || 'Unknown — needs research'}
Current whyNow: ${account.whyNow || 'Unknown — needs research'}
Domain: ${domain || 'Unknown'}

Contacts:
${contacts.map((c) => `- ${c.name}, ${c.title || 'Unknown title'}${c.linkedinData ? ' (LinkedIn data available)' : ''}`).join('\n') || 'None'}

${primaryContact?.linkedinData ? `LinkedIn data for ${primaryContact.name}:\n${JSON.stringify(primaryContact.linkedinData)}` : ''}

Recent signals:
${signals.map((s) => `- ${s.title}: ${s.summary || ''}`).join('\n') || 'None'}

Recent emails:
${emails.map((e) => `- From ${e.fromEmail}: "${e.subject}" — ${e.preview || ''}`).join('\n') || 'None'}

Team members for mutual connection check:
${teamMembers.map((t) => `- ${t.name}`).join('\n') || 'None'}

${upstreamContext ? `Upstream context: ${JSON.stringify(upstreamContext)}` : ''}

${primaryContact && domain ? `Generate email pattern guesses for ${primaryContact.name} at ${domain}.` : ''}

Search the web for information about ${primaryContact?.name || account.name} to build a personal profile including interests, values, communication style, and rapport hooks.`;

        // Use messages.create with web search tool for personal profile research
        const response = await Promise.race([
          client.messages.create({
            model: MODEL_SONNET,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            tools: [
              { type: 'web_search_20260209' as 'web_search_20250305', name: 'web_search' },
            ],
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Stage timeout')), STAGE_TIMEOUT_MS * 2)
          ),
        ]);

        // Extract JSON from response (may include text + tool use blocks)
        const textBlock = response.content.find((b) => b.type === 'text');
        const text = textBlock && 'text' in textBlock ? textBlock.text : '';

        let enrichment: Record<string, unknown>;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
          enrichment = parsed ? EnrichmentResultSchema.parse(parsed) : {} as Record<string, unknown>;
        } catch {
          // Partial result — still useful
          enrichment = {
            accountInsights: { pain: account.pain || 'Could not determine', whyNow: account.whyNow || 'Could not determine', stakeholders: [] },
            approachBrief: { recommendedChannel: 'cold_email', toneGuidance: 'Professional', opener: '', talkingPoints: [], icebreakers: [], topicsToAvoid: [], timingRationale: '', connectionPath: null },
            confidence: { extraction: 0, emailGuess: 0, personalProfile: 0.2, accountInsights: 0.3 },
          };
        }

        items.push({
          type: 'enrichment',
          title: `Enrich: ${account.name}${primaryContact ? ` (${primaryContact.name})` : ''}`,
          accName: account.name,
          accId: account.id,
          agent: 'account_enricher',
          confidence: ((enrichment as Record<string, Record<string, number>>).confidence?.accountInsights) || 0.5,
          confidenceBreakdown: (enrichment as Record<string, Record<string, number>>).confidence || {},
          sources: signals.map((s) => ({ name: s.source || 'Signal', url: s.sourceUrl })),
          payload: {
            accountId: account.id,
            ...(enrichment as Record<string, unknown>),
            contextBundle: {
              ...upstreamContext,
              enrichment: {
                pain: (enrichment as Record<string, Record<string, string>>).accountInsights?.pain || '',
                whyNow: (enrichment as Record<string, Record<string, string>>).accountInsights?.whyNow || '',
                approachBrief: JSON.stringify((enrichment as Record<string, unknown>).approachBrief || ''),
                personalProfile: (enrichment as Record<string, unknown>).personalProfile || {},
              },
            },
          },
          reasoning: `Enriched ${account.name} with AI-synthesized insights from ${signals.length} signals, ${emails.length} emails, and web research.`,
          priority: 'Normal',
        });
      } catch (err) {
        errors.push({
          message: `Failed to enrich ${account.name}: ${err instanceof Error ? err.message : String(err)}`,
          source: account.id,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned: accounts.length, matched: items.length, skipped: accounts.length - items.length },
      errors,
    };
  },
};
