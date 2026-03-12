import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptLead } from '@/lib/adapters';

export async function GET() {
  const leads = await db.lead.findMany({
    where: { stage: { notIn: ['Converted', 'Disqualified'] } },
    include: { owner: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ data: leads.map(adaptLead) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, id } = body;

  if (!action) {
    // Create lead
    const { company, type, country, pain, ownerId = 'u1' } = body;
    if (!company) return NextResponse.json({ error: 'Company required' }, { status: 400 });
    const dup = await db.lead.findFirst({ where: { company: { equals: company, mode: 'insensitive' } } });
    if (dup) return NextResponse.json({ error: `Lead "${dup.company}" already exists` }, { status: 409 });
    const lead = await db.lead.create({
      data: { company, source: 'Manual', type: type || 'Unknown', country: country || '', pain: pain || '', ownerId },
      include: { owner: true },
    });
    return NextResponse.json({ data: adaptLead(lead) }, { status: 201 });
  }

  if (action === 'advance') {
    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const next: Record<string, string> = { New: 'Researching', Researching: 'Qualified' };
    if (!next[lead.stage]) return NextResponse.json({ error: 'Cannot advance' }, { status: 400 });
    const updated = await db.lead.update({ where: { id }, data: { stage: next[lead.stage] as any }, include: { owner: true } });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (action === 'disqualify') {
    const updated = await db.lead.update({ where: { id }, data: { stage: 'Disqualified' }, include: { owner: true } });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (action === 'convert') {
    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await db.lead.update({ where: { id }, data: { stage: 'Converted' } });
    const { accountName, accountType, oppName, oppAmount, oppStage, ownerId = 'u1' } = body;
    const account = await db.account.create({
      data: {
        name: accountName || lead.company, type: accountType || lead.type, country: lead.country,
        region: lead.region, status: 'Prospect', ownerId,
        scoreFit: lead.scoreFit, scoreIntent: lead.scoreIntent, scoreUrgency: lead.scoreUrgency,
        scoreAccess: lead.scoreAccess, scoreCommercial: lead.scoreCommercial,
        pain: lead.pain, whyNow: 'Converted from lead', moduleFit: lead.moduleFit,
        aiConfidence: lead.confidence,
      },
    });
    let opp = null;
    if (oppName) {
      const probMap: Record<string, number> = { Contacted: 10, Discovery: 20, Qualified: 35 };
      opp = await db.opportunity.create({
        data: {
          name: oppName, accountId: account.id, stage: oppStage || 'Discovery',
          amount: oppAmount || 0, probability: probMap[oppStage || 'Discovery'] || 20, ownerId,
        },
      });
    }
    return NextResponse.json({ data: { account, opportunity: opp } }, { status: 201 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
