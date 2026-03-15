// ═══════════════════════════════════════════════════════════════
// Email Sync Service
// ═══════════════════════════════════════════════════════════════
// Fetches emails from Microsoft Graph, links to accounts by domain,
// classifies intent, and stores in inbox_emails table.
//
// Called by: /api/sync/emails (cron or manual trigger)

import { db } from '@/lib/db';
import { fetchRecentEmails, type GraphEmail } from './microsoft-graph';
import { runSync } from './run-sync';

// ── HTML Strip ───────────────────────────────────
// Remove HTML tags to produce plain-text body.

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Threading Helpers ─────────────────────────────

async function computeThreadId(email: { messageId?: string; inReplyTo?: string }): Promise<string> {
  if (email.inReplyTo) {
    const parent = await db.inboxEmail.findFirst({
      where: { messageId: email.inReplyTo },
      select: { threadId: true },
    });
    if (parent?.threadId) return parent.threadId;
  }
  return email.messageId ?? crypto.randomUUID();
}

async function reconcileThreads(newEmail: { messageId?: string; threadId: string }) {
  if (!newEmail.messageId) return;
  await db.inboxEmail.updateMany({
    where: { inReplyTo: newEmail.messageId, threadId: { not: newEmail.threadId } },
    data: { threadId: newEmail.threadId },
  });
}

// ── Domain Matching ──────────────────────────────
// Match sender domain to existing account contacts

async function matchDomainToAccount(email: string): Promise<{ accountId: string; accountName: string } | null> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Check contacts table for matching email domain
  const contact = await db.contact.findFirst({
    where: { email: { endsWith: `@${domain}` } },
    include: { account: { select: { id: true, name: true } } },
  });
  if (contact) return { accountId: contact.account.id, accountName: contact.account.name };

  // Check account names for domain match (e.g., "basf" in "BASF SE")
  const domainBase = domain.split('.')[0];
  const account = await db.account.findFirst({
    where: { name: { contains: domainBase, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (account) return { accountId: account.id, accountName: account.name };

  return null;
}

// ── Simple Intent Classification ─────────────────
// Rule-based classification. Replace with LLM in production.

type Classification = 'positive_reply' | 'question' | 'objection' | 'meeting_request' | 'auto_reply' | 'new_domain' | 'bounce' | 'spam';

function classifyEmail(subject: string, body: string, fromEmail: string): { cls: Classification; conf: number } {
  const subj = subject.toLowerCase();
  const text = (subject + ' ' + body).toLowerCase();

  // Auto-reply detection
  if (subj.includes('out of office') || subj.includes('automatic reply') || subj.includes('auto:')) {
    return { cls: 'auto_reply', conf: 0.95 };
  }

  // Bounce detection
  if (subj.includes('undeliverable') || subj.includes('delivery failed') || subj.includes('mailer-daemon')) {
    return { cls: 'bounce', conf: 0.95 };
  }

  // Meeting request
  if (subj.includes('invitation') || subj.includes('calendar') || text.includes('schedule a call') || text.includes('book a meeting') || text.includes('speaker invitation')) {
    return { cls: 'meeting_request', conf: 0.80 };
  }

  // Question detection
  if (text.includes('?') && (text.includes('can you') || text.includes('could you') || text.includes('do you') || text.includes('how') || text.includes('api docs') || text.includes('documentation'))) {
    return { cls: 'question', conf: 0.82 };
  }

  // Positive reply detection
  const positiveSignals = ['works for us', 'let\'s proceed', 'move forward', 'interested', 'looks good', 'sounds great', 'happy to', 'let\'s finalize', 'agree', 'approved'];
  if (positiveSignals.some(s => text.includes(s))) {
    return { cls: 'positive_reply', conf: 0.85 };
  }

  // Objection detection
  const objectionSignals = ['too expensive', 'not in budget', 'concern', 'worried about', 'not ready', 'postpone', 'delay', 'reconsider'];
  if (objectionSignals.some(s => text.includes(s))) {
    return { cls: 'objection', conf: 0.75 };
  }

  // Default: if no match and no existing account, it's a new domain
  return { cls: 'new_domain', conf: 0.60 };
}

// ── Sync Function ────────────────────────────────

export async function syncEmails(): Promise<{ synced: number; errors: string[] }> {
  return runSync({
    type: 'email',
    syncFn: async (tokenRow, accessToken) => {
      let synced = 0;
      const errors: string[] = [];

      // Fetch emails from last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let graphEmails: GraphEmail[];
      try {
        graphEmails = await fetchRecentEmails(accessToken, since);
      } catch (err) {
        errors.push(`Graph API error for ${tokenRow.userEmail}: ${err}`);
        return { synced, errors };
      }

      for (const ge of graphEmails) {
        try {
          const graphId = ge.id;

          // Match to account
          const match = await matchDomainToAccount(ge.from.emailAddress.address);
          const domain = ge.from.emailAddress.address.split('@')[1];

          // Classify
          let { cls, conf } = classifyEmail(ge.subject, ge.bodyPreview, ge.from.emailAddress.address);
          if (!match && cls !== 'auto_reply' && cls !== 'bounce') {
            cls = 'new_domain';
          }

          // Extract body
          const bodyHtml = ge.body?.content ?? null;
          const body = bodyHtml ? stripHtml(bodyHtml) : null;

          // Extract threading headers
          const headers = ge.internetMessageHeaders ?? [];
          const messageId = ge.internetMessageId ?? null;
          const inReplyTo =
            headers.find((h) => h.name.toLowerCase() === 'in-reply-to')?.value ?? null;
          const referencesHeader =
            headers.find((h) => h.name.toLowerCase() === 'references')?.value ?? null;
          const references = referencesHeader
            ? referencesHeader.trim().split(/\s+/).filter(Boolean)
            : [];

          // Compute thread ID
          const threadId = await computeThreadId({ messageId: messageId ?? undefined, inReplyTo: inReplyTo ?? undefined });

          const emailData = {
            subject: ge.subject,
            fromEmail: ge.from.emailAddress.address,
            fromName: ge.from.emailAddress.name,
            preview: ge.bodyPreview.slice(0, 500),
            receivedAt: new Date(ge.receivedDateTime),
            isUnread: !ge.isRead,
            classification: cls,
            classificationConf: conf,
            isLinked: !!match,
            accountId: match?.accountId || null,
            accountName: match?.accountName || null,
            domain: !match ? domain : null,
            body,
            bodyHtml,
            messageId,
            inReplyTo,
            references,
            threadId,
          };

          // Dedup by externalId using upsert (race-condition safe)
          if (graphId) {
            const result = await db.inboxEmail.upsert({
              where: { externalId: graphId },
              update: {},  // no-op on duplicate
              create: { externalId: graphId, ...emailData },
            });
            // upsert returns existing record on duplicate — only count new ones
            const isNew = result.createdAt.getTime() >= new Date(Date.now() - 5000).getTime();
            if (isNew) {
              synced++;
              await reconcileThreads({ messageId: messageId ?? undefined, threadId });
            }
          } else {
            // Fallback dedup for emails without Graph ID (backward compat)
            const existing = await db.inboxEmail.findFirst({
              where: {
                subject: ge.subject,
                fromEmail: ge.from.emailAddress.address,
                receivedAt: new Date(ge.receivedDateTime),
              },
            });
            if (existing) continue;

            await db.inboxEmail.create({ data: emailData });
            synced++;
            await reconcileThreads({ messageId: messageId ?? undefined, threadId });
          }
        } catch (err) {
          errors.push(`Failed to sync email "${ge.subject}": ${err}`);
        }
      }

      return { synced, errors };
    },
  });
}
