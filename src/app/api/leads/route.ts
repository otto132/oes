import { NextRequest, NextResponse } from 'next/server';
import { AccountType, LeadStage, OppStage } from '@prisma/client';
import { db as rawDb } from '@/lib/db';
import { scopedDb } from '@/lib/scoped-db';
import { adaptLead } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { leadActionSchema } from '@/lib/schemas/leads';
import { notFound, badRequest, conflict, unauthorized } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';
import { auth } from '@/lib/auth';
import { STAGE_PROB } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const pagination = parsePagination(req);

  const leads = await scoped.lead.findMany({
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
    // Cross-user duplicate check uses raw unscoped db
    const dup = await rawDb.lead.findFirst({ where: { company: { equals: company, mode: 'insensitive' } } });
    if (dup) return conflict(`Lead "${dup.company}" already exists`);
    const lead = await ctx.db.lead.create({
      data: { company, source: 'Manual', type: (type || 'Unknown') as AccountType, country: country || '', pain: pain || '', ownerId },
      include: { owner: true },
    });
    return NextResponse.json({ data: adaptLead(lead) }, { status: 201 });
  }

  if (body.action === 'advance') {
    const { id } = body;
    const lead = await ctx.db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    const next: Record<string, LeadStage> = { New: LeadStage.Researching, Researching: LeadStage.Qualified };
    if (!next[lead.stage]) return badRequest('Cannot advance');
    const updated = await ctx.db.lead.update({ where: { id }, data: { stage: next[lead.stage] }, include: { owner: true } });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'disqualify') {
    const { id } = body;
    const updated = await ctx.db.lead.update({ where: { id }, data: { stage: 'Disqualified' }, include: { owner: true } });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'convert') {
    const { id, accountName, accountType, oppName, oppAmount, oppStage } = body;
    const lead = await ctx.db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    const ownerId = body.ownerId || session.user.id;

    const resolvedName = accountName || lead.company;

    // Use rawDb for transaction — lead ownership already verified via ctx.db.findUnique above
    const result = await rawDb.$transaction(async (tx: any) => {
      await tx.lead.update({ where: { id }, data: { stage: 'Converted' } });

      // Check for existing account with same name (case-insensitive)
      const existingAccount = await tx.account.findFirst({
        where: { name: { equals: resolvedName, mode: 'insensitive' } },
      });

      const account = existingAccount ?? await tx.account.create({
        data: {
          name: resolvedName, type: (accountType || lead.type) as AccountType, country: lead.country,
          region: lead.region, status: 'Prospect', ownerId,
          scoreFit: lead.scoreFit, scoreIntent: lead.scoreIntent, scoreUrgency: lead.scoreUrgency,
          scoreAccess: lead.scoreAccess, scoreCommercial: lead.scoreCommercial,
          pain: lead.pain, whyNow: 'Converted from lead', moduleFit: lead.moduleFit,
          aiConfidence: lead.confidence,
        },
      });

      let opp = null;
      if (oppName) {
        opp = await tx.opportunity.create({
          data: {
            name: oppName, accountId: account.id, stage: (oppStage || 'Discovery') as OppStage,
            amount: oppAmount || 0, probability: STAGE_PROB[oppStage || 'Discovery'] || 20, ownerId,
          },
        });
      }
      return { account, opportunity: opp, linkedExisting: !!existingAccount };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  }

  return badRequest('Invalid action');
});
