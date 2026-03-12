import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptSignal } from '@/lib/adapters';
import { auth } from '@/lib/auth';

// ── GET /api/signals ─────────────────────────────
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get('type');
  const where: any = { status: { not: 'dismissed' } };
  if (filter && filter !== 'all') where.type = filter;

  const signals = await db.signal.findMany({ where, orderBy: { detectedAt: 'desc' } });
  return NextResponse.json({ data: signals.map(adaptSignal) });
}

// ── POST /api/signals (dismiss, convert) ─────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { action, id, company, type, country } = body;

  if (action === 'dismiss') {
    const signal = await db.signal.update({ where: { id }, data: { status: 'dismissed' } });
    return NextResponse.json({ data: adaptSignal(signal) });
  }

  if (action === 'convert') {
    // Check for duplicates
    const dup = await db.lead.findFirst({ where: { company: { equals: company, mode: 'insensitive' } } });
    if (dup) return NextResponse.json({ error: `Lead "${dup.company}" already exists` }, { status: 409 });
    const dupAcc = await db.account.findFirst({ where: { name: { equals: company, mode: 'insensitive' } } });
    if (dupAcc) return NextResponse.json({ error: `Account "${dupAcc.name}" already exists` }, { status: 409 });

    const signal = await db.signal.update({ where: { id }, data: { status: 'converted' } });
    const lead = await db.lead.create({
      data: {
        company,
        source: 'Signal',
        signalId: id,
        type: type || 'Unknown',
        country: country || '',
        stage: 'New',
        pain: signal.summary,
        scoreFit: 50,
        scoreIntent: Math.round(signal.relevance * 0.7),
        scoreUrgency: Math.round(signal.relevance * 0.6),
        scoreAccess: 20,
        scoreCommercial: 50,
        confidence: signal.confidence,
        ownerId: session.user.id,
      },
    });
    return NextResponse.json({ data: { signal: adaptSignal(signal), lead } }, { status: 201 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
