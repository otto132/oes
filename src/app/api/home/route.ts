import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { scopedDb } from '@/lib/scoped-db';
import { adaptSignal, adaptMeeting, adaptActivity, adaptOpportunity } from '@/lib/adapters';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { STAGE_PROB } from '@/lib/types';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  const openWhere: any = { stage: { notIn: ['ClosedWon', 'ClosedLost'] } };

  const [stageAgg, atRiskOpps, nextActionOpps, pendingQueue, newSignals, overdueTasks, todayMeetings, recentActivity, unreadEmails, openDealCount] = await Promise.all([
    // Aggregate pipeline totals by stage (replaces loading ALL opps)
    db.opportunity.groupBy({
      by: ['stage'],
      where: openWhere,
      _sum: { amount: true },
    }),
    // Only load opps that are actually at risk (health < 50)
    scoped.opportunity.findMany({
      where: {
        ...openWhere,
        OR: [
          { healthEngagement: { lt: 50 } },
          { healthStakeholders: { lt: 50 } },
          { healthCompetitive: { lt: 50 } },
          { healthTimeline: { lt: 50 } },
        ],
      },
      include: { owner: true, account: { select: { id: true, name: true } } },
    }),
    // Load opps with pending next actions for NBA (limit 5)
    scoped.opportunity.findMany({
      where: { ...openWhere, nextAction: { not: null } },
      include: { owner: true, account: { select: { id: true, name: true } } },
      take: 5,
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
    db.opportunity.count({ where: openWhere }),
  ]);

  const totalPipeline = stageAgg.reduce((s, g) => s + (g._sum?.amount || 0), 0);
  const weightedPipeline = stageAgg.reduce((s, g) => s + Math.round((g._sum?.amount || 0) * (STAGE_PROB[g.stage] || 0) / 100), 0);
  const atRisk = atRiskOpps.filter(o => Math.round((o.healthEngagement + o.healthStakeholders + o.healthCompetitive + o.healthTimeline) / 4) < 50);

  return NextResponse.json({
    stats: {
      pipelineTotal: totalPipeline,
      pipelineWeighted: weightedPipeline,
      openDeals: openDealCount,
      atRiskCount: atRisk.length,
      pendingApprovals: pendingQueue.length,
      newSignals: newSignals.length,
      unreadEmails,
    },
    nextBestActions: [
      ...pendingQueue.length ? [{ type: 'approval', title: `${pendingQueue.length} items awaiting approval`, meta: 'Outreach drafts, leads, enrichments', urgency: 98, href: '/queue', items: pendingQueue.slice(0, 3).map(q => ({ id: q.id, title: q.title })) }] : [],
      ...overdueTasks.map(t => ({ type: 'overdue_task', title: t.title, meta: `Overdue · ${t.account?.name || 'General'}`, urgency: 95, href: '/tasks' })),
      ...atRisk.map((o: any) => ({ type: 'at_risk', title: `${o.name} — at risk`, meta: `Health: ${Math.round((o.healthEngagement + o.healthStakeholders + o.healthCompetitive + o.healthTimeline) / 4)} · ${o.account?.name}`, urgency: 85, href: `/pipeline/${o.id}` })),
      ...nextActionOpps.filter((o: any) => !atRisk.some((r: any) => r.id === o.id)).slice(0, 3).map((o: any) => ({ type: 'next_action', title: o.nextAction, meta: `${o.account?.name}`, urgency: 60, href: `/pipeline/${o.id}` })),
      ...newSignals.length ? [{ type: 'signals', title: `${newSignals.length} new signals detected`, meta: 'Signal Hunter Agent', urgency: 50, href: '/signals' }] : [],
    ].sort((a: any, b: any) => b.urgency - a.urgency),
    topSignals: newSignals.slice(0, 3).map(adaptSignal),
    todayMeetings: todayMeetings.map(adaptMeeting),
    dealsAtRisk: atRisk.slice(0, 3).map((o: any) => adaptOpportunity(o)),
    recentActivity: recentActivity.map(adaptActivity),
  });
}
