import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  urgencyKeywords: ['urgent', 'deadline', 'asap', 'critical', 'immediately', 'time-sensitive'],
  minClassificationConfidence: 0.7,
};

export const inboxClassifierAgent: Agent = {
  name: 'inbox_classifier',
  triggers: [{ type: 'event', event: 'emails_synced' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const urgencyKeywords = (params.urgencyKeywords as string[]) || DEFAULT_PARAMS.urgencyKeywords;

    // Fetch recent unprocessed emails (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emails = await prisma.inboxEmail.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const email of emails) {
      const text = `${email.subject} ${email.body || ''}`.toLowerCase();
      const isUrgent = urgencyKeywords.some((kw) => text.includes(kw.toLowerCase()));
      const domain = email.from.split('@')[1] || '';
      const classification = email.classification as string;

      // Skip auto-replies and bounces
      if (['auto_reply', 'bounce'].includes(classification)) continue;

      // Urgent email with account → create task
      if (isUrgent && email.accountId) {
        matched++;
        const account = await prisma.account.findFirst({
          where: { id: email.accountId },
          select: { name: true },
        });
        items.push({
          type: 'task_creation',
          title: `Respond to urgent email: ${email.subject}`,
          accName: account?.name || '',
          accId: email.accountId,
          agent: 'inbox_classifier',
          confidence: 0.8,
          confidenceBreakdown: { urgency: 0.9, hasAccount: 1.0 },
          sources: [{ name: 'Email', url: null }],
          payload: {
            emailId: email.id,
            suggestedTitle: `Respond: ${email.subject}`,
            suggestedDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            accountId: email.accountId,
          },
          reasoning: `Urgent keywords detected in email from ${email.from}. Classification: ${classification}.`,
          priority: 'High',
        });
        continue;
      }

      // Unlinked email from unknown domain → suggest account linking
      if (!email.accountId && classification !== 'auto_reply') {
        const existingAccount = await prisma.account.findFirst({
          where: { website: { contains: domain } },
          select: { id: true, name: true },
        });

        if (!existingAccount && ['positive_reply', 'question', 'meeting_request'].includes(classification)) {
          matched++;
          items.push({
            type: 'enrichment',
            title: `New domain detected: ${domain}`,
            accName: domain,
            accId: null,
            agent: 'inbox_classifier',
            confidence: 0.6,
            confidenceBreakdown: { newDomain: 1.0, intentSignal: 0.7 },
            sources: [{ name: 'Email', url: null }],
            payload: {
              emailId: email.id,
              senderDomain: domain,
              suggestedAccountName: domain.split('.')[0],
              confidence: 0.6,
            },
            reasoning: `Email from unknown domain ${domain} with ${classification} intent. May be a new prospect.`,
            priority: 'Normal',
          });
        }
      }
    }

    return {
      items,
      metrics: { scanned: emails.length, matched, skipped: emails.length - matched },
      errors: [],
    };
  },
};
