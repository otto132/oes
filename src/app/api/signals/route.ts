import { NextRequest, NextResponse } from 'next/server';
import { Prisma, AccountType, type SignalType } from '@prisma/client';
import { db } from '@/lib/db';
import { adaptSignal } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { signalActionSchema } from '@/lib/schemas/signals';
import { conflict, badRequest } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';

// ── GET /api/signals ─────────────────────────────
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get('type');
  const where: Prisma.SignalWhereInput = { status: { not: 'dismissed' } };
  if (filter && filter !== 'all') where.type = filter as SignalType;

  const pagination = parsePagination(req);

  const signals = await db.signal.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(signals, pagination.limit);
  return NextResponse.json({ data: data.map(adaptSignal), meta });
}

// ── POST /api/signals (dismiss, convert) ─────────
export const POST = withHandler(signalActionSchema, async (req, ctx) => {
  const body = ctx.body;

  if (body.action === 'dismiss') {
    const signal = await db.signal.update({ where: { id: body.id }, data: { status: 'dismissed' } });
    return NextResponse.json({ data: adaptSignal(signal) });
  }

  if (body.action === 'convert') {
    const { id, company, type, country } = body;
    // Check for duplicates
    const dup = await db.lead.findFirst({ where: { company: { equals: company, mode: 'insensitive' } } });
    if (dup) return conflict(`Lead "${dup.company}" already exists`);
    const dupAcc = await db.account.findFirst({ where: { name: { equals: company, mode: 'insensitive' } } });
    if (dupAcc) return conflict(`Account "${dupAcc.name}" already exists`);

    const signal = await db.signal.update({ where: { id }, data: { status: 'converted' } });
    const lead = await db.lead.create({
      data: {
        company,
        source: 'Signal',
        signalId: id,
        type: (type || 'Unknown') as AccountType,
        country: country || '',
        stage: 'New',
        pain: signal.summary,
        scoreFit: 50,
        scoreIntent: Math.round(signal.relevance * 0.7),
        scoreUrgency: Math.round(signal.relevance * 0.6),
        scoreAccess: 20,
        scoreCommercial: 50,
        confidence: signal.confidence,
        ownerId: ctx.session.user.id,
      },
    });
    return NextResponse.json({ data: { signal: adaptSignal(signal), lead } }, { status: 201 });
  }

  return badRequest('Invalid action');
});
