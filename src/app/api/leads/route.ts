import { NextRequest, NextResponse } from 'next/server';
import { AccountType, LeadStage } from '@prisma/client';
import { db as rawDb } from '@/lib/db';
import { scopedDb } from '@/lib/scoped-db';
import { adaptLead } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { leadActionSchema } from '@/lib/schemas/leads';
import { notFound, badRequest, unauthorized } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const pagination = parsePagination(req);

  const showPaused = req.nextUrl.searchParams.get('paused') === 'true';

  const where = showPaused
    ? { stage: 'Paused' as LeadStage }
    : { stage: { notIn: ['Converted', 'Disqualified', 'Paused'] as LeadStage[] } };

  const leads = await scoped.lead.findMany({
    where,
    include: { owner: true },
    orderBy: { createdAt: 'desc' },
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(leads, pagination.limit);
  return NextResponse.json({ data: data.map((l: any) => adaptLead(l)), meta });
}

export const POST = withHandler(leadActionSchema, async (req, ctx) => {
  const body = ctx.body;
  const session = ctx.session;

  if (body.action === 'create') {
    const { company, type, country, pain } = body;
    const ownerId = body.ownerId || session.user.id;
    if (!company) return badRequest('Company required');
    const lead = await ctx.db.lead.create({
      data: {
        company, source: 'Manual', type: (type || 'Unknown') as AccountType,
        country: country || '', pain: pain || '', ownerId,
        certMgmtType: body.certMgmtType || '',
        etrmSystem: body.etrmSystem || '',
        gtrmSystem: body.gtrmSystem || '',
        certRegistries: body.certRegistries || [],
        itIntegrations: body.itIntegrations || [],
        certPainPoints: body.certPainPoints || '',
      },
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
    const { id, reason } = body;
    const updated = await ctx.db.lead.update({
      where: { id },
      data: { stage: 'Disqualified', disqualifyReason: reason },
      include: { owner: true },
    });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'convert') {
    const { id, accountName, accountType, oppName, oppAmount, closeDate } = body;
    const lead = await ctx.db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    if (lead.stage !== 'Qualified') return badRequest('Only qualified leads can be converted');
    const ownerId = body.ownerId || session.user.id;

    const resolvedName = accountName || lead.company;
    const resolvedCloseDate = closeDate ? new Date(closeDate) : new Date(Date.now() + 90 * 864e5);

    const result = await rawDb.$transaction(async (tx: any) => {
      // 1. Account upsert
      const existingAccount = await tx.account.findFirst({
        where: { name: { equals: resolvedName, mode: 'insensitive' } },
      });

      const account = existingAccount ?? await tx.account.create({
        data: {
          name: resolvedName,
          type: (accountType || lead.type) as any,
          country: lead.country,
          region: lead.region,
          status: 'Prospect',
          ownerId,
          scoreFit: lead.scoreFit,
          scoreIntent: lead.scoreIntent,
          scoreUrgency: lead.scoreUrgency,
          scoreAccess: lead.scoreAccess,
          scoreCommercial: lead.scoreCommercial,
          pain: lead.pain,
          whyNow: 'Converted from lead',
          moduleFit: lead.moduleFit,
          certMgmtType: lead.certMgmtType,
          etrmSystem: lead.etrmSystem,
          gtrmSystem: lead.gtrmSystem,
          certRegistries: lead.certRegistries,
          itIntegrations: lead.itIntegrations,
          certPainPoints: lead.certPainPoints,
          aiConfidence: lead.confidence,
        },
      });

      // 2. Opportunity create — mandatory, with FIUAC → health seeding
      const opp = await tx.opportunity.create({
        data: {
          name: oppName,
          accountId: account.id,
          stage: 'Discovery',
          amount: oppAmount || 0,
          probability: 15,
          closeDate: resolvedCloseDate,
          source: lead.source,
          ownerId,
          // FIUAC → Deal Health seeding
          healthEngagement: lead.scoreIntent,
          healthStakeholders: lead.scoreAccess,
          healthCompetitive: lead.scoreCommercial,
          healthTimeline: lead.scoreUrgency,
        },
      });

      // 3. Lead update — mark converted with FK
      await tx.lead.update({
        where: { id },
        data: {
          stage: 'Converted',
          opportunityId: opp.id,
          convertedAt: new Date(),
        },
      });

      // 4. Activity — conversion event
      await tx.activity.create({
        data: {
          type: 'Note',
          summary: `Lead converted → Created deal '${oppName}'`,
          detail: `Converted from lead: ${lead.company}. Source: ${lead.source}.`,
          source: 'Pipeline',
          accountId: account.id,
          authorId: ownerId,
        },
      });

      return { account, opportunity: opp, linkedExisting: !!existingAccount };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  }

  if (body.action === 'pause') {
    const { id, pausedUntil } = body;
    const lead = await ctx.db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    if (['Converted', 'Disqualified'].includes(lead.stage)) return badRequest('Cannot pause terminal leads');
    const updated = await ctx.db.lead.update({
      where: { id },
      data: { stage: 'Paused' as LeadStage, pausedUntil: new Date(pausedUntil) },
      include: { owner: true },
    });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'requalify') {
    const { id } = body;
    const lead = await ctx.db.lead.findUnique({ where: { id } });
    if (!lead) return notFound('Lead not found');
    if (!['Disqualified', 'Paused'].includes(lead.stage)) return badRequest('Can only requalify disqualified or paused leads');
    const updated = await ctx.db.lead.update({
      where: { id },
      data: { stage: 'Researching', pausedUntil: null, disqualifyReason: null },
      include: { owner: true },
    });
    return NextResponse.json({ data: adaptLead(updated) });
  }

  if (body.action === 'bulk_advance') {
    const { ids } = body;
    const next: Record<string, LeadStage> = { New: LeadStage.Researching, Researching: LeadStage.Qualified };
    const results = [];
    for (const id of ids) {
      try {
        const lead = await ctx.db.lead.findUnique({ where: { id } });
        if (!lead) { results.push({ id, status: 'error', error: 'Not found' }); continue; }
        if (!next[lead.stage]) { results.push({ id, status: 'skipped', error: 'Cannot advance' }); continue; }
        await ctx.db.lead.update({ where: { id }, data: { stage: next[lead.stage] } });
        results.push({ id, status: 'ok', stage: next[lead.stage] });
      } catch (err) {
        results.push({ id, status: 'error', error: 'Failed' });
      }
    }
    return NextResponse.json({ data: { results, processed: results.filter(r => r.status === 'ok').length } });
  }

  if (body.action === 'bulk_disqualify') {
    const { ids } = body;
    await ctx.db.lead.updateMany({
      where: { id: { in: ids } },
      data: { stage: 'Disqualified' },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  if (body.action === 'bulk_assign') {
    const { ids, ownerId } = body;
    await ctx.db.lead.updateMany({
      where: { id: { in: ids } },
      data: { ownerId },
    });
    return NextResponse.json({ data: { processed: ids.length } });
  }

  return badRequest('Invalid action');
});
