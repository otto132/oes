import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptOpportunity, adaptActivity, adaptContact } from '@/lib/adapters';

const PROB: Record<string, number> = { Identified: 5, Contacted: 10, Discovery: 20, Qualified: 35, SolutionFit: 50, Proposal: 65, Negotiation: 80, VerbalCommit: 90, ClosedWon: 100, ClosedLost: 0 };

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const opp = await db.opportunity.findUnique({
      where: { id },
      include: { owner: true, account: { include: { contacts: true } } },
    });
    if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  const opps = await db.opportunity.findMany({
    where: { stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
    include: { owner: true, account: { select: { id: true, name: true } } },
    orderBy: { amount: 'desc' },
  });
  const total = opps.reduce((s, o) => s + o.amount, 0);
  const weighted = opps.reduce((s, o) => s + Math.round(o.amount * (PROB[o.stage] || 0) / 100), 0);
  return NextResponse.json({ data: opps.map(adaptOpportunity), meta: { totalPipeline: total, weightedPipeline: weighted } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, id } = body;

  // Create
  if (!action) {
    const { name, accountId, stage, amount, closeDate, ownerId = 'u1' } = body;
    if (!name || !accountId) return NextResponse.json({ error: 'Name and account required' }, { status: 400 });
    const opp = await db.opportunity.create({
      data: {
        name, accountId, stage: stage || 'Contacted',
        amount: amount || 0, probability: PROB[stage || 'Contacted'] || 10,
        closeDate: closeDate ? new Date(closeDate) : undefined,
        ownerId,
      },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) }, { status: 201 });
  }

  // Move stage
  if (action === 'move') {
    const { stage } = body;
    const opp = await db.opportunity.update({
      where: { id },
      data: { stage, probability: PROB[stage] || 0 },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    await db.activity.create({
      data: {
        type: 'Note', summary: `Stage → ${stage}`, detail: `${opp.name} moved`,
        source: 'Pipeline', accountId: opp.accountId, authorId: body.userId || 'u1',
      },
    });
    await db.account.update({ where: { id: opp.accountId }, data: { lastActivityAt: new Date() } });
    return NextResponse.json({ data: adaptOpportunity(opp) });
  }

  // Close Won
  if (action === 'close_won') {
    const { winNotes, competitorBeaten } = body;
    const opp = await db.opportunity.update({
      where: { id },
      data: { stage: 'ClosedWon', probability: 100, winNotes, competitorBeaten },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    await db.account.update({ where: { id: opp.accountId }, data: { status: 'Active', lastActivityAt: new Date() } });
    await db.activity.create({
      data: {
        type: 'Note', summary: `WON: ${opp.name}`,
        detail: `${winNotes || ''}${competitorBeaten ? ' · Beat: ' + competitorBeaten : ''}`,
        source: 'Pipeline', accountId: opp.accountId, authorId: body.userId || 'u1',
      },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) });
  }

  // Close Lost
  if (action === 'close_lost') {
    const { lossReason, lossCompetitor, lossNotes } = body;
    const opp = await db.opportunity.update({
      where: { id },
      data: { stage: 'ClosedLost', probability: 0, lossReason, lossCompetitor, lossNotes },
      include: { owner: true, account: { select: { id: true, name: true } } },
    });
    await db.activity.create({
      data: {
        type: 'Note', summary: `Lost: ${opp.name} — ${lossReason}`,
        detail: `${lossNotes || ''}${lossCompetitor ? ' · Won by: ' + lossCompetitor : ''}`,
        source: 'Pipeline', accountId: opp.accountId, authorId: body.userId || 'u1',
      },
    });
    return NextResponse.json({ data: adaptOpportunity(opp) });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
