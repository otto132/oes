import { NextRequest, NextResponse } from 'next/server';
import { Prisma, OppStage } from '@prisma/client';
import { resolveTenantDb } from '@/lib/tenant';
import { scopedDb } from '@/lib/scoped-db';
import { adaptOpportunity, adaptActivity, adaptContact } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { opportunityActionSchema } from '@/lib/schemas/opportunities';
import { notFound, unauthorized } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';
import { auth } from '@/lib/auth';
import { STAGE_PROB } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const opp = await scoped.opportunity.findUnique({
      where: { id },
      include: { owner: true, account: { include: { contacts: true } } },
    });
    if (!opp) return notFound('Opportunity not found');

    const activities = await db.activity.findMany({
      where: { accountId: opp.accountId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { author: true, account: { select: { id: true, name: true } } },
    });

    const adaptedOpp = adaptOpportunity(opp);
    const adaptedActivities = activities.map(adaptActivity);
    const adaptedContacts = opp.account.contacts.map(adaptContact);

    return NextResponse.json({ data: { opportunity: adaptedOpp, activities: adaptedActivities, contacts: adaptedContacts } });
  }

  const pagination = parsePagination(req);
  const where: Prisma.OpportunityWhereInput = { stage: { notIn: [OppStage.ClosedWon, OppStage.ClosedLost] } };

  // Aggregates across ALL records
  const allOpps = await scoped.opportunity.findMany({ where, select: { amount: true, stage: true } });
  const total = allOpps.reduce((s, o) => s + o.amount, 0);
  const weighted = allOpps.reduce((s, o) => s + Math.round(o.amount * (STAGE_PROB[o.stage] || 0) / 100), 0);

  // Then paginated query
  const opps = await scoped.opportunity.findMany({
    where, include: { owner: true, account: { select: { id: true, name: true } } },
    orderBy: { amount: 'desc' },
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });
  const { data, meta } = paginate(opps, pagination.limit);
  return NextResponse.json({ data: data.map(adaptOpportunity), meta: { ...meta, totalPipeline: total, weightedPipeline: weighted } });
}

export const POST = withHandler(opportunityActionSchema, async (req, ctx) => {
  const body = ctx.body;
  const session = ctx.session;

  // Create
  if (body.action === 'create') {
    const { name, accountId, stage, amount, closeDate } = body;
    const ownerId = body.ownerId || session.user.id;
    const opp = await ctx.db.opportunity.create({
      data: {
        name, accountId, stage: (stage || 'Contacted') as OppStage,
        amount: amount || 0, probability: STAGE_PROB[stage || 'Contacted'] || 10,
        closeDate: closeDate ? new Date(closeDate) : undefined,
        ownerId,
      },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) }, { status: 201 });
  }

  // Move stage
  if (body.action === 'move') {
    const { id, stage } = body;
    const opp = await ctx.db.opportunity.update({
      where: { id },
      data: { stage: stage as OppStage, probability: STAGE_PROB[stage] || 0 },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    await ctx.db.activity.create({
      data: {
        type: 'Note', summary: `Stage → ${stage}`, detail: `${opp.name} moved`,
        source: 'Pipeline', accountId: opp.accountId, authorId: session.user.id,
      },
    });
    await ctx.db.account.update({ where: { id: opp.accountId }, data: { lastActivityAt: new Date() } });
    return NextResponse.json({ data: adaptOpportunity(opp) });
  }

  // Close Won
  if (body.action === 'close_won') {
    const { id, winNotes, competitorBeaten, keyStakeholders, lessonsLearned } = body;
    const opp = await ctx.db.opportunity.update({
      where: { id },
      data: { stage: 'ClosedWon', probability: 100, winNotes, competitorBeaten, keyStakeholders, lessonsLearned },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    await ctx.db.account.update({ where: { id: opp.accountId }, data: { status: 'Active', lastActivityAt: new Date() } });
    await ctx.db.activity.create({
      data: {
        type: 'Note', summary: `WON: ${opp.name}`,
        detail: `${winNotes || ''}${competitorBeaten ? ' · Beat: ' + competitorBeaten : ''}`,
        source: 'Pipeline', accountId: opp.accountId, authorId: session.user.id,
      },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) });
  }

  // Close Lost
  if (body.action === 'close_lost') {
    const { id, lossReason, lossCompetitor, lossNotes, lessonsLearned } = body;
    const opp = await ctx.db.opportunity.update({
      where: { id },
      data: { stage: 'ClosedLost', probability: 0, lossReason, lossCompetitor, lossNotes, lessonsLearned },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    await ctx.db.activity.create({
      data: {
        type: 'Note', summary: `Lost: ${opp.name} — ${lossReason}`,
        detail: `${lossNotes || ''}${lossCompetitor ? ' · Won by: ' + lossCompetitor : ''}`,
        source: 'Pipeline', accountId: opp.accountId, authorId: session.user.id,
      },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) });
  }

  if (body.action === 'bulk_move') {
    const { ids, stage } = body;
    await ctx.db.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { stage: stage as OppStage },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  if (body.action === 'bulk_close_lost') {
    const { ids } = body;
    await ctx.db.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { stage: 'ClosedLost', probability: 0 },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  if (body.action === 'bulk_assign') {
    const { ids, ownerId } = body;
    await ctx.db.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { ownerId },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  // Exhaustive — discriminatedUnion guarantees one of the above matched
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
});
