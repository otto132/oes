import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptLead } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { leadActionSchema } from '@/lib/schemas/leads';
import { notFound, badRequest, conflict } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';

export async function GET(req: NextRequest) {
  const pagination = parsePagination(req);

  const leads = await db.lead.findMany({
    where: { stage: { notIn: ['Converted', 'Disqualified'] } },
    include: { owner: true },
    orderBy: { createdAt: 'desc' },
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(leads, pagination.limit);
  return NextResponse.json({ data: data.map(adaptLead), meta });
}

export const POST = withHandler(leadActionSchema, async (req, ctx) => {
  const body = ctx.body;
  const session = ctx.session;

  if (body.action === 'create') {
    const { company, type, country, pain } = body;
    const ownerId = body.ownerId || session.user.id;
    if (!company) return badRequest('Company required');
    const dup = await db.lead.findFirst({ where: { company: { equals: company, mode: 'insensitive' } } });
    if (dup) return conflict(`Lead "${dup.company}" already exists`);
    const lead = await db.lead.create({
      data: { company, source: 'Manual', type: (type || 'Unknown') as any, country: country || '', pain: pain || '', ownerId },
      include: { owner: true },
    });
    return NextResponse.json({ data: adaptLead(lead) }, { status: 201 });
  }

  if (body.action === 'advance') {
    const { id } = body;
    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    const next: Record<string, string> = { New: 'Researching', Researching: 'Qualified' };
    if (!next[lead.stage]) return badRequest('Cannot advance');
    const updated = await db.lead.update({ where: { id }, data: { stage: next[lead.stage] as any }, include: { owner: true } });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'disqualify') {
    const { id } = body;
    const updated = await db.lead.update({ where: { id }, data: { stage: 'Disqualified' }, include: { owner: true } });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'convert') {
    const { id, accountName, accountType, oppName, oppAmount, oppStage } = body;
    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    await db.lead.update({ where: { id }, data: { stage: 'Converted' } });
    const ownerId = body.ownerId || session.user.id;
    const account = await db.account.create({
      data: {
        name: accountName || lead.company, type: (accountType || lead.type) as any, country: lead.country,
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
          name: oppName, accountId: account.id, stage: (oppStage || 'Discovery') as any,
          amount: oppAmount || 0, probability: probMap[oppStage || 'Discovery'] || 20, ownerId,
        },
      });
    }
    return NextResponse.json({ data: { account, opportunity: opp } }, { status: 201 });
  }

  return badRequest('Invalid action');
});
