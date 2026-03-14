import { db as prisma } from '@/lib/db';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_HAIKU } from './ai';
import { EmailClassificationSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const SYSTEM_PROMPT = `You are an email classification specialist for a B2B sales team in the GoO (Guarantees of Origin) and renewable certificates market. Classify each email's intent, sentiment, urgency, and detect buying signals. Look for subtle indicators like budget mentions, timeline references, competitor comparisons, and evaluation language that keyword matching would miss.`;

export const inboxClassifierAgent: Agent = {
  name: 'inbox_classifier',
  triggers: [{ type: 'event', event: 'emails_synced' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
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

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emails = await prisma.inboxEmail.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    if (emails.length === 0) {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 0 }, errors: [] };
    }

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];

    // Group emails by account for batching
    const byAccount = new Map<string | null, typeof emails>();
    for (const email of emails) {
      const key = email.accountId || email.domain || null;
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key)!.push(email);
    }

    for (const [accountKey, accountEmails] of byAccount) {
      try {
        // Get account context if available
        const account = accountKey && accountEmails[0].accountId
          ? await prisma.account.findFirst({
              where: { id: accountEmails[0].accountId },
              select: { id: true, name: true, sentimentTrajectory: true },
            })
          : null;

        const previousSentiment = account?.sentimentTrajectory as
          { date: string; sentiment: string }[] | null;

        const emailDescriptions = accountEmails.map((e, i) =>
          `Email ${i}: From ${e.fromEmail}, Subject: "${e.subject}", Preview: "${e.preview || 'No preview'}"`
        ).join('\n');

        const userPrompt = `Classify these ${accountEmails.length} emails:

${emailDescriptions}
${account ? `\nAccount: ${account.name}` : `\nDomain: ${accountKey || 'unknown'}`}
${previousSentiment ? `\nSentiment history: ${previousSentiment.slice(-5).map((s) => `${s.date}: ${s.sentiment}`).join(', ')}` : ''}`;

        const response = await client.messages.parse({
          model: MODEL_HAIKU,
          max_tokens: 1024,
          cache_control: { type: 'ephemeral' },
          system: SYSTEM_PROMPT,
          output_config: { format: zodOutputFormat(EmailClassificationSchema) },
          messages: [{ role: 'user', content: userPrompt }],
        });

        for (const classification of response.parsed_output.classifications) {
          if (classification.emailIndex >= accountEmails.length) continue;
          const email = accountEmails[classification.emailIndex];

          // Skip auto-replies and bounces
          if (['auto_reply', 'bounce'].includes(classification.intent)) continue;

          // Create queue items for actionable emails
          const hasBuyingSignals = classification.buyingSignals.length > 0;
          const isUrgent = ['immediate', 'high'].includes(classification.urgency);
          const isActionable = isUrgent || hasBuyingSignals ||
            ['positive_reply', 'question', 'meeting_request', 'objection'].includes(classification.intent);

          if (!isActionable && email.accountId) continue;

          if (isActionable && email.accountId) {
            items.push({
              type: 'task_creation',
              title: hasBuyingSignals
                ? `Buying signal: ${email.subject}`
                : `Respond to ${classification.intent.replace('_', ' ')}: ${email.subject}`,
              accName: account?.name || '',
              accId: email.accountId,
              agent: 'inbox_classifier',
              confidence: 0.8,
              confidenceBreakdown: {
                urgency: isUrgent ? 0.9 : 0.5,
                buyingSignal: hasBuyingSignals ? 0.9 : 0.2,
              },
              sources: [{ name: 'Email', url: null }],
              payload: {
                emailId: email.id,
                intent: classification.intent,
                sentiment: classification.sentiment,
                urgency: classification.urgency,
                buyingSignals: classification.buyingSignals,
                competitorMentions: classification.competitorMentions,
                suggestedResponse: classification.suggestedResponse,
                suggestedTitle: `Respond: ${email.subject}`,
                suggestedDueDate: isUrgent
                  ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                  : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                accountId: email.accountId,
                contextBundle: {
                  emailSentiment: {
                    trend: classification.sentiment,
                    lastClassification: classification.intent,
                  },
                  competitorActivity: classification.competitorMentions.length > 0
                    ? classification.competitorMentions.map((c) => ({
                        competitor: c,
                        activity: `Mentioned in email: ${email.subject}`,
                      }))
                    : undefined,
                },
              },
              reasoning: classification.suggestedResponse,
              priority: classification.suggestedPriority,
            });
          } else if (!email.accountId && ['positive_reply', 'question', 'meeting_request'].includes(classification.intent)) {
            // Unknown domain — suggest account linking
            const domain = email.domain || email.fromEmail.split('@')[1] || '';
            items.push({
              type: 'enrichment',
              title: `New domain: ${domain}`,
              accName: classification.accountLinkSuggestion || domain,
              accId: null,
              agent: 'inbox_classifier',
              confidence: 0.6,
              confidenceBreakdown: { newDomain: 1.0, intentSignal: 0.7 },
              sources: [{ name: 'Email', url: null }],
              payload: {
                emailId: email.id,
                senderDomain: domain,
                suggestedAccountName: classification.accountLinkSuggestion || domain.split('.')[0],
                intent: classification.intent,
                buyingSignals: classification.buyingSignals,
              },
              reasoning: `Email from unknown domain ${domain} with ${classification.intent} intent.${classification.buyingSignals.length > 0 ? ` Buying signals: ${classification.buyingSignals.join(', ')}` : ''}`,
              priority: 'Normal',
            });
          }
        }

        // Update sentiment trajectory for linked accounts
        if (account) {
          const newSentiments = response.parsed_output.classifications
            .filter((c) => !['auto_reply', 'bounce', 'spam'].includes(c.intent))
            .map((c) => ({ date: new Date().toISOString().slice(0, 10), sentiment: c.sentiment }));

          if (newSentiments.length > 0) {
            const trajectory = [...(previousSentiment || []), ...newSentiments].slice(-20);
            await prisma.account.update({
              where: { id: account.id },
              data: { sentimentTrajectory: trajectory },
            });

            // Check for sentiment shift
            if (trajectory.length >= 3) {
              const recent = trajectory.slice(-3);
              const sentimentRank = { very_negative: 0, negative: 1, neutral: 2, positive: 3, very_positive: 4 };
              const ranks = recent.map((s) => sentimentRank[s.sentiment as keyof typeof sentimentRank] ?? 2);
              const shift = ranks[ranks.length - 1] - ranks[0];
              if (Math.abs(shift) >= 2) {
                items.push({
                  type: 'task_creation',
                  title: `Sentiment ${shift > 0 ? 'improving' : 'declining'}: ${account.name}`,
                  accName: account.name,
                  accId: account.id,
                  agent: 'inbox_classifier',
                  confidence: 0.7,
                  confidenceBreakdown: { sentimentShift: Math.abs(shift) / 4 },
                  sources: [{ name: 'Sentiment Analysis', url: null }],
                  payload: {
                    sentimentHistory: recent,
                    shiftDirection: shift > 0 ? 'improving' : 'declining',
                    suggestedAction: shift > 0
                      ? 'Sentiment is improving — good time to push for next step'
                      : 'Sentiment declining — schedule check-in call to address concerns',
                  },
                  reasoning: `Account sentiment shifted ${Math.abs(shift)} points ${shift > 0 ? 'up' : 'down'} over last 3 interactions.`,
                  priority: shift < 0 ? 'High' : 'Normal',
                });
              }
            }
          }
        }
      } catch (err) {
        errors.push({
          message: `Failed to classify emails for ${accountKey}: ${err instanceof Error ? err.message : String(err)}`,
          source: accountKey || 'unknown',
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned: emails.length, matched: items.length, skipped: emails.length - items.length },
      errors,
    };
  },
};
