import { NextRequest, NextResponse } from 'next/server';
import { Prisma, OppStage } from '@prisma/client';
import { resolveTenantDb } from '@/lib/tenant';
import { scopedDb } from '@/lib/scoped-db';
import { adaptOpportunity, adaptActivity, adaptContact } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { opportunityActionSchema } from '@/lib/schemas/opportunities';
import { notFound, unauthorized, badRequest } from '@/lib/api-errors';
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
      include: { owner: true, account: { include: { contacts: { take: 100 } } } },
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
  const where: Prisma.OpportunityWhereInput = { stage: { notIn: ['Won', 'Lost'] as any[] } };

  // Aggregate pipeline totals by stage (avoids loading ALL opps into memory)
  const stageAgg = await db.opportunity.groupBy({
    by: ['stage'],
    where,
    _sum: { amount: true },
  });
  const total = stageAgg.reduce((s, g) => s + (g._sum?.amount || 0), 0);
  const weighted = stageAgg.reduce((s, g) => s + Math.round((g._sum?.amount || 0) * (STAGE_PROB[g.stage] || 0) / 100), 0);

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
        name, accountId, stage: (stage || 'Discovery') as any,
        amount: amount || 0, probability: STAGE_PROB[stage || 'Discovery'] || 15,
        closeDate: closeDate ? new Date(closeDate) : undefined,
        ownerId, source: 'Direct',
      },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) }, { status: 201 });
  }

  // Move stage
  if (body.action === 'move') {
    const { id, stage } = body;
    const STAGE_ORDER = ['Discovery', 'Evaluation', 'Proposal', 'Negotiation', 'Commit'];

    const current = await ctx.db.opportunity.findUnique({ where: { id }, select: { stage: true } });
    if (!current) return notFound('Opportunity not found');

    if (current.stage === 'Won' || current.stage === 'Lost') {
      return badRequest('Cannot move terminal opportunities');
    }

    const opp = await ctx.db.opportunity.update({
      where: { id },
      data: { stage: stage as any, probability: STAGE_PROB[stage] || 0 },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });

    // Log regression as special activity
    const currentIdx = STAGE_ORDER.indexOf(current.stage);
    const targetIdx = STAGE_ORDER.indexOf(stage);
    const isRegression = currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx;
    const summary = isRegression
      ? `Stage moved back: ${current.stage} → ${stage}`
      : `Stage → ${stage}`;

    await ctx.db.activity.create({
      data: {
        type: 'Note', summary, detail: `${opp.name} moved`,
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
      data: { stage: 'Won' as any, probability: 100, winNotes, competitorBeaten, keyStakeholders, lessonsLearned },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    // Auto-promote to Customer on first Won deal (don't overwrite Partner)
    const account = await ctx.db.account.findUnique({ where: { id: opp.accountId }, select: { status: true } });
    const newStatus = account?.status === 'Partner' ? 'Partner' : 'Customer';
    await ctx.db.account.update({ where: { id: opp.accountId }, data: { status: newStatus, lastActivityAt: new Date() } });
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
      data: { stage: 'Lost' as any, probability: 0, lossReason, lossCompetitor, lossNotes, lessonsLearned },
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
    if (ids.length > 500) return badRequest('Too many items (max 500)');
    await ctx.db.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { stage: stage as OppStage },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  if (body.action === 'bulk_close_lost') {
    const { ids } = body;
    if (ids.length > 500) return badRequest('Too many items (max 500)');
    await ctx.db.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { stage: 'Lost' as any, probability: 0 },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  if (body.action === 'bulk_assign') {
    const { ids, ownerId } = body;
    if (ids.length > 500) return badRequest('Too many items (max 500)');
    await ctx.db.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { ownerId },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  // Exhaustive — discriminatedUnion guarantees one of the above matched
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
});
