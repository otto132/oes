import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { getAnthropicClient, MODEL_SONNET } from '@/lib/agents/ai';

export const GET = withHandler(null, async (req, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!;

  const meeting = await ctx.db.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  // Gather context for prep
  const [account, lastMeeting, recentSignals, openTasks, opportunities] = await Promise.all([
    meeting.accountId ? ctx.db.account.findUnique({ where: { id: meeting.accountId } }) : null,
    meeting.accountId ? ctx.db.meeting.findFirst({
      where: { accountId: meeting.accountId, id: { not: id }, outcomeRecordedAt: { not: null } },
      orderBy: { date: 'desc' },
    }) : null,
    meeting.accountId ? (ctx.db as any).signal?.findMany({
      where: { accountId: meeting.accountId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      take: 5, orderBy: { createdAt: 'desc' },
    }) ?? [] : [],
    meeting.accountId ? ctx.db.task.findMany({
      where: { accountId: meeting.accountId, status: { not: 'Done' } },
      take: 5,
    }) : [],
    meeting.accountId ? ctx.db.opportunity.findMany({
      where: { accountId: meeting.accountId, stage: { notIn: ['Won', 'Lost'] as any[] } },
    }) : [],
  ]);

  const context = {
    meeting: { title: meeting.title, date: meeting.date, attendees: meeting.attendees },
    account: account ? { name: account.name, pain: (account as any).pain, whyNow: (account as any).whyNow } : null,
    lastMeeting: lastMeeting ? { title: lastMeeting.title, date: lastMeeting.date, outcome: (lastMeeting as any).outcomeSummary } : null,
    recentSignals: ((recentSignals as any[]) ?? []).map((s: any) => ({ title: s.title, summary: s.summary })),
    openTasks: openTasks.map((t: any) => ({ title: t.title, dueDate: t.dueDate })),
    opportunities: opportunities.map((o: any) => ({ name: o.name, stage: o.stage, amount: o.amount })),
  };

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: 'Generate concise meeting prep talking points. Be specific and actionable. Reference the last meeting outcome if available.',
    messages: [{ role: 'user', content: JSON.stringify(context) }],
  });

  const talkingPoints = response.content[0].type === 'text' ? response.content[0].text : '';

  return NextResponse.json({
    data: {
      talkingPoints,
      lastMeetingOutcome: lastMeeting ? {
        title: lastMeeting.title,
        date: lastMeeting.date.toISOString(),
        summary: (lastMeeting as any).outcomeSummary,
      } : null,
      account: account ? { name: account.name, pain: (account as any).pain } : null,
      attendees: meeting.attendees,
      openTasks: openTasks.map((t: any) => ({ id: t.id, title: t.title })),
      opportunities: opportunities.map((o: any) => ({ id: o.id, name: o.name, stage: o.stage })),
    },
  });
});
