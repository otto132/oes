import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { scopedDb } from '@/lib/scoped-db';
import { adaptSignal, adaptMeeting, adaptActivity, adaptOpportunity } from '@/lib/adapters';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  const [opps, pendingQueue, newSignals, overdueTasks, todayMeetings, recentActivity, unreadEmails] = await Promise.all([
    scoped.opportunity.findMany({
      where: { stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
      include: { owner: true, account: { select: { id: true, name: true } } },
    }),
    db.queueItem.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 5 }),
    db.signal.findMany({ where: { status: 'new_signal' }, orderBy: { detectedAt: 'desc' }, take: 5 }),
    scoped.task.findMany({
      where: { status: { not: 'Done' }, due: { lt: now } },
      include: { account: { select: { name: true } } },
      take: 5,
    }),
    scoped.meeting.findMany({ where: { date: { gte: startOfDay, lt: endOfDay } }, orderBy: { startTime: 'asc' } }),
    db.activity.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { author: true, account: { select: { id: true, name: true } } } }),
    db.inboxEmail.count({ where: { isUnread: true, isArchived: false } }),
  ]);

  const totalPipeline = opps.reduce((s, o) => s + o.amount, 0);
  const probMap: Record<string, number> = { Identified: 5, Contacted: 10, Discovery: 20, Qualified: 35, SolutionFit: 50, Proposal: 65, Negotiation: 80, VerbalCommit: 90 };
  const weightedPipeline = opps.reduce((s, o) => s + Math.round(o.amount * (probMap[o.stage] || 0) / 100), 0);
  const atRisk = opps.filter(o => Math.round((o.healthEngagement + o.healthStakeholders + o.healthCompetitive + o.healthTimeline) / 4) < 50);

  return NextResponse.json({
    stats: {
      pipelineTotal: totalPipeline,
      pipelineWeighted: weightedPipeline,
      openDeals: opps.length,
      atRiskCount: atRisk.length,
      pendingApprovals: pendingQueue.length,
      newSignals: newSignals.length,
      unreadEmails,
    },
    nextBestActions: [
      ...pendingQueue.length ? [{ type: 'approval', title: `${pendingQueue.length} items awaiting approval`, meta: 'Outreach drafts, leads, enrichments', urgency: 98, href: '/queue', items: pendingQueue.slice(0, 3).map(q => ({ id: q.id, title: q.title })) }] : [],
      ...overdueTasks.map(t => ({ type: 'overdue_task', title: t.title, meta: `Overdue · ${t.account?.name || 'General'}`, urgency: 95, href: '/tasks' })),
      ...atRisk.map(o => ({ type: 'at_risk', title: `${o.name} — at risk`, meta: `Health: ${Math.round((o.healthEngagement + o.healthStakeholders + o.healthCompetitive + o.healthTimeline) / 4)} · ${o.account.name}`, urgency: 85, href: `/pipeline/${o.id}` })),
      ...opps.filter(o => o.nextAction && !atRisk.includes(o)).slice(0, 3).map(o => ({ type: 'next_action', title: o.nextAction, meta: `${o.account.name}`, urgency: 60, href: `/pipeline/${o.id}` })),
      ...newSignals.length ? [{ type: 'signals', title: `${newSignals.length} new signals detected`, meta: 'Signal Hunter Agent', urgency: 50, href: '/signals' }] : [],
    ].sort((a: any, b: any) => b.urgency - a.urgency),
    topSignals: newSignals.slice(0, 3).map(adaptSignal),
    todayMeetings: todayMeetings.map(adaptMeeting),
    dealsAtRisk: atRisk.slice(0, 3).map(adaptOpportunity),
    recentActivity: recentActivity.map(adaptActivity),
  });
}
