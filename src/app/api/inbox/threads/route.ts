import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { adaptEmail } from '@/lib/adapters';
import type { EmailThread } from '@/lib/types';

export const GET = withHandler(null, async (req, ctx) => {
  const url = req.nextUrl;
  const filter = url.searchParams.get('filter');
  const accountId = url.searchParams.get('accountId');

  const where: any = {
    isArchived: false,
    OR: [
      { snoozedUntil: null },
      { snoozedUntil: { lt: new Date() } },
    ],
  };

  if (filter === 'unread') where.isUnread = true;
  if (filter === 'unlinked') where.isLinked = false;
  if (filter === 'buying_signal') {
    where.classificationConf = { gte: 0.7 };
    where.classification = { in: ['positive_reply', 'question', 'meeting_request'] };
  }
  if (accountId) where.accountId = accountId;
  if (filter && !['unread', 'unlinked', 'buying_signal'].includes(filter)) {
    where.classification = filter;
  }

  const emails = await ctx.db.inboxEmail.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
  });

  // Group by threadId
  const threadMap = new Map<string, typeof emails>();
  for (const email of emails) {
    const tid = email.threadId ?? email.id;
    const group = threadMap.get(tid) ?? [];
    group.push(email);
    threadMap.set(tid, group);
  }

  const threads: EmailThread[] = Array.from(threadMap.entries()).map(([threadId, threadEmails]) => {
    const sorted = threadEmails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    const latest = sorted[sorted.length - 1];
    return {
      threadId,
      emails: sorted.map(adaptEmail),
      latestEmail: adaptEmail(latest),
      accountName: latest.accountName ?? undefined,
      accountId: latest.accountId ?? undefined,
      isUnread: threadEmails.some(e => e.isUnread),
      classification: latest.classification ?? undefined,
      snoozedUntil: latest.snoozedUntil?.toISOString() ?? undefined,
    };
  });

  threads.sort((a, b) => new Date(b.latestEmail.receivedAt).getTime() - new Date(a.latestEmail.receivedAt).getTime());

  return NextResponse.json({ data: threads, meta: { totalCount: threads.length } });
});
